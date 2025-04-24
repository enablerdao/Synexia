const Block = require('./block');
const Transaction = require('./transaction');
const BlockchainStorage = require('./storage');
const CacheManager = require('./cache');
const BatchProcessor = require('./batch-processor');
const crypto = require('crypto');
const { EventEmitter } = require('events');

/**
 * 最適化されたブロックチェーンクラス
 */
class OptimizedBlockchain extends EventEmitter {
  /**
   * ブロックチェーンを初期化する
   * @param {string} dataDir - データディレクトリのパス
   */
  constructor(dataDir) {
    super();
    this.chain = [];
    this.pendingTransactions = [];
    this.validators = new Map(); // address -> stake amount
    this.miningReward = 100;
    this.minStake = 1000;
    this.difficulty = 2;
    this.storage = new BlockchainStorage(dataDir);
    
    // キャッシュマネージャーを初期化
    this.cache = new CacheManager({
      maxSize: 10000,
      ttl: 30 * 60 * 1000 // 30分
    });
    
    // トランザクションバッチプロセッサーを初期化
    this.transactionBatchProcessor = new BatchProcessor({
      batchSize: 50,
      batchInterval: 2000, // 2秒
      processBatch: this.processTxBatch.bind(this)
    });
    
    // 初期化プロセスを開始
    this.initialized = this.initialize();
  }
  
  /**
   * ブロックチェーンを初期化する
   * @private
   */
  async initialize() {
    try {
      // ストレージからチェーンを読み込む
      const storedChain = await this.storage.getChain();
      
      if (storedChain.length === 0) {
        // ジェネシスブロックを作成
        await this.createGenesisBlock();
      } else {
        this.chain = storedChain;
        console.log(`ブロックチェーンが ${this.chain.length} ブロックで初期化されました`);
      }
      
      // 保留中のトランザクションを読み込む
      this.pendingTransactions = await this.storage.getPendingTransactions();
      
      // バリデーターを読み込む
      const validators = await this.storage.getValidators();
      this.validators = new Map(validators);
      
      return true;
    } catch (error) {
      console.error('ブロックチェーンの初期化に失敗しました:', error);
      throw error;
    }
  }
  
  /**
   * ジェネシスブロックを作成する
   * @private
   */
  async createGenesisBlock() {
    const genesisBlock = new Block(
      0,
      Date.now(),
      [],
      '0',
      'genesis'
    );
    
    genesisBlock.hash = genesisBlock.calculateHash();
    this.chain.push(genesisBlock);
    
    // ジェネシスブロックを保存
    await this.storage.saveBlock(genesisBlock);
    await this.storage.saveChain(this.chain);
    
    console.log('ジェネシスブロックが作成されました');
  }
  
  /**
   * 最新のブロックを取得する
   * @returns {Block} 最新のブロック
   */
  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }
  
  /**
   * インデックスからブロックを取得する
   * @param {number} index - ブロックインデックス
   * @returns {Block} ブロック
   */
  async getBlockByIndex(index) {
    // キャッシュをチェック
    const cacheKey = `block:index:${index}`;
    const cachedBlock = this.cache.get(cacheKey);
    
    if (cachedBlock) {
      return cachedBlock;
    }
    
    // ストレージから取得
    const block = await this.storage.getBlockByIndex(index);
    
    if (block) {
      // キャッシュに保存
      this.cache.set(cacheKey, block);
    }
    
    return block;
  }
  
  /**
   * ハッシュからブロックを取得する
   * @param {string} hash - ブロックハッシュ
   * @returns {Block} ブロック
   */
  async getBlockByHash(hash) {
    // キャッシュをチェック
    const cacheKey = `block:hash:${hash}`;
    const cachedBlock = this.cache.get(cacheKey);
    
    if (cachedBlock) {
      return cachedBlock;
    }
    
    // ストレージから取得
    const block = await this.storage.getBlockByHash(hash);
    
    if (block) {
      // キャッシュに保存
      this.cache.set(cacheKey, block);
    }
    
    return block;
  }
  
  /**
   * トランザクションを追加する
   * @param {Transaction} transaction - 追加するトランザクション
   * @returns {Promise} 処理が完了したときに解決されるPromise
   */
  async addTransaction(transaction) {
    // バッチプロセッサーにトランザクションを追加
    return this.transactionBatchProcessor.enqueue(transaction);
  }
  
  /**
   * トランザクションバッチを処理する
   * @param {Transaction[]} transactions - 処理するトランザクションの配列
   * @returns {Promise<boolean[]>} 各トランザクションの処理結果
   * @private
   */
  async processTxBatch(transactions) {
    const results = [];
    
    for (const transaction of transactions) {
      try {
        // トランザクションを検証
        if (!transaction.isValid()) {
          console.error('無効なトランザクション:', transaction);
          results.push(false);
          continue;
        }
        
        // 残高を確認
        const balance = await this.getBalanceOfAddress(transaction.fromAddress);
        
        if (transaction.fromAddress !== 'genesis' && transaction.fromAddress !== 'System' && balance < transaction.amount) {
          console.error(`残高不足: ${transaction.fromAddress} の残高は ${balance} ですが、${transaction.amount} が必要です`);
          results.push(false);
          continue;
        }
        
        // 保留中のトランザクションに追加
        this.pendingTransactions.push(transaction);
        
        // トランザクションを保存
        await this.storage.saveTransaction(transaction);
        
        // 保留中のトランザクションを保存
        await this.storage.savePendingTransactions(this.pendingTransactions);
        
        // イベントを発行
        this.emit('transactionAdded', transaction);
        
        results.push(true);
      } catch (error) {
        console.error('トランザクション処理エラー:', error);
        results.push(false);
      }
    }
    
    return results;
  }
  
  /**
   * 保留中のトランザクションをマイニングする
   * @param {string} rewardAddress - マイニング報酬の送信先アドレス
   * @returns {Promise<Block[]>} 作成されたブロックの配列
   */
  async minePendingTransactions(rewardAddress) {
    // バッチプロセッサーをフラッシュして、すべての保留中のトランザクションを処理
    await this.transactionBatchProcessor.flush();
    
    // バリデーターが存在するか確認
    if (this.validators.size === 0) {
      throw new Error('利用可能なバリデーターがありません');
    }
    
    // バリデーターを選択
    const validator = this.selectValidator();
    
    // 報酬トランザクションを作成
    const rewardTx = new Transaction(
      'System',
      rewardAddress,
      this.miningReward,
      ''
    );
    
    this.pendingTransactions.push(rewardTx);
    
    // 新しいブロックを作成
    const newBlock = new Block(
      this.chain.length,
      Date.now(),
      this.pendingTransactions,
      this.getLatestBlock().hash,
      validator
    );
    
    // ブロックをマイニング
    await this.mineBlock(newBlock);
    
    // チェーンに追加
    this.chain.push(newBlock);
    
    // ブロックを保存
    await this.storage.saveBlock(newBlock);
    await this.storage.saveChain(this.chain);
    
    // キャッシュに保存
    this.cache.set(`block:index:${newBlock.index}`, newBlock);
    this.cache.set(`block:hash:${newBlock.hash}`, newBlock);
    
    // 保留中のトランザクションをクリア
    this.pendingTransactions = [];
    await this.storage.savePendingTransactions(this.pendingTransactions);
    
    // イベントを発行
    this.emit('blockMined', newBlock);
    
    return [newBlock];
  }
  
  /**
   * バリデーターをランダムに選択する
   * @returns {string} 選択されたバリデーターのアドレス
   * @private
   */
  selectValidator() {
    // ステーク量に基づいて確率的に選択
    const validators = Array.from(this.validators.entries());
    const totalStake = validators.reduce((sum, [_, stake]) => sum + stake, 0);
    
    let random = Math.random() * totalStake;
    let cumulativeStake = 0;
    
    for (const [address, stake] of validators) {
      cumulativeStake += stake;
      if (random <= cumulativeStake) {
        return address;
      }
    }
    
    // フォールバック: 最初のバリデーターを返す
    return validators[0][0];
  }
  
  /**
   * ブロックをマイニングする
   * @param {Block} block - マイニングするブロック
   * @private
   */
  async mineBlock(block) {
    // PoSなので、実際のマイニングは不要
    // ハッシュを計算するだけ
    block.hash = block.calculateHash();
    return block;
  }
  
  /**
   * アドレスの残高を取得する
   * @param {string} address - アドレス
   * @returns {Promise<number>} 残高
   */
  async getBalanceOfAddress(address) {
    // キャッシュをチェック
    const cacheKey = `balance:${address}`;
    const cachedBalance = this.cache.get(cacheKey);
    
    if (cachedBalance !== null) {
      return cachedBalance;
    }
    
    // ストレージから残高を取得
    const balance = await this.storage.getAccountState(address);
    
    if (balance !== null) {
      // キャッシュに保存
      this.cache.set(cacheKey, balance);
      return balance;
    }
    
    // 残高が保存されていない場合は、チェーン全体をスキャン
    let calculatedBalance = 0;
    
    // すべてのブロックをスキャン
    for (const block of this.chain) {
      for (const tx of block.transactions) {
        if (tx.fromAddress === address) {
          calculatedBalance -= tx.amount;
        }
        
        if (tx.toAddress === address) {
          calculatedBalance += tx.amount;
        }
      }
    }
    
    // 保留中のトランザクションをスキャン
    for (const tx of this.pendingTransactions) {
      if (tx.fromAddress === address) {
        calculatedBalance -= tx.amount;
      }
      
      if (tx.toAddress === address) {
        calculatedBalance += tx.amount;
      }
    }
    
    // 残高を保存
    await this.storage.saveAccountState(address, calculatedBalance);
    
    // キャッシュに保存
    this.cache.set(cacheKey, calculatedBalance);
    
    return calculatedBalance;
  }
  
  /**
   * ウォレットを保存する
   * @param {string} name - ウォレット名
   * @param {Wallet} wallet - ウォレットオブジェクト
   */
  async saveWallet(name, wallet) {
    await this.storage.saveWallet(name, wallet);
  }
  
  /**
   * すべてのウォレットを取得する
   * @returns {Promise<Array>} ウォレットの配列
   */
  async getAllWallets() {
    return this.storage.getAllWallets();
  }
  
  /**
   * バリデーターを追加する
   * @param {string} address - バリデーターのアドレス
   * @param {number} stake - ステーク量
   */
  async addValidator(address, stake) {
    this.validators.set(address, stake);
    await this.storage.saveValidators(Array.from(this.validators.entries()));
    
    // イベントを発行
    this.emit('validatorAdded', { address, stake });
  }
  
  /**
   * バリデーターを削除する
   * @param {string} address - バリデーターのアドレス
   */
  async removeValidator(address) {
    this.validators.delete(address);
    await this.storage.saveValidators(Array.from(this.validators.entries()));
    
    // イベントを発行
    this.emit('validatorRemoved', address);
  }
  
  /**
   * ブロックチェーンの統計情報を取得する
   * @returns {Promise<Object>} 統計情報
   */
  async getStats() {
    // キャッシュをチェック
    const cacheKey = 'stats';
    const cachedStats = this.cache.get(cacheKey);
    
    if (cachedStats) {
      return cachedStats;
    }
    
    // 統計情報を計算
    let totalTransactions = 0;
    let totalValue = 0;
    
    for (const block of this.chain) {
      totalTransactions += block.transactions.length;
      
      for (const tx of block.transactions) {
        if (tx.fromAddress !== 'genesis' && tx.fromAddress !== 'System') {
          totalValue += tx.amount;
        }
      }
    }
    
    const stats = {
      blockCount: this.chain.length,
      transactionCount: totalTransactions,
      pendingTransactions: this.pendingTransactions.length,
      validatorCount: this.validators.size,
      totalValue,
      averageBlockTime: this.calculateAverageBlockTime(),
      cacheStats: this.cache.getStats(),
      batchProcessorStats: this.transactionBatchProcessor.getStats()
    };
    
    // キャッシュに保存（短い有効期限）
    this.cache.set(cacheKey, stats, 60 * 1000); // 1分
    
    return stats;
  }
  
  /**
   * 平均ブロック時間を計算する
   * @returns {number} 平均ブロック時間（秒）
   * @private
   */
  calculateAverageBlockTime() {
    if (this.chain.length < 3) {
      return 0;
    }
    
    let totalTime = 0;
    let count = 0;
    
    for (let i = 2; i < this.chain.length; i++) {
      const timeDiff = this.chain[i].timestamp - this.chain[i - 1].timestamp;
      totalTime += timeDiff;
      count++;
    }
    
    return count > 0 ? totalTime / count / 1000 : 0; // ミリ秒から秒に変換
  }
  
  /**
   * ブロックチェーンを検証する
   * @returns {boolean} 有効な場合はtrue
   */
  isChainValid() {
    // ジェネシスブロックをスキップ
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];
      
      // ハッシュを検証
      if (currentBlock.hash !== currentBlock.calculateHash()) {
        return false;
      }
      
      // 前のブロックへの参照を検証
      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
      
      // トランザクションを検証
      for (const tx of currentBlock.transactions) {
        if (!tx.isValid()) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * リソースを解放する
   */
  async close() {
    // バッチプロセッサーを解放
    this.transactionBatchProcessor.dispose();
    
    // キャッシュを解放
    this.cache.dispose();
    
    // ストレージを閉じる
    await this.storage.close();
  }
}

module.exports = OptimizedBlockchain;