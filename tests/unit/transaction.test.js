const { expect } = require('chai');
const sinon = require('sinon');
const Transaction = require('../../core/transaction');
const TransactionValidator = require('../../security/transaction-validator');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

describe('Transaction', () => {
  let keyPair;
  let publicKey;
  let privateKey;
  
  before(() => {
    // テスト用のキーペアを生成
    keyPair = ec.genKeyPair();
    publicKey = keyPair.getPublic('hex');
    privateKey = keyPair.getPrivate('hex');
  });
  
  describe('constructor', () => {
    it('トランザクションを正しく初期化する', () => {
      const tx = new Transaction(publicKey, 'recipient', 100, 'test data');
      
      expect(tx.fromAddress).to.equal(publicKey);
      expect(tx.toAddress).to.equal('recipient');
      expect(tx.amount).to.equal(100);
      expect(tx.data).to.equal('test data');
      expect(tx.timestamp).to.be.a('number');
      expect(tx.signature).to.be.null;
    });
  });
  
  describe('calculateHash', () => {
    it('トランザクションハッシュを正しく計算する', () => {
      const tx = new Transaction(publicKey, 'recipient', 100, 'test data');
      const hash = tx.calculateHash();
      
      expect(hash).to.be.a('string');
      expect(hash.length).to.equal(64); // SHA-256ハッシュは64文字
    });
    
    it('異なるトランザクションは異なるハッシュを持つ', () => {
      const tx1 = new Transaction(publicKey, 'recipient', 100, 'test data');
      const tx2 = new Transaction(publicKey, 'recipient', 200, 'test data');
      
      const hash1 = tx1.calculateHash();
      const hash2 = tx2.calculateHash();
      
      expect(hash1).to.not.equal(hash2);
    });
  });
  
  describe('signTransaction', () => {
    it('トランザクションに正しく署名する', () => {
      const tx = new Transaction(publicKey, 'recipient', 100, 'test data');
      
      tx.signTransaction({ getPublic: () => publicKey, sign: (hash) => ({ toDER: () => 'signature' }) });
      
      expect(tx.signature).to.not.be.null;
    });
    
    it('送信元が自分でない場合はエラーをスローする', () => {
      const tx = new Transaction('different-address', 'recipient', 100, 'test data');
      
      expect(() => {
        tx.signTransaction({ getPublic: () => publicKey, sign: () => {} });
      }).to.throw('他のウォレットのトランザクションに署名することはできません');
    });
  });
  
  describe('isValid', () => {
    it('正しく署名されたトランザクションは有効', () => {
      const tx = new Transaction(publicKey, 'recipient', 100, 'test data');
      tx.signTransaction(keyPair);
      
      expect(tx.isValid()).to.be.true;
    });
    
    it('署名のないトランザクションは無効', () => {
      const tx = new Transaction(publicKey, 'recipient', 100, 'test data');
      
      expect(tx.isValid()).to.be.false;
    });
    
    it('改ざんされたトランザクションは無効', () => {
      const tx = new Transaction(publicKey, 'recipient', 100, 'test data');
      tx.signTransaction(keyPair);
      
      // トランザクションを改ざん
      tx.amount = 200;
      
      expect(tx.isValid()).to.be.false;
    });
    
    it('genesisトランザクションは常に有効', () => {
      const tx = new Transaction('genesis', 'recipient', 100, 'genesis transaction');
      
      expect(tx.isValid()).to.be.true;
    });
    
    it('Systemトランザクションは常に有効', () => {
      const tx = new Transaction('System', 'recipient', 100, 'system transaction');
      
      expect(tx.isValid()).to.be.true;
    });
  });
  
  describe('TransactionValidator', () => {
    it('トランザクションの整合性を正しく検証する', () => {
      const tx = new Transaction(publicKey, 'recipient', 100, 'test data');
      tx.signTransaction(keyPair);
      
      const result = TransactionValidator.validateTransaction(tx);
      expect(result.isValid).to.be.true;
      expect(result.errors).to.be.empty;
    });
    
    it('無効なトランザクションを検出する', () => {
      const tx = new Transaction('', '', -100, '');
      
      const result = TransactionValidator.validateTransaction(tx);
      expect(result.isValid).to.be.false;
      expect(result.errors.length).to.be.greaterThan(0);
    });
    
    it('リプレイ攻撃を検出する', () => {
      const tx = new Transaction(publicKey, 'recipient', 100, 'test data');
      tx.signTransaction(keyPair);
      
      const existingTransactions = [tx];
      
      const isValid = TransactionValidator.preventReplayAttack(tx, existingTransactions);
      expect(isValid).to.be.false;
    });
    
    it('二重支払いを検出する', async () => {
      const tx = new Transaction(publicKey, 'recipient', 100, 'test data');
      tx.signTransaction(keyPair);
      
      const getBalanceFunc = sinon.stub().resolves(50); // 残高不足
      
      const isValid = await TransactionValidator.preventDoubleSpending(tx, getBalanceFunc);
      expect(isValid).to.be.false;
    });
  });
});