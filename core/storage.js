const { Level } = require('level');
const fs = require('fs');
const path = require('path');
const Block = require('./block');
const Transaction = require('./transaction');

/**
 * ブロックチェーンデータの永続化ストレージクラス
 */
class BlockchainStorage {
  /**
   * ストレージを初期化する
   * @param {string} dbPath - データベースのパス
   */
  constructor(dbPath = './data/chaindata') {
    // データベースディレクトリが存在しない場合は作成
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
    }
    
    this.db = new Level(dbPath, { valueEncoding: 'json' });
    this.blocksBucket = this.db.sublevel('blocks');
    this.txBucket = this.db.sublevel('transactions');
    this.stateBucket = this.db.sublevel('state');
    this.metadataBucket = this.db.sublevel('metadata');
  }

  /**
   * ブロックを保存する
   * @param {Block} block - 保存するブロック
   * @returns {boolean} 保存が成功した場合はtrue
   */
  async saveBlock(block) {
    try {
      await this.blocksBucket.put(block.hash, block.toJSON());
      await this.metadataBucket.put('latestBlockHash', block.hash);
      
      if (block.index > 0) {
        await this.metadataBucket.put('blockHeight', block.index);
      }
      
      // インデックスによるブロック検索のためのマッピングを保存
      await this.blocksBucket.put(`index:${block.index}`, block.hash);
      
      return true;
    } catch (error) {
      console.error('ブロックの保存エラー:', error);
      return false;
    }
  }

  /**
   * ハッシュからブロックを取得する
   * @param {string} hash - ブロックのハッシュ
   * @returns {Block|null} 取得したブロック、存在しない場合はnull
   */
  async getBlockByHash(hash) {
    try {
      const blockData = await this.blocksBucket.get(hash);
      return Block.fromJSON(blockData);
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * インデックスからブロックを取得する
   * @param {number} index - ブロックのインデックス
   * @returns {Block|null} 取得したブロック、存在しない場合はnull
   */
  async getBlockByIndex(index) {
    try {
      const hash = await this.blocksBucket.get(`index:${index}`);
      return await this.getBlockByHash(hash);
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 最新のブロックを取得する
   * @returns {Block|null} 最新のブロック、存在しない場合はnull
   */
  async getLatestBlock() {
    try {
      const latestBlockHash = await this.metadataBucket.get('latestBlockHash');
      return await this.getBlockByHash(latestBlockHash);
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * ブロックチェーンの高さを取得する
   * @returns {number} ブロックチェーンの高さ
   */
  async getBlockHeight() {
    try {
      return parseInt(await this.metadataBucket.get('blockHeight')) || 0;
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return 0;
      }
      throw error;
    }
  }

  /**
   * トランザクションを保存する
   * @param {Transaction} tx - 保存するトランザクション
   * @returns {boolean} 保存が成功した場合はtrue
   */
  async saveTransaction(tx) {
    try {
      await this.txBucket.put(tx.hash, tx.toJSON());
      return true;
    } catch (error) {
      console.error('トランザクションの保存エラー:', error);
      return false;
    }
  }

  /**
   * トランザクションを取得する
   * @param {string} hash - トランザクションのハッシュ
   * @returns {Transaction|null} 取得したトランザクション、存在しない場合はnull
   */
  async getTransaction(hash) {
    try {
      const txData = await this.txBucket.get(hash);
      return Transaction.fromJSON(txData);
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 保留中のトランザクションを保存する
   * @param {Array} transactions - 保留中のトランザクション配列
   * @returns {boolean} 保存が成功した場合はtrue
   */
  async savePendingTransactions(transactions) {
    try {
      const txsJSON = transactions.map(tx => tx.toJSON());
      await this.metadataBucket.put('pendingTransactions', txsJSON);
      return true;
    } catch (error) {
      console.error('保留中トランザクションの保存エラー:', error);
      return false;
    }
  }

  /**
   * 保留中のトランザクションを取得する
   * @returns {Array} 保留中のトランザクション配列
   */
  async getPendingTransactions() {
    try {
      const txsJSON = await this.metadataBucket.get('pendingTransactions');
      if (Array.isArray(txsJSON)) {
        return txsJSON.map(txData => Transaction.fromJSON(txData));
      }
      return [];
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return [];
      }
      throw error;
    }
  }

  /**
   * アカウントの残高を保存する
   * @param {string} address - アカウントのアドレス
   * @param {number} balance - 残高
   * @returns {boolean} 保存が成功した場合はtrue
   */
  async saveAccountState(address, balance) {
    try {
      await this.stateBucket.put(`balance:${address}`, balance);
      return true;
    } catch (error) {
      console.error('アカウント状態の保存エラー:', error);
      return false;
    }
  }

  /**
   * アカウントの残高を取得する
   * @param {string} address - アカウントのアドレス
   * @returns {number} アカウントの残高
   */
  async getAccountBalance(address) {
    try {
      return parseFloat(await this.stateBucket.get(`balance:${address}`)) || 0;
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return 0;
      }
      throw error;
    }
  }

  /**
   * バリデーターを保存する
   * @param {Map} validators - バリデーターのマップ
   * @returns {boolean} 保存が成功した場合はtrue
   */
  async saveValidators(validators) {
    try {
      await this.metadataBucket.put('validators', Array.from(validators.entries()));
      return true;
    } catch (error) {
      console.error('バリデーターの保存エラー:', error);
      return false;
    }
  }

  /**
   * バリデーターを取得する
   * @returns {Map} バリデーターのマップ
   */
  async getValidators() {
    try {
      const validatorsArray = await this.metadataBucket.get('validators');
      // 配列が存在し、かつ配列である場合のみMapに変換
      if (validatorsArray && Array.isArray(validatorsArray)) {
        return new Map(validatorsArray);
      }
      return new Map();
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return new Map();
      }
      throw error;
    }
  }

  /**
   * スマートコントラクトを保存する
   * @param {string} address - コントラクトのアドレス
   * @param {Object} contract - コントラクトオブジェクト
   * @returns {boolean} 保存が成功した場合はtrue
   */
  async saveContract(address, contract) {
    try {
      await this.stateBucket.put(`contract:${address}`, contract);
      return true;
    } catch (error) {
      console.error('コントラクトの保存エラー:', error);
      return false;
    }
  }

  /**
   * スマートコントラクトを取得する
   * @param {string} address - コントラクトのアドレス
   * @returns {Object|null} コントラクトオブジェクト、存在しない場合はnull
   */
  async getContract(address) {
    try {
      return await this.stateBucket.get(`contract:${address}`);
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * コントラクトの状態を保存する
   * @param {string} contractAddress - コントラクトのアドレス
   * @param {string} key - 状態のキー
   * @param {*} value - 状態の値
   * @returns {boolean} 保存が成功した場合はtrue
   */
  async saveContractState(contractAddress, key, value) {
    try {
      await this.stateBucket.put(`contractState:${contractAddress}:${key}`, value);
      return true;
    } catch (error) {
      console.error('コントラクト状態の保存エラー:', error);
      return false;
    }
  }

  /**
   * コントラクトの状態を取得する
   * @param {string} contractAddress - コントラクトのアドレス
   * @param {string} key - 状態のキー
   * @returns {*} 状態の値
   */
  async getContractState(contractAddress, key) {
    try {
      return await this.stateBucket.get(`contractState:${contractAddress}:${key}`);
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * コントラクトの全状態を取得する
   * @param {string} contractAddress - コントラクトのアドレス
   * @returns {Object} コントラクトの全状態
   */
  async getAllContractState(contractAddress) {
    const state = {};
    try {
      for await (const [key, value] of this.stateBucket.iterator({
        gte: `contractState:${contractAddress}:`,
        lte: `contractState:${contractAddress}:\uffff`
      })) {
        const stateKey = key.split(':')[2];
        state[stateKey] = value;
      }
      return state;
    } catch (error) {
      console.error('コントラクト全状態の取得エラー:', error);
      return {};
    }
  }

  /**
   * ウォレットを保存する
   * @param {string} name - ウォレットの名前
   * @param {Object} wallet - ウォレットオブジェクト
   * @returns {boolean} 保存が成功した場合はtrue
   */
  async saveWallet(name, wallet) {
    try {
      await this.stateBucket.put(`wallet:${name}`, {
        publicKey: wallet.publicKey,
        privateKey: wallet.privateKey
      });
      return true;
    } catch (error) {
      console.error('ウォレットの保存エラー:', error);
      return false;
    }
  }

  /**
   * ウォレットを取得する
   * @param {string} name - ウォレットの名前
   * @returns {Object|null} ウォレットオブジェクト、存在しない場合はnull
   */
  async getWallet(name) {
    try {
      return await this.stateBucket.get(`wallet:${name}`);
    } catch (error) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 全てのウォレットを取得する
   * @returns {Array} ウォレットオブジェクトの配列
   */
  async getAllWallets() {
    const wallets = [];
    try {
      for await (const [key, value] of this.stateBucket.iterator({
        gte: 'wallet:',
        lte: 'wallet:\uffff'
      })) {
        const name = key.split(':')[1];
        wallets.push({ name, ...value });
      }
      return wallets;
    } catch (error) {
      console.error('全ウォレットの取得エラー:', error);
      return [];
    }
  }

  /**
   * データベースを閉じる
   */
  async close() {
    await this.db.close();
  }
}

module.exports = BlockchainStorage;