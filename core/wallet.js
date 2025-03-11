const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const crypto = require('crypto-js');
const Transaction = require('./transaction');

/**
 * ウォレットクラス
 */
class Wallet {
  /**
   * 新しいウォレットを作成する
   */
  constructor() {
    this.keyPair = ec.genKeyPair();
    this.publicKey = this.keyPair.getPublic('hex');
    this.privateKey = this.keyPair.getPrivate('hex');
  }

  /**
   * 秘密鍵からウォレットを復元する
   * @param {string} privateKey - 秘密鍵
   * @returns {Wallet} 復元されたウォレット
   */
  static fromPrivateKey(privateKey) {
    const wallet = new Wallet();
    wallet.keyPair = ec.keyFromPrivate(privateKey);
    wallet.publicKey = wallet.keyPair.getPublic('hex');
    wallet.privateKey = wallet.keyPair.getPrivate('hex');
    return wallet;
  }

  /**
   * 公開鍵と秘密鍵のペアからウォレットを復元する
   * @param {string} publicKey - 公開鍵
   * @param {string} privateKey - 秘密鍵
   * @returns {Wallet} 復元されたウォレット
   */
  static fromKeyPair(publicKey, privateKey) {
    const wallet = new Wallet();
    wallet.keyPair = ec.keyFromPrivate(privateKey);
    wallet.publicKey = publicKey;
    wallet.privateKey = privateKey;
    return wallet;
  }

  /**
   * 公開鍵を取得する
   * @returns {string} 公開鍵
   */
  getPublicKey() {
    return this.publicKey;
  }

  /**
   * 秘密鍵を取得する
   * @returns {string} 秘密鍵
   */
  getPrivateKey() {
    return this.privateKey;
  }

  /**
   * ウォレットの残高を取得する
   * @param {Object} blockchain - ブロックチェーンオブジェクト
   * @returns {number} ウォレットの残高
   */
  async getBalance(blockchain) {
    return await blockchain.getBalanceOfAddress(this.publicKey);
  }

  /**
   * トランザクションを作成する
   * @param {string} toAddress - 送信先アドレス
   * @param {number} amount - 送金額
   * @param {string} data - トランザクションに付随するデータ
   * @param {Object} blockchain - ブロックチェーンオブジェクト
   * @returns {Transaction} 作成されたトランザクション
   */
  async createTransaction(toAddress, amount, data = '', blockchain) {
    const balance = await this.getBalance(blockchain);
    if (amount > balance) {
      throw new Error('残高不足です');
    }

    const tx = new Transaction(this.publicKey, toAddress, amount, data);
    tx.signTransaction(this.keyPair);
    return tx;
  }

  /**
   * トークンをステーキングする
   * @param {number} amount - ステーキング額
   * @param {Object} blockchain - ブロックチェーンオブジェクト
   * @returns {boolean} ステーキングが成功した場合はtrue
   */
  async stake(amount, blockchain) {
    const balance = await this.getBalance(blockchain);
    if (amount > balance) {
      throw new Error('ステーキングするための残高が不足しています');
    }

    await blockchain.addValidator(this.publicKey, amount);
    
    // ステーキングトランザクションを作成
    const stakingTx = new Transaction(
      this.publicKey,
      'STAKE',
      amount,
      'STAKE_VALIDATOR'
    );
    stakingTx.signTransaction(this.keyPair);
    await blockchain.addTransaction(stakingTx);
    
    return true;
  }

  /**
   * ステーキングを解除する
   * @param {Object} blockchain - ブロックチェーンオブジェクト
   * @returns {number} アンステーキングされた金額
   */
  async unstake(blockchain) {
    const validators = await blockchain.validators;
    if (!validators.has(this.publicKey)) {
      throw new Error('バリデーターではありません');
    }
    
    const stakeAmount = validators.get(this.publicKey);
    await blockchain.removeValidator(this.publicKey);
    
    // アンステーキングトランザクションを作成
    const unstakingTx = new Transaction(
      'STAKE',
      this.publicKey,
      stakeAmount,
      'UNSTAKE_VALIDATOR'
    );
    await blockchain.addTransaction(unstakingTx);
    
    return stakeAmount;
  }

  /**
   * ウォレットをJSON形式に変換する
   * @returns {Object} JSON形式のウォレット
   */
  toJSON() {
    return {
      publicKey: this.publicKey,
      privateKey: this.privateKey
    };
  }

  /**
   * JSON形式からウォレットを復元する
   * @param {Object} json - JSON形式のウォレット
   * @returns {Wallet} 復元されたウォレット
   */
  static fromJSON(json) {
    return Wallet.fromKeyPair(json.publicKey, json.privateKey);
  }

  /**
   * ウォレットを暗号化する
   * @param {string} password - 暗号化に使用するパスワード
   * @returns {Object} 暗号化されたウォレット
   */
  encrypt(password) {
    const encryptedPrivateKey = crypto.AES.encrypt(
      this.privateKey,
      password
    ).toString();
    
    return {
      publicKey: this.publicKey,
      encryptedPrivateKey
    };
  }

  /**
   * 暗号化されたウォレットを復号する
   * @param {Object} encryptedWallet - 暗号化されたウォレット
   * @param {string} password - 復号に使用するパスワード
   * @returns {Wallet} 復号されたウォレット
   */
  static decrypt(encryptedWallet, password) {
    try {
      const privateKey = crypto.AES.decrypt(
        encryptedWallet.encryptedPrivateKey,
        password
      ).toString(crypto.enc.Utf8);
      
      return Wallet.fromKeyPair(encryptedWallet.publicKey, privateKey);
    } catch (error) {
      throw new Error('パスワードが無効か、ウォレットが破損しています');
    }
  }
}

module.exports = Wallet;