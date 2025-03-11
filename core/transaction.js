const crypto = require('crypto-js');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const { v4: uuidv4 } = require('uuid');

/**
 * トランザクションクラス
 */
class Transaction {
  /**
   * トランザクションを作成する
   * @param {string} fromAddress - 送信元アドレス
   * @param {string} toAddress - 送信先アドレス
   * @param {number} amount - 送金額
   * @param {string} data - トランザクションに付随するデータ
   */
  constructor(fromAddress, toAddress, amount, data = '') {
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.amount = amount;
    this.data = data;
    this.timestamp = Date.now();
    this.signature = '';
    this.nonce = 0;
    this.txId = uuidv4(); // 一意のトランザクションID
    this.shardId = this.calculateShardId(); // シャーディング用のID
    this.hash = this.calculateHash();
  }

  /**
   * トランザクションのハッシュを計算する
   * @returns {string} トランザクションのハッシュ値
   */
  calculateHash() {
    return crypto.SHA256(
      this.fromAddress +
      this.toAddress +
      this.amount +
      this.data +
      this.timestamp +
      this.nonce +
      this.txId
    ).toString();
  }

  /**
   * シャードIDを計算する（シャーディング用）
   * @returns {number} シャードID（0-15）
   */
  calculateShardId() {
    // 送信先アドレスの最初の4ビットをシャードIDとして使用
    if (!this.toAddress) return 0;
    
    const firstChar = this.toAddress.charAt(0);
    const hexValue = parseInt(firstChar, 16);
    return hexValue % 16; // 0-15の値を返す
  }

  /**
   * トランザクションに署名する
   * @param {Object} signingKey - 署名に使用する秘密鍵
   */
  signTransaction(signingKey) {
    // システムトランザクションの場合は署名不要
    if (this.fromAddress === null || 
        this.fromAddress === 'genesis' || 
        this.fromAddress === 'system') {
      return;
    }

    // 自分のウォレットからのトランザクションのみ署名可能
    if (signingKey.getPublic('hex') !== this.fromAddress) {
      throw new Error('他のウォレットのトランザクションには署名できません');
    }

    // トランザクションのハッシュを計算して署名
    const hashTx = this.calculateHash();
    const sig = signingKey.sign(hashTx, 'base64');
    this.signature = sig.toDER('hex');
  }

  /**
   * トランザクションが有効かどうかを検証する
   * @returns {boolean} トランザクションが有効な場合はtrue
   */
  isValid() {
    // システムトランザクション（マイニング報酬、初期資金など）は常に有効
    if (this.fromAddress === null || 
        this.fromAddress === 'genesis' || 
        this.fromAddress === 'system') {
      return true;
    }

    // 特殊なトランザクション（ステーキングなど）
    if (this.fromAddress === 'STAKE' || this.toAddress === 'STAKE') {
      return true;
    }

    // 署名がない場合は無効
    if (!this.signature || this.signature.length === 0) {
      throw new Error('署名がありません');
    }

    try {
      // 公開鍵を使って署名を検証
      const publicKey = ec.keyFromPublic(this.fromAddress, 'hex');
      return publicKey.verify(this.calculateHash(), this.signature);
    } catch (error) {
      console.error('トランザクション署名の検証エラー:', error);
      return false;
    }
  }

  /**
   * トランザクションをJSON形式に変換する
   * @returns {Object} JSON形式のトランザクション
   */
  toJSON() {
    return {
      fromAddress: this.fromAddress,
      toAddress: this.toAddress,
      amount: this.amount,
      data: this.data,
      timestamp: this.timestamp,
      signature: this.signature,
      nonce: this.nonce,
      txId: this.txId,
      shardId: this.shardId,
      hash: this.hash
    };
  }

  /**
   * JSON形式からトランザクションを復元する
   * @param {Object} json - JSON形式のトランザクション
   * @returns {Transaction} 復元されたトランザクション
   */
  static fromJSON(json) {
    const tx = new Transaction(
      json.fromAddress,
      json.toAddress,
      json.amount,
      json.data
    );
    tx.timestamp = json.timestamp;
    tx.signature = json.signature;
    tx.nonce = json.nonce;
    tx.txId = json.txId;
    tx.shardId = json.shardId;
    tx.hash = json.hash;
    return tx;
  }
}

module.exports = Transaction;