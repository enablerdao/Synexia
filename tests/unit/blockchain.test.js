const { expect } = require('chai');
const sinon = require('sinon');
const OptimizedBlockchain = require('../../core/blockchain-optimized');
const Block = require('../../core/block');
const Transaction = require('../../core/transaction');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('OptimizedBlockchain', () => {
  let blockchain;
  let tempDir;
  
  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    tempDir = path.join(os.tmpdir(), `blockchain-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    // ブロックチェーンを初期化
    blockchain = new OptimizedBlockchain(tempDir);
    await blockchain.initialized;
  });
  
  afterEach(async () => {
    // リソースを解放
    await blockchain.close();
    
    // 一時ディレクトリを削除
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  describe('constructor', () => {
    it('ブロックチェーンを正しく初期化する', () => {
      expect(blockchain.chain).to.be.an('array');
      expect(blockchain.chain.length).to.equal(1);
      expect(blockchain.pendingTransactions).to.be.an('array');
      expect(blockchain.validators).to.be.an('Map');
      expect(blockchain.miningReward).to.equal(100);
      expect(blockchain.minStake).to.equal(1000);
    });
    
    it('ジェネシスブロックを正しく作成する', () => {
      const genesisBlock = blockchain.chain[0];
      
      expect(genesisBlock.index).to.equal(0);
      expect(genesisBlock.previousHash).to.equal('0');
      expect(genesisBlock.transactions).to.be.an('array');
      expect(genesisBlock.transactions.length).to.equal(0);
      expect(genesisBlock.validator).to.equal('genesis');
    });
  });
  
  describe('getLatestBlock', () => {
    it('最新のブロックを返す', () => {
      const latestBlock = blockchain.getLatestBlock();
      
      expect(latestBlock).to.equal(blockchain.chain[blockchain.chain.length - 1]);
    });
  });
  
  describe('addTransaction', () => {
    it('有効なトランザクションを追加する', async () => {
      const transaction = new Transaction('genesis', 'recipient', 100, 'test');
      
      await blockchain.addTransaction(transaction);
      
      expect(blockchain.pendingTransactions).to.include(transaction);
    });
    
    it('無効なトランザクションを拒否する', async () => {
      const transaction = new Transaction('invalid', 'recipient', -100, 'test');
      
      try {
        await blockchain.addTransaction(transaction);
        expect.fail('無効なトランザクションが追加されました');
      } catch (error) {
        expect(blockchain.pendingTransactions).to.not.include(transaction);
      }
    });
  });
  
  describe('minePendingTransactions', () => {
    it('保留中のトランザクションをマイニングする', async () => {
      // バリデーターを追加
      await blockchain.addValidator('validator1', 1000);
      
      // トランザクションを追加
      const transaction = new Transaction('genesis', 'recipient', 100, 'test');
      await blockchain.addTransaction(transaction);
      
      // マイニング
      const newBlocks = await blockchain.minePendingTransactions('miner1');
      
      expect(newBlocks).to.be.an('array');
      expect(newBlocks.length).to.equal(1);
      expect(blockchain.chain.length).to.equal(2);
      expect(blockchain.pendingTransactions.length).to.equal(0);
      
      // 新しいブロックを検証
      const newBlock = newBlocks[0];
      expect(newBlock.index).to.equal(1);
      expect(newBlock.previousHash).to.equal(blockchain.chain[0].hash);
      expect(newBlock.transactions).to.be.an('array');
      expect(newBlock.transactions.length).to.be.at.least(1);
      
      // マイニング報酬を検証
      const rewardTx = newBlock.transactions.find(tx => tx.fromAddress === 'System' && tx.toAddress === 'miner1');
      expect(rewardTx).to.exist;
      expect(rewardTx.amount).to.equal(blockchain.miningReward);
    });
  });
  
  describe('getBalanceOfAddress', () => {
    it('アドレスの残高を正しく計算する', async () => {
      // バリデーターを追加
      await blockchain.addValidator('validator1', 1000);
      
      // トランザクションを追加
      const transaction1 = new Transaction('genesis', 'address1', 100, 'test1');
      await blockchain.addTransaction(transaction1);
      
      const transaction2 = new Transaction('genesis', 'address1', 50, 'test2');
      await blockchain.addTransaction(transaction2);
      
      // マイニング
      await blockchain.minePendingTransactions('miner1');
      
      // 残高を取得
      const balance = await blockchain.getBalanceOfAddress('address1');
      
      expect(balance).to.equal(150);
    });
  });
  
  describe('isChainValid', () => {
    it('有効なチェーンを検証する', () => {
      expect(blockchain.isChainValid()).to.be.true;
    });
    
    it('無効なチェーンを検出する', () => {
      // ブロックを改ざん
      blockchain.chain[0].transactions.push(new Transaction('invalid', 'recipient', 100, 'test'));
      
      expect(blockchain.isChainValid()).to.be.false;
    });
  });
  
  describe('addValidator', () => {
    it('バリデーターを追加する', async () => {
      await blockchain.addValidator('validator1', 1000);
      
      expect(blockchain.validators.has('validator1')).to.be.true;
      expect(blockchain.validators.get('validator1')).to.equal(1000);
    });
  });
  
  describe('removeValidator', () => {
    it('バリデーターを削除する', async () => {
      await blockchain.addValidator('validator1', 1000);
      await blockchain.removeValidator('validator1');
      
      expect(blockchain.validators.has('validator1')).to.be.false;
    });
  });
  
  describe('getStats', () => {
    it('ブロックチェーンの統計情報を取得する', async () => {
      const stats = await blockchain.getStats();
      
      expect(stats).to.be.an('object');
      expect(stats.blockCount).to.equal(blockchain.chain.length);
      expect(stats.transactionCount).to.be.a('number');
      expect(stats.pendingTransactions).to.equal(blockchain.pendingTransactions.length);
      expect(stats.validatorCount).to.equal(blockchain.validators.size);
      expect(stats.cacheStats).to.be.an('object');
      expect(stats.batchProcessorStats).to.be.an('object');
    });
  });
});