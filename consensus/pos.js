const crypto = require('crypto-js');
const EventEmitter = require('events');

/**
 * Proof of Stakeコンセンサスクラス
 */
class ProofOfStake extends EventEmitter {
  /**
   * Proof of Stakeを初期化する
   * @param {Object} blockchain - ブロックチェーンオブジェクト
   */
  constructor(blockchain) {
    super();
    this.blockchain = blockchain;
    this.validators = new Map(); // address -> stake amount
    this.validatorBlocks = new Map(); // address -> blocks validated
    this.validatorRewards = new Map(); // address -> accumulated rewards
    this.epochLength = 100; // blocks per epoch
    this.currentEpoch = 0;
    this.rewardRate = 0.01; // 1% reward per epoch
    this.slashingRate = 0.05; // 5% slashing for malicious behavior
    this.initialized = false;
  }

  /**
   * Proof of Stakeを初期化する
   * @returns {boolean} 初期化が成功した場合はtrue
   */
  async initialize() {
    try {
      // ブロックチェーンの初期化が完了するまで待機
      await this.blockchain.initialized;
      
      // バリデーターをブロックチェーンからインポート
      this.validators = new Map(this.blockchain.validators);
      
      // バリデーター報酬を初期化
      for (const [address, _] of this.validators.entries()) {
        this.validatorRewards.set(address, 0);
      }
      
      // 現在のエポックを計算
      this.currentEpoch = Math.floor(this.blockchain.chain.length / this.epochLength);
      
      this.initialized = true;
      console.log(`PoSが ${this.validators.size} バリデーターとエポック ${this.currentEpoch} で初期化されました`);
      this.emit('initialized', { validatorCount: this.validators.size, epoch: this.currentEpoch });
      return true;
    } catch (error) {
      console.error('PoSの初期化に失敗しました:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * バリデーターをランダムに選択する
   * @returns {string|null} 選択されたバリデーターのアドレス
   */
  selectValidator() {
    // ステーク量に基づく重み付きランダム選択
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
    
    return validators[0][0]; // フォールバック
  }

  /**
   * ブロックを検証する
   * @param {Object} block - 検証するブロック
   * @returns {boolean} ブロックが有効な場合はtrue
   */
  async validateBlock(block) {
    // 初期化が完了するまで待機
    if (!this.initialized) {
      await this.initialize();
    }
    
    // ブロックがバリデーターによって作成されたかチェック
    if (!this.validators.has(block.validator)) {
      return false;
    }

    // ブロックハッシュが有効かチェック
    if (block.hash !== this.calculateBlockHash(block)) {
      return false;
    }

    // 前のブロックが存在し有効かチェック
    if (block.index > 0) {
      const prevBlock = await this.blockchain.getBlockByHash(block.previousHash);
      if (!prevBlock) {
        return false;
      }
    }

    // バリデーターのアクティビティを追跡
    if (!this.validatorBlocks.has(block.validator)) {
      this.validatorBlocks.set(block.validator, 0);
    }
    this.validatorBlocks.set(
      block.validator,
      this.validatorBlocks.get(block.validator) + 1
    );

    // エポックの更新が必要かチェック
    const newEpoch = Math.floor(block.index / this.epochLength);
    if (newEpoch > this.currentEpoch) {
      await this.updateEpoch(newEpoch);
    }

    return true;
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
      block.nonce +
      JSON.stringify(block.references || [])
    ).toString();
  }

  /**
   * エポックを更新する
   * @param {number} newEpoch - 新しいエポック
   */
  async updateEpoch(newEpoch) {
    // 初期化が完了するまで待機
    if (!this.initialized) {
      await this.initialize();
    }
    
    console.log(`エポックを ${this.currentEpoch} から ${newEpoch} に更新します`);
    
    // 参加率に基づいてバリデーター報酬を再計算
    for (const [address, blockCount] of this.validatorBlocks.entries()) {
      const stake = this.validators.get(address) || 0;
      
      // 参加率に基づいてバリデーターに報酬を与える
      const participationRate = blockCount / this.epochLength;
      const reward = stake * this.rewardRate * participationRate;
      
      // 報酬でステークを更新
      this.validators.set(address, stake + reward);
      
      // 累積報酬を追跡
      const currentReward = this.validatorRewards.get(address) || 0;
      this.validatorRewards.set(address, currentReward + reward);
      
      console.log(`バリデーター ${address.substring(0, 8)}... は ${reward.toFixed(2)} トークンを獲得しました（参加率: ${participationRate.toFixed(2)}）`);
    }
    
    // 新しいエポックのためにブロックカウントをリセット
    this.validatorBlocks.clear();
    
    // 現在のエポックを更新
    this.currentEpoch = newEpoch;
    
    // バリデーターをブロックチェーンに同期
    this.blockchain.validators = new Map(this.validators);
    await this.blockchain.storage.saveValidators(this.validators);
    
    this.emit('epoch-updated', { epoch: newEpoch, validators: Array.from(this.validators.entries()) });
  }

  /**
   * バリデーターを追加する
   * @param {string} address - バリデーターのアドレス
   * @param {number} stake - ステーク量
   */
  async addValidator(address, stake) {
    // 初期化が完了するまで待機
    if (!this.initialized) {
      await this.initialize();
    }
    
    this.validators.set(address, stake);
    this.validatorRewards.set(address, 0);
    
    // バリデーターをブロックチェーンに同期
    this.blockchain.validators = new Map(this.validators);
    await this.blockchain.storage.saveValidators(this.validators);
    
    this.emit('validator-added', { address, stake });
  }

  /**
   * バリデーターを削除する
   * @param {string} address - バリデーターのアドレス
   */
  async removeValidator(address) {
    // 初期化が完了するまで待機
    if (!this.initialized) {
      await this.initialize();
    }
    
    this.validators.delete(address);
    this.validatorBlocks.delete(address);
    this.validatorRewards.delete(address);
    
    // バリデーターをブロックチェーンに同期
    this.blockchain.validators = new Map(this.validators);
    await this.blockchain.storage.saveValidators(this.validators);
    
    this.emit('validator-removed', address);
  }
  
  /**
   * バリデーターの報酬を取得する
   * @param {string} address - バリデーターのアドレス
   * @returns {Object} バリデーターの報酬情報
   */
  async getValidatorRewards(address) {
    // 初期化が完了するまで待機
    if (!this.initialized) {
      await this.initialize();
    }
    
    return {
      stake: this.validators.get(address) || 0,
      accumulatedRewards: this.validatorRewards.get(address) || 0,
      blocksValidated: this.validatorBlocks.get(address) || 0
    };
  }
  
  /**
   * 全てのバリデーターを取得する
   * @returns {Array} バリデーターの配列
   */
  async getAllValidators() {
    // 初期化が完了するまで待機
    if (!this.initialized) {
      await this.initialize();
    }
    
    const validators = [];
    
    for (const [address, stake] of this.validators.entries()) {
      validators.push({
        address,
        stake,
        blocksValidated: this.validatorBlocks.get(address) || 0,
        accumulatedRewards: this.validatorRewards.get(address) || 0
      });
    }
    
    return validators;
  }
  
  /**
   * バリデーターをスラッシング（ペナルティ）する
   * @param {string} address - バリデーターのアドレス
   * @param {string} reason - スラッシングの理由
   * @returns {number} スラッシングされた金額
   */
  async slashValidator(address, reason) {
    // 初期化が完了するまで待機
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.validators.has(address)) {
      throw new Error('バリデーターが存在しません');
    }
    
    const stake = this.validators.get(address);
    const slashAmount = stake * this.slashingRate;
    
    // ステークを減らす
    this.validators.set(address, stake - slashAmount);
    
    // バリデーターをブロックチェーンに同期
    this.blockchain.validators = new Map(this.validators);
    await this.blockchain.storage.saveValidators(this.validators);
    
    this.emit('validator-slashed', { address, amount: slashAmount, reason });
    
    return slashAmount;
  }
}

module.exports = ProofOfStake;