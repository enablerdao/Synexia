const crypto = require('crypto');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

/**
 * トランザクション検証クラス
 * トランザクションの署名と整合性を検証する
 */
class TransactionValidator {
  /**
   * トランザクションの署名を検証する
   * @param {Object} transaction - 検証するトランザクション
   * @returns {boolean} 署名が有効な場合はtrue
   */
  static verifySignature(transaction) {
    // システムトランザクションはスキップ
    if (transaction.fromAddress === 'genesis' || transaction.fromAddress === 'System' || transaction.fromAddress === 'STAKE') {
      return true;
    }
    
    // 署名が存在するか確認
    if (!transaction.signature || transaction.signature.length === 0) {
      console.error('署名がありません');
      return false;
    }
    
    // 公開鍵を取得
    try {
      const publicKey = ec.keyFromPublic(transaction.fromAddress, 'hex');
      
      // トランザクションハッシュを計算
      const transactionHash = this.calculateHash(transaction);
      
      // 署名を検証
      return publicKey.verify(transactionHash, transaction.signature);
    } catch (error) {
      console.error('署名検証エラー:', error);
      return false;
    }
  }
  
  /**
   * トランザクションハッシュを計算する
   * @param {Object} transaction - ハッシュを計算するトランザクション
   * @returns {string} トランザクションハッシュ
   */
  static calculateHash(transaction) {
    const { fromAddress, toAddress, amount, timestamp, data } = transaction;
    
    return crypto
      .createHash('sha256')
      .update(fromAddress + toAddress + amount + timestamp + (data || ''))
      .digest('hex');
  }
  
  /**
   * トランザクションの整合性を検証する
   * @param {Object} transaction - 検証するトランザクション
   * @returns {Object} 検証結果（isValid, errors）
   */
  static validateTransaction(transaction) {
    const errors = [];
    
    // 基本的な検証
    if (!transaction.fromAddress) {
      errors.push('送信元アドレスがありません');
    }
    
    if (!transaction.toAddress) {
      errors.push('送信先アドレスがありません');
    }
    
    if (transaction.amount === undefined || transaction.amount === null) {
      errors.push('金額が指定されていません');
    }
    
    if (typeof transaction.amount !== 'number' || isNaN(transaction.amount)) {
      errors.push('金額は数値である必要があります');
    }
    
    if (transaction.amount <= 0 && transaction.fromAddress !== 'genesis' && transaction.fromAddress !== 'System') {
      errors.push('金額は0より大きい必要があります');
    }
    
    if (!transaction.timestamp) {
      errors.push('タイムスタンプがありません');
    }
    
    // 自分自身への送金を防止
    if (transaction.fromAddress === transaction.toAddress && 
        transaction.fromAddress !== 'genesis' && 
        transaction.fromAddress !== 'System' &&
        transaction.toAddress !== 'STAKE') {
      errors.push('自分自身への送金はできません');
    }
    
    // 署名検証
    if (errors.length === 0) {
      if (!this.verifySignature(transaction)) {
        errors.push('署名が無効です');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * トランザクションのリプレイ攻撃を防止する
   * @param {Object} transaction - 検証するトランザクション
   * @param {Array} existingTransactions - 既存のトランザクション
   * @returns {boolean} リプレイ攻撃でない場合はtrue
   */
  static preventReplayAttack(transaction, existingTransactions) {
    // システムトランザクションはスキップ
    if (transaction.fromAddress === 'genesis' || transaction.fromAddress === 'System' || transaction.fromAddress === 'STAKE') {
      return true;
    }
    
    // トランザクションハッシュを計算
    const transactionHash = this.calculateHash(transaction);
    
    // 既存のトランザクションと比較
    for (const existingTx of existingTransactions) {
      const existingHash = this.calculateHash(existingTx);
      
      if (existingHash === transactionHash) {
        console.error('リプレイ攻撃の可能性があります');
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * トランザクションの二重支払いを防止する
   * @param {Object} transaction - 検証するトランザクション
   * @param {Function} getBalanceFunc - 残高を取得する関数
   * @returns {Promise<boolean>} 二重支払いでない場合はtrue
   */
  static async preventDoubleSpending(transaction, getBalanceFunc) {
    // システムトランザクションはスキップ
    if (transaction.fromAddress === 'genesis' || transaction.fromAddress === 'System' || transaction.fromAddress === 'STAKE') {
      return true;
    }
    
    // 残高を取得
    const balance = await getBalanceFunc(transaction.fromAddress);
    
    // 残高が十分かチェック
    if (balance < transaction.amount) {
      console.error(`残高不足: ${transaction.fromAddress} の残高は ${balance} ですが、${transaction.amount} が必要です`);
      return false;
    }
    
    return true;
  }
}

module.exports = TransactionValidator;