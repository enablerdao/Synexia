const ProofOfStake = require('./pos');
const DAG = require('./dag');
const crypto = require('crypto-js');
const EventEmitter = require('events');

/**
 * ハイブリッドコンセンサスクラス
 * PoSとDAGを組み合わせたコンセンサスメカニズム
 */
class HybridConsensus extends EventEmitter {
  /**
   * ハイブリッドコンセンサスを初期化する
   * @param {Object} blockchain - ブロックチェーンオブジェクト
   */
  constructor(blockchain) {
    super();
    this.blockchain = blockchain;
    this.pos = new ProofOfStake(blockchain);
    this.dag = new DAG();
    this.shards = new Map(); // shardId -> { transactions: [], validators: [] }
    this.shardCount = 16;
    this.initialized = false;
    
    // PoSイベントを転送
    this.pos.on('validator-added', (data) => this.emit('validator-added', data));
    this.pos.on('validator-removed', (address) => this.emit('validator-removed', address));
    this.pos.on('validator-slashed', (data) => this.emit('validator-slashed', data));
    this.pos.on('epoch-updated', (data) => this.emit('epoch-updated', data));
  }

  /**
   * ハイブリッドコンセンサスを初期化する
   * @returns {boolean} 初期化が成功した場合はtrue
   */
  async initialize() {
    try {
      // ブロックチェーンの初期化が完了するまで待機
      await this.blockchain.initialized;
      
      // PoSを初期化
      await this.pos.initialize();
      
      // シャードを初期化
      for (let i = 0; i < this.shardCount; i++) {
        this.shards.set(i, {
          transactions: [],
          validators: []
        });
      }
      
      // ジェネシスブロックをDAGに追加
      const genesisBlock = await this.blockchain.getBlockByIndex(0);
      if (genesisBlock) {
        this.dag.addVertex(genesisBlock);
      }
      
      // バリデーターをシャードに割り当て
      await this.assignValidatorsToShards();
      
      this.initialized = true;
      console.log('ハイブリッドコンセンサスが初期化されました');
      this.emit('initialized');
      return true;
    } catch (error) {
      console.error('ハイブリッドコンセンサスの初期化に失敗しました:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * バリデーターをシャードに割り当てる
   */
  async assignValidatorsToShards() {
    // 初期化が完了していない場合は待機
    if (!this.initialized && !this.blockchain.validators) {
      await this.blockchain.initialized;
    }
    
    const validators = Array.from(this.blockchain.validators.keys());
    
    // シャードバリデーターをリセット
    for (let i = 0; i < this.shardCount; i++) {
      this.shards.get(i).validators = [];
    }
    
    // バリデーターをシャードに割り当て（各バリデーターは複数のシャードに割り当て可能）
    for (const validator of validators) {
      // 2-3のランダムなシャードに割り当て
      const shardCount = 2 + Math.floor(Math.random() * 2);
      const assignedShards = new Set();
      
      for (let i = 0; i < shardCount; i++) {
        let shardId;
        do {
          shardId = Math.floor(Math.random() * this.shardCount);
        } while (assignedShards.has(shardId));
        
        assignedShards.add(shardId);
        this.shards.get(shardId).validators.push(validator);
      }
    }
    
    this.emit('validators-assigned', Array.from(this.shards.entries()));
  }

  /**
   * トランザクションを処理する
   * @param {Array} transactions - 処理するトランザクション
   */
  processTransactions(transactions) {
    // シャードごとにトランザクションをグループ化
    for (const tx of transactions) {
      const shardId = tx.shardId;
      this.shards.get(shardId).transactions.push(tx);
    }
    
    this.emit('transactions-processed', transactions.length);
  }

  /**
   * ブロックを作成する
   * @returns {Array} 作成されたブロックの配列
   */
  async createBlocks() {
    // 初期化が完了していない場合は初期化
    if (!this.initialized) {
      await this.initialize();
    }
    
    const newBlocks = [];
    
    // 各シャードを並列処理
    const shardPromises = [];
    
    for (const [shardId, shard] of this.shards.entries()) {
      if (shard.transactions.length === 0 || shard.validators.length === 0) {
        continue;
      }
      
      const shardPromise = this.processShardTransactions(shardId, shard)
        .then(newBlock => {
          if (newBlock) {
            newBlocks.push(newBlock);
          }
          return newBlock;
        })
        .catch(error => {
          console.error(`シャード ${shardId} の処理エラー:`, error);
          return null;
        });
      
      shardPromises.push(shardPromise);
    }
    
    // 全てのシャードの処理が完了するまで待機
    await Promise.all(shardPromises);
    
    this.emit('blocks-created', newBlocks);
    return newBlocks;
  }

  /**
   * シャードのトランザクションを処理する
   * @param {number} shardId - シャードID
   * @param {Object} shard - シャードオブジェクト
   * @returns {Object|null} 作成されたブロック、失敗した場合はnull
   */
  async processShardTransactions(shardId, shard) {
    try {
      // バリデーターを選択
      const validatorIndex = Math.floor(Math.random() * shard.validators.length);
      const validator = shard.validators[validatorIndex];
      
      // DAGからtipsを取得して参照
      const tips = this.dag.getTips();
      const referenceTips = tips.slice(0, Math.min(5, tips.length));
      
      // 新しいブロックを作成
      const lastBlock = await this.blockchain.getLatestBlock();
      const newBlock = {
        index: this.blockchain.chain.length,
        timestamp: Date.now(),
        transactions: shard.transactions,
        previousHash: lastBlock.hash,
        validator,
        references: referenceTips,
        shardId
      };
      
      // ハッシュを計算
      newBlock.hash = this.calculateBlockHash(newBlock);
      
      // ブロックを検証
      if (await this.pos.validateBlock(newBlock)) {
        // ブロックをブロックチェーンに追加
        this.blockchain.chain.push(newBlock);
        this.blockchain.blocksByHash.set(newBlock.hash, newBlock);
        
        // ブロックをストレージに保存
        await this.blockchain.storage.saveBlock(newBlock);
        
        // DAGに追加
        this.dag.addVertex(newBlock);
        
        // 処理済みトランザクションをクリア
        shard.transactions = [];
        
        return newBlock;
      }
      
      return null;
    } catch (error) {
      console.error(`シャード ${shardId} のトランザクション処理エラー:`, error);
      return null;
    }
  }

  /**
   * ブロックのハッシュを計算する
   * @param {Object} block - ハッシュを計算するブロック
   * @returns {string} ブロックのハッシュ
   */
  calculateBlockHash(block) {
    return crypto.SHA256(
      block.index +
      block.timestamp +
      JSON.stringify(block.transactions) +
      block.previousHash +
      block.validator +
      JSON.stringify(block.references) +
      block.shardId
    ).toString();
  }

  /**
   * メインチェーンを取得する
   * @returns {Array} メインチェーンのブロック配列
   */
  async getMainChain() {
    // 初期化が完了していない場合は初期化
    if (!this.initialized) {
      await this.initialize();
    }
    
    // DAGから最長パスを取得
    const longestPath = this.dag.findLongestPath();
    
    // ハッシュからブロックへの変換
    const blocks = [];
    for (const hash of longestPath) {
      const block = await this.blockchain.getBlockByHash(hash);
      if (block) {
        blocks.push(block);
      }
    }
    
    return blocks;
  }

  /**
   * バリデーターを追加する
   * @param {string} address - バリデーターのアドレス
   * @param {number} stake - ステーク量
   */
  async addValidator(address, stake) {
    // 初期化が完了していない場合は初期化
    if (!this.initialized) {
      await this.initialize();
    }
    
    await this.pos.addValidator(address, stake);
    await this.assignValidatorsToShards();
  }

  /**
   * バリデーターを削除する
   * @param {string} address - バリデーターのアドレス
   */
  async removeValidator(address) {
    // 初期化が完了していない場合は初期化
    if (!this.initialized) {
      await this.initialize();
    }
    
    await this.pos.removeValidator(address);
    await this.assignValidatorsToShards();
  }
  
  /**
   * バリデーターの報酬を取得する
   * @param {string} address - バリデーターのアドレス
   * @returns {Object} バリデーターの報酬情報
   */
  async getValidatorRewards(address) {
    // 初期化が完了していない場合は初期化
    if (!this.initialized) {
      await this.initialize();
    }
    
    return await this.pos.getValidatorRewards(address);
  }
  
  /**
   * ネットワークの統計情報を取得する
   * @returns {Object} ネットワークの統計情報
   */
  async getNetworkStats() {
    // 初期化が完了していない場合は初期化
    if (!this.initialized) {
      await this.initialize();
    }
    
    const validatorCount = this.blockchain.validators.size;
    const totalStaked = Array.from(this.blockchain.validators.values())
      .reduce((sum, stake) => sum + stake, 0);
    
    const blockCount = this.blockchain.chain.length;
    const tps = await this.calculateTPS();
    
    return {
      validatorCount,
      totalStaked,
      blockCount,
      tps,
      shardCount: this.shardCount,
      activeShards: Array.from(this.shards.entries())
        .filter(([_, shard]) => shard.validators.length > 0)
        .length
    };
  }
  
  /**
   * 1秒あたりのトランザクション数を計算する
   * @returns {number} 1秒あたりのトランザクション数
   */
  async calculateTPS() {
    // 最近のブロックに基づいてTPSを計算
    const recentBlocks = this.blockchain.chain.slice(-100); // 最新100ブロック
    
    if (recentBlocks.length < 2) {
      return 0;
    }
    
    const firstBlock = recentBlocks[0];
    const lastBlock = recentBlocks[recentBlocks.length - 1];
    
    let totalTransactions = 0;
    for (const block of recentBlocks) {
      totalTransactions += block.transactions.length;
    }
    
    const timeSpanSeconds = (lastBlock.timestamp - firstBlock.timestamp) / 1000;
    if (timeSpanSeconds <= 0) {
      return 0;
    }
    
    return totalTransactions / timeSpanSeconds;
  }
}

module.exports = HybridConsensus;