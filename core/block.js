const crypto = require('crypto-js');

/**
 * ブロックチェーンのブロッククラス
 */
class Block {
  /**
   * ブロックを作成する
   * @param {number} index - ブロックのインデックス
   * @param {number} timestamp - ブロック作成時のタイムスタンプ
   * @param {Array} transactions - ブロックに含まれるトランザクション
   * @param {string} previousHash - 前のブロックのハッシュ
   * @param {string} validator - ブロックを検証したバリデーターのアドレス
   */
  constructor(index, timestamp, transactions, previousHash, validator) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.validator = validator;
    this.nonce = 0;
    this.references = []; // DAG構造のための参照
    this.hash = this.calculateHash();
  }

  /**
   * ブロックのハッシュを計算する
   * @returns {string} ブロックのハッシュ値
   */
  calculateHash() {
    return crypto.SHA256(
      this.index +
      this.timestamp +
      JSON.stringify(this.transactions) +
      this.previousHash +
      this.validator +
      this.nonce +
      JSON.stringify(this.references)
    ).toString();
  }

  /**
   * 参照ブロックを追加する（DAG構造用）
   * @param {string} blockHash - 参照するブロックのハッシュ
   */
  addReference(blockHash) {
    if (!this.references.includes(blockHash)) {
      this.references.push(blockHash);
      this.hash = this.calculateHash(); // 参照が変わったのでハッシュを再計算
    }
  }

  /**
   * ブロックが有効かどうかを検証する
   * @returns {boolean} ブロックが有効な場合はtrue
   */
  isValid() {
    return this.hash === this.calculateHash();
  }

  /**
   * ブロックをJSON形式に変換する
   * @returns {Object} JSON形式のブロック
   */
  toJSON() {
    return {
      index: this.index,
      timestamp: this.timestamp,
      transactions: this.transactions,
      previousHash: this.previousHash,
      validator: this.validator,
      nonce: this.nonce,
      references: this.references,
      hash: this.hash
    };
  }

  /**
   * JSON形式からブロックを復元する
   * @param {Object} json - JSON形式のブロック
   * @returns {Block} 復元されたブロック
   */
  static fromJSON(json) {
    const block = new Block(
      json.index,
      json.timestamp,
      json.transactions,
      json.previousHash,
      json.validator
    );
    block.nonce = json.nonce;
    block.references = json.references || [];
    block.hash = json.hash;
    return block;
  }
}

module.exports = Block;