const Block = require('./block');
const Transaction = require('./transaction');
const BlockchainStorage = require('./storage');
const crypto = require('crypto-js');
const EventEmitter = require('events');

/**
 * ブロックチェーンクラス
 */
class Blockchain extends EventEmitter {
  /**
   * ブロックチェーンを初期化する
   * @param {string} dataDir - データディレクトリのパス
   */
  constructor(dataDir = './data') {
    super();
    this.storage = new BlockchainStorage(`${dataDir}/chaindata`);
    this.chain = [];
    this.pendingTransactions = [];
    this.blocksByHash = new Map();
    this.difficulty = 2;
    this.miningReward = 100;
    this.validators = new Map(); // address -> stake amount
    this.minStake = 1000; // Minimum stake to become a validator
    this.blockTime = 10000; // Target block time in milliseconds (10 seconds)
    this.maxTransactionsPerBlock = 1000; // Maximum transactions per block
    
    // 初期化（非同期）
    this.initialized = this.initialize();
  }

  /**
   * ブロックチェーンを初期化する
   * @returns {boolean} 初期化が成功した場合はtrue
   */
  async initialize() {
    try {
      // ストレージからブロックチェーンデータを読み込む
      const latestBlock = await this.storage.getLatestBlock();
      
      if (!latestBlock) {
        // ブロックチェーンが存在しない場合は新しく作成
        const genesisBlock = this.createGenesisBlock();
        this.chain = [genesisBlock];
        this.blocksByHash.set(genesisBlock.hash, genesisBlock);
        await this.storage.saveBlock(genesisBlock);
      } else {
        // 既存のブロックチェーンを読み込む
        const height = await this.storage.getBlockHeight();
        this.chain = [];
        
        for (let i = 0; i <= height; i++) {
          const block = await this.storage.getBlockByIndex(i);
          if (block) {
            this.chain.push(block);
            this.blocksByHash.set(block.hash, block);
          }
        }
      }
      
      // 保留中のトランザクションを読み込む
      this.pendingTransactions = await this.storage.getPendingTransactions() || [];
      
      // バリデーターを読み込む
      this.validators = await this.storage.getValidators() || new Map();
      
      console.log(`ブロックチェーンが ${this.chain.length} ブロックで初期化されました`);
      this.emit('initialized', this.chain.length);
      return true;
    } catch (error) {
      console.error('ブロックチェーンの初期化に失敗しました:', error);
      // 初期化に失敗した場合はジェネシスブロックで開始
      const genesisBlock = this.createGenesisBlock();
      this.chain = [genesisBlock];
      this.blocksByHash.set(genesisBlock.hash, genesisBlock);
      await this.storage.saveBlock(genesisBlock);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * ジェネシスブロックを作成する
   * @returns {Block} ジェネシスブロック
   */
  createGenesisBlock() {
    const genesisBlock = new Block(0, Date.now(), [], '0', 'genesis');
    genesisBlock.hash = genesisBlock.calculateHash();
    genesisBlock.references = [];
    return genesisBlock;
  }

  /**
   * 最新のブロックを取得する
   * @returns {Block} 最新のブロック
   */
  async getLatestBlock() {
    // 初期化が完了するまで待機
    await this.initialized;
    return this.chain[this.chain.length - 1];
  }

  /**
   * ハッシュからブロックを取得する
   * @param {string} hash - ブロックのハッシュ
   * @returns {Block|null} 取得したブロック、存在しない場合はnull
   */
  async getBlockByHash(hash) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    // メモリキャッシュをチェック
    if (this.blocksByHash.has(hash)) {
      return this.blocksByHash.get(hash);
    }
    
    // ストレージから取得
    const block = await this.storage.getBlockByHash(hash);
    if (block) {
      this.blocksByHash.set(hash, block);
    }
    return block;
  }

  /**
   * インデックスからブロックを取得する
   * @param {number} index - ブロックのインデックス
   * @returns {Block|null} 取得したブロック、存在しない場合はnull
   */
  async getBlockByIndex(index) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    if (index >= 0 && index < this.chain.length) {
      return this.chain[index];
    }
    
    // ストレージから取得
    return await this.storage.getBlockByIndex(index);
  }

  /**
   * バリデーターを追加する
   * @param {string} address - バリデーターのアドレス
   * @param {number} stake - ステーク量
   */
  async addValidator(address, stake) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    if (stake < this.minStake) {
      throw new Error(`最小ステーク量は ${this.minStake} です`);
    }
    
    this.validators.set(address, stake);
    await this.storage.saveValidators(this.validators);
    this.emit('validator-added', { address, stake });
  }

  /**
   * バリデーターを削除する
   * @param {string} address - バリデーターのアドレス
   */
  async removeValidator(address) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    this.validators.delete(address);
    await this.storage.saveValidators(this.validators);
    this.emit('validator-removed', address);
  }

  /**
   * バリデーターをランダムに選択する
   * @returns {string|null} 選択されたバリデーターのアドレス
   */
  selectValidator() {
    // Weighted random selection based on stake
    const validators = Array.from(this.validators.entries());
    if (validators.length === 0) return null;
    
    const totalStake = validators.reduce((sum, [_, stake]) => sum + stake, 0);
    let random = Math.random() * totalStake;
    
    for (const [address, stake] of validators) {
      random -= stake;
      if (random <= 0) {
        return address;
      }
    }
    
    return validators[0][0]; // Fallback
  }

  /**
   * トランザクションを追加する
   * @param {Transaction} transaction - 追加するトランザクション
   * @returns {boolean} 追加が成功した場合はtrue
   */
  async addTransaction(transaction) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    if (!transaction.fromAddress || !transaction.toAddress) {
      throw new Error('トランザクションには送信元と送信先のアドレスが必要です');
    }

    if (!transaction.isValid()) {
      throw new Error('無効なトランザクションはチェーンに追加できません');
    }
    
    // システムトランザクション（マイニング報酬など）以外の場合は残高チェック
    if (transaction.fromAddress !== null && 
        transaction.fromAddress !== 'genesis' && 
        transaction.fromAddress !== 'system') {
      const balance = await this.getBalanceOfAddress(transaction.fromAddress);
      if (transaction.amount > balance) {
        throw new Error('残高不足です');
      }
    }

    this.pendingTransactions.push(transaction);
    
    // トランザクションをストレージに保存
    await this.storage.saveTransaction(transaction);
    await this.storage.savePendingTransactions(this.pendingTransactions);
    
    this.emit('transaction-added', transaction);
    return true;
  }

  /**
   * シャードIDに基づいてトランザクションを取得する
   * @param {number} shardId - シャードID
   * @returns {Array} トランザクションの配列
   */
  getTransactionsForShard(shardId) {
    return this.pendingTransactions.filter(tx => tx.shardId === shardId);
  }

  /**
   * 保留中のトランザクションをマイニングする
   * @param {string} minerAddress - マイナーのアドレス
   * @returns {Array} 新しく作成されたブロックの配列
   */
  async minePendingTransactions(minerAddress) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    // バリデーターを選択
    const validator = this.selectValidator();
    if (!validator) {
      throw new Error('利用可能なバリデーターがありません');
    }

    // シャードごとにトランザクションをグループ化
    const shards = new Map();
    for (let i = 0; i < 16; i++) {
      shards.set(i, this.getTransactionsForShard(i));
    }

    const newBlocks = [];

    // 各シャードを処理
    for (const [shardId, transactions] of shards.entries()) {
      if (transactions.length === 0) continue;

      // トランザクション数が多すぎる場合は分割
      const chunks = [];
      for (let i = 0; i < transactions.length; i += this.maxTransactionsPerBlock) {
        chunks.push(transactions.slice(i, i + this.maxTransactionsPerBlock));
      }

      for (const chunk of chunks) {
        const latestBlock = await this.getLatestBlock();
        const block = new Block(
          this.chain.length,
          Date.now(),
          chunk,
          latestBlock.hash,
          validator
        );

        // Add references to recent blocks (DAG structure)
        const recentBlocks = this.chain.slice(-5);
        for (const recentBlock of recentBlocks) {
          block.addReference(recentBlock.hash);
        }

        // Proof of Work (for additional security)
        await this.mineBlock(block, this.difficulty);

        this.chain.push(block);
        this.blocksByHash.set(block.hash, block);
        newBlocks.push(block);

        // ブロックをストレージに保存
        await this.storage.saveBlock(block);

        // 処理されたトランザクションを保留中から削除
        this.pendingTransactions = this.pendingTransactions.filter(
          tx => !chunk.includes(tx)
        );
        
        // 処理されたトランザクションの残高を更新
        for (const tx of chunk) {
          if (tx.fromAddress && 
              tx.fromAddress !== 'genesis' && 
              tx.fromAddress !== 'system') {
            const fromBalance = await this.storage.getAccountBalance(tx.fromAddress);
            await this.storage.saveAccountState(tx.fromAddress, fromBalance - tx.amount);
          }
          
          const toBalance = await this.storage.getAccountBalance(tx.toAddress);
          await this.storage.saveAccountState(tx.toAddress, toBalance + tx.amount);
        }
      }
    }

    // マイニング報酬トランザクションを追加
    const rewardTx = new Transaction(null, minerAddress, this.miningReward);
    this.pendingTransactions.push(rewardTx);
    
    // 保留中のトランザクションを更新
    await this.storage.savePendingTransactions(this.pendingTransactions);
    await this.storage.saveTransaction(rewardTx);
    
    // マイナーの残高を更新
    const minerBalance = await this.storage.getAccountBalance(minerAddress);
    await this.storage.saveAccountState(minerAddress, minerBalance + this.miningReward);
    
    // 難易度を調整
    this.adjustDifficulty();
    
    this.emit('blocks-mined', newBlocks);
    return newBlocks;
  }

  /**
   * ブロックをマイニングする（Proof of Work）
   * @param {Block} block - マイニングするブロック
   * @param {number} difficulty - 難易度
   */
  async mineBlock(block, difficulty) {
    const target = Array(difficulty + 1).join('0');
    
    while (block.hash.substring(0, difficulty) !== target) {
      block.nonce++;
      block.hash = block.calculateHash();
      
      // 計算負荷を分散するために少し待機
      if (block.nonce % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    console.log(`ブロック ${block.index} がマイニングされました: ${block.hash}`);
  }

  /**
   * 難易度を調整する
   */
  adjustDifficulty() {
    if (this.chain.length < 10) return; // 十分なブロックがない場合は調整しない
    
    const lastTenBlocks = this.chain.slice(-10);
    const firstBlock = lastTenBlocks[0];
    const lastBlock = lastTenBlocks[lastTenBlocks.length - 1];
    
    const timeSpan = lastBlock.timestamp - firstBlock.timestamp;
    const averageBlockTime = timeSpan / (lastTenBlocks.length - 1);
    
    if (averageBlockTime < this.blockTime * 0.5) {
      // ブロック生成が速すぎる場合は難易度を上げる
      this.difficulty++;
    } else if (averageBlockTime > this.blockTime * 1.5) {
      // ブロック生成が遅すぎる場合は難易度を下げる
      this.difficulty = Math.max(1, this.difficulty - 1);
    }
  }

  /**
   * ブロックチェーンが有効かどうかを検証する
   * @returns {boolean} ブロックチェーンが有効な場合はtrue
   */
  async isChainValid() {
    // 初期化が完了するまで待機
    await this.initialized;
    
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (!currentBlock.isValid()) {
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }
    return true;
  }

  /**
   * アドレスの残高を取得する
   * @param {string} address - アドレス
   * @returns {number} アドレスの残高
   */
  async getBalanceOfAddress(address) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    // ストレージから残高を取得
    return await this.storage.getAccountBalance(address);
  }
  
  /**
   * 全てのウォレットを取得する
   * @returns {Array} ウォレットの配列
   */
  async getAllWallets() {
    // 初期化が完了するまで待機
    await this.initialized;
    
    return await this.storage.getAllWallets();
  }
  
  /**
   * ウォレットを保存する
   * @param {string} name - ウォレットの名前
   * @param {Object} wallet - ウォレットオブジェクト
   * @returns {boolean} 保存が成功した場合はtrue
   */
  async saveWallet(name, wallet) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    return await this.storage.saveWallet(name, wallet);
  }
  
  /**
   * ウォレットを取得する
   * @param {string} name - ウォレットの名前
   * @returns {Object|null} ウォレットオブジェクト、存在しない場合はnull
   */
  async getWallet(name) {
    // 初期化が完了するまで待機
    await this.initialized;
    
    return await this.storage.getWallet(name);
  }
  
  /**
   * ブロックチェーンの統計情報を取得する
   * @returns {Object} 統計情報
   */
  async getStats() {
    // 初期化が完了するまで待機
    await this.initialized;
    
    const blockCount = this.chain.length;
    const pendingTxCount = this.pendingTransactions.length;
    const validatorCount = this.validators.size;
    
    let totalTransactions = 0;
    for (const block of this.chain) {
      totalTransactions += block.transactions.length;
    }
    
    const lastBlock = this.chain[this.chain.length - 1];
    
    return {
      blockCount,
      totalTransactions,
      pendingTransactions: pendingTxCount,
      validatorCount,
      difficulty: this.difficulty,
      lastBlockTime: lastBlock ? lastBlock.timestamp : 0,
      averageBlockTime: this.calculateAverageBlockTime()
    };
  }
  
  /**
   * 平均ブロック生成時間を計算する
   * @returns {number} 平均ブロック生成時間（ミリ秒）
   */
  calculateAverageBlockTime() {
    if (this.chain.length < 2) return 0;
    
    const recentBlocks = this.chain.slice(-Math.min(100, this.chain.length));
    let totalTime = 0;
    
    for (let i = 1; i < recentBlocks.length; i++) {
      totalTime += recentBlocks[i].timestamp - recentBlocks[i-1].timestamp;
    }
    
    return totalTime / (recentBlocks.length - 1);
  }
  
  /**
   * データベースを閉じる
   */
  async close() {
    await this.storage.close();
  }
}

module.exports = Blockchain;