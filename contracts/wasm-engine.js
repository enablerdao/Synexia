const crypto = require('crypto-js');
const Transaction = require('../core/transaction');
const EventEmitter = require('events');

/**
 * WASMコントラクトエンジンクラス
 */
class WasmEngine extends EventEmitter {
  /**
   * WASMエンジンを初期化する
   * @param {Object} blockchain - ブロックチェーンオブジェクト
   */
  constructor(blockchain) {
    super();
    this.blockchain = blockchain;
    this.contracts = new Map(); // address -> { code, state, owner }
    this.contractResults = new Map(); // txHash -> result
    this.initialized = this.initialize();
  }

  /**
   * WASMエンジンを初期化する
   * @returns {boolean} 初期化が成功した場合はtrue
   */
  async initialize() {
    try {
      // ブロックチェーンの初期化が完了するまで待機
      await this.blockchain.initialized;
      
      // ストレージからコントラクトを読み込む
      const contracts = await this.loadContractsFromStorage();
      if (contracts && contracts.length > 0) {
        for (const contract of contracts) {
          this.contracts.set(contract.address, {
            code: contract.code,
            state: contract.state || {},
            owner: contract.owner
          });
        }
        console.log(`${this.contracts.size} 個のコントラクトをストレージから読み込みました`);
      }
      
      this.emit('initialized', this.contracts.size);
      return true;
    } catch (error) {
      console.error('WASMエンジンの初期化に失敗しました:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * ストレージからコントラクトを読み込む
   * @returns {Array} コントラクトの配列
   */
  async loadContractsFromStorage() {
    try {
      const contracts = [];
      
      // ブロックチェーンをスキャンしてコントラクトデプロイトランザクションを探す
      for (const block of this.blockchain.chain) {
        if (block.transactions && Array.isArray(block.transactions)) {
          for (const tx of block.transactions) {
            if (tx.data === 'CONTRACT_DEPLOY' && tx.toAddress) {
              const contractAddress = tx.toAddress;
              const contract = await this.blockchain.storage.getContract(contractAddress);
              if (contract) {
                contracts.push({
                  address: contractAddress,
                  ...contract
                });
              }
            }
          }
        }
      }
      
      return contracts;
    } catch (error) {
      console.error('ストレージからのコントラクト読み込みエラー:', error);
      return [];
    }
  }

  /**
   * コントラクトをデプロイする
   * @param {string} code - コントラクトコード
   * @param {string} owner - コントラクト所有者のアドレス
   * @returns {string} コントラクトアドレス
   */
  async deployContract(code, owner) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    // コントラクトアドレスを生成
    const address = crypto.SHA256(
      code + owner + Date.now()
    ).toString();
    
    // コントラクトオブジェクトを作成
    const contract = {
      code,
      state: {},
      owner
    };
    
    // コントラクトをメモリに保存
    this.contracts.set(address, contract);
    
    // コントラクトをブロックチェーンストレージに保存
    await this.blockchain.storage.saveContract(address, contract);
    
    // コントラクトデプロイトランザクションを作成
    const tx = new Transaction(
      owner,
      address,
      0,
      'CONTRACT_DEPLOY'
    );
    
    // トランザクションをブロックチェーンに追加
    await this.blockchain.addTransaction(tx);
    
    this.emit('contract-deployed', { address, owner });
    return address;
  }

  /**
   * コントラクトを実行する
   * @param {string} contractAddress - コントラクトアドレス
   * @param {string} method - 実行するメソッド
   * @param {Object} params - メソッドのパラメータ
   * @param {string} caller - 呼び出し元のアドレス
   * @returns {Object} 実行結果
   */
  async executeContract(contractAddress, method, params, caller) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    // コントラクトをメモリまたはストレージから取得
    let contract = this.contracts.get(contractAddress);
    
    if (!contract) {
      // ストレージから読み込み
      contract = await this.blockchain.storage.getContract(contractAddress);
      
      if (!contract) {
        throw new Error('コントラクトが見つかりません');
      }
      
      // メモリにキャッシュ
      this.contracts.set(contractAddress, contract);
    }
    
    // 実際の実装ではWASMコードを実行
    // ここではより堅牢なモックで実行をシミュレート
    
    try {
      // ストレージからコントラクト状態を読み込む
      const storedState = await this.blockchain.storage.getAllContractState(contractAddress);
      if (storedState && Object.keys(storedState).length > 0) {
        contract.state = { ...storedState };
      }
      
      // 実行環境
      const env = {
        storage: {
          get: async (key) => {
            return await this.blockchain.storage.getContractState(contractAddress, key);
          },
          set: async (key, value) => {
            await this.blockchain.storage.saveContractState(contractAddress, key, value);
            contract.state[key] = value;
            return true;
          }
        },
        blockchain: {
          getBalance: async (addr) => await this.blockchain.getBalanceOfAddress(addr),
          getBlock: async (idx) => {
            if (idx < 0) return null;
            return await this.blockchain.getBlockByIndex(idx);
          },
          getCurrentHeight: async () => this.blockchain.chain.length - 1,
          getTransaction: async (hash) => await this.blockchain.storage.getTransaction(hash)
        },
        caller,
        params,
        contractAddress
      };
      
      // メソッドを実行
      let result;
      
      switch (method) {
        case 'transfer':
          result = await this.executeTransfer(contractAddress, params, env);
          break;
          
        case 'store':
          result = await this.executeStore(contractAddress, params, env);
          break;
          
        case 'get':
          result = await this.executeGet(contractAddress, params, env);
          break;
          
        default:
          // コントラクトコードからカスタムメソッドを実行
          result = await this.executeCustomMethod(contractAddress, method, params, env);
      }
      
      // トランザクションハッシュを生成
      const txHash = crypto.SHA256(
        contractAddress + method + JSON.stringify(params) + caller + Date.now()
      ).toString();
      
      // 結果を保存
      this.contractResults.set(txHash, result);
      
      // コントラクト実行トランザクションを作成
      const tx = new Transaction(
        caller,
        contractAddress,
        0,
        `CONTRACT_EXECUTE:${method}`
      );
      
      // トランザクションをブロックチェーンに追加
      await this.blockchain.addTransaction(tx);
      
      this.emit('contract-executed', { contractAddress, method, caller, result });
      return { txHash, result };
    } catch (error) {
      console.error(`コントラクト ${contractAddress}.${method} の実行エラー:`, error);
      return { error: error.message };
    }
  }

  /**
   * 転送メソッドを実行する
   * @param {string} contractAddress - コントラクトアドレス
   * @param {Object} params - メソッドのパラメータ
   * @param {Object} env - 実行環境
   * @returns {Object} 実行結果
   */
  async executeTransfer(contractAddress, params, env) {
    if (!params.to || !params.amount) {
      throw new Error('転送には宛先と金額が必要です');
    }
    
    const amount = parseInt(params.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('無効な金額です');
    }
    
    // コントラクトの残高が十分かチェック
    const contractBalance = await this.blockchain.getBalanceOfAddress(contractAddress);
    if (contractBalance < amount) {
      throw new Error('残高不足です');
    }
    
    // コントラクトから受信者へのトランザクションを作成
    const tx = new Transaction(
      contractAddress,
      params.to,
      amount,
      'CONTRACT_TRANSFER'
    );
    
    // トランザクションをブロックチェーンに追加
    await this.blockchain.addTransaction(tx);
    
    return { success: true, txHash: tx.hash };
  }

  /**
   * 保存メソッドを実行する
   * @param {string} contractAddress - コントラクトアドレス
   * @param {Object} params - メソッドのパラメータ
   * @param {Object} env - 実行環境
   * @returns {Object} 実行結果
   */
  async executeStore(contractAddress, params, env) {
    if (!params.key || params.value === undefined) {
      throw new Error('保存にはキーと値が必要です');
    }
    
    // コントラクト状態に値を保存
    await env.storage.set(params.key, params.value);
    
    return { success: true, key: params.key, value: params.value };
  }

  /**
   * 取得メソッドを実行する
   * @param {string} contractAddress - コントラクトアドレス
   * @param {Object} params - メソッドのパラメータ
   * @param {Object} env - 実行環境
   * @returns {Object} 実行結果
   */
  async executeGet(contractAddress, params, env) {
    if (!params.key) {
      throw new Error('取得にはキーが必要です');
    }
    
    // コントラクト状態から値を取得
    const value = await env.storage.get(params.key);
    
    return { success: true, key: params.key, value };
  }

  /**
   * カスタムメソッドを実行する
   * @param {string} contractAddress - コントラクトアドレス
   * @param {string} method - 実行するメソッド
   * @param {Object} params - メソッドのパラメータ
   * @param {Object} env - 実行環境
   * @returns {Object} 実行結果
   */
  async executeCustomMethod(contractAddress, method, params, env) {
    // 実際の実装ではコントラクトコードを解析して実行
    // ここでは一般的なメソッドをシミュレート
    
    const contract = this.contracts.get(contractAddress);
    
    // コントラクトコードからメソッドを見つける（非常に簡略化）
    const methodMatch = contract.code.match(new RegExp(`function\\s+${method}\\s*\\([^)]*\\)\\s*[^{]*{([^}]*)}`, 'i'));
    
    if (!methodMatch) {
      throw new Error(`メソッド ${method} がコントラクトに見つかりません`);
    }
    
    // 非常に簡略化された「実行」- メソッド本体に特定のキーワードが含まれているかチェック
    const methodBody = methodMatch[1];
    
    if (methodBody.includes('return true')) {
      return { success: true, method, params };
    } else if (methodBody.includes('return false')) {
      return { success: false, method, params };
    } else if (methodBody.includes('return')) {
      // 戻り値を抽出
      const returnMatch = methodBody.match(/return\s+["']([^"']*)["']/);
      if (returnMatch) {
        return { success: true, method, result: returnMatch[1] };
      }
    }
    
    return { success: true, method, executed: true };
  }

  /**
   * コントラクトの状態を取得する
   * @param {string} contractAddress - コントラクトアドレス
   * @returns {Object} コントラクトの状態
   */
  async getContractState(contractAddress) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    const contract = this.contracts.get(contractAddress);
    if (!contract) {
      const storedContract = await this.blockchain.storage.getContract(contractAddress);
      if (!storedContract) {
        throw new Error('コントラクトが見つかりません');
      }
      return storedContract.state || {};
    }
    
    // ストレージから状態を読み込む
    const storedState = await this.blockchain.storage.getAllContractState(contractAddress);
    return storedState || contract.state || {};
  }

  /**
   * コントラクトのコードを取得する
   * @param {string} contractAddress - コントラクトアドレス
   * @returns {string} コントラクトコード
   */
  async getContractCode(contractAddress) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    const contract = this.contracts.get(contractAddress);
    if (!contract) {
      const storedContract = await this.blockchain.storage.getContract(contractAddress);
      if (!storedContract) {
        throw new Error('コントラクトが見つかりません');
      }
      return storedContract.code;
    }
    
    return contract.code;
  }

  /**
   * コントラクトの所有者を取得する
   * @param {string} contractAddress - コントラクトアドレス
   * @returns {string} コントラクト所有者のアドレス
   */
  async getContractOwner(contractAddress) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    const contract = this.contracts.get(contractAddress);
    if (!contract) {
      const storedContract = await this.blockchain.storage.getContract(contractAddress);
      if (!storedContract) {
        throw new Error('コントラクトが見つかりません');
      }
      return storedContract.owner;
    }
    
    return contract.owner;
  }

  /**
   * コントラクト実行結果を取得する
   * @param {string} txHash - トランザクションハッシュ
   * @returns {Object} コントラクト実行結果
   */
  async getContractResult(txHash) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    return this.contractResults.get(txHash);
  }

  /**
   * 全てのコントラクトを取得する
   * @returns {Array} コントラクトの配列
   */
  async getAllContracts() {
    // 初期化が完了するまで待機
    await this.initialized;
    
    const contracts = [];
    
    for (const [address, contract] of this.contracts.entries()) {
      contracts.push({
        address,
        owner: contract.owner,
        codeSize: contract.code.length
      });
    }
    
    return contracts;
  }
}

module.exports = WasmEngine;