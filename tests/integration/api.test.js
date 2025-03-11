const { expect } = require('chai');
const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const os = require('os');
const BlockchainServer = require('../../api/server');

describe('Blockchain API', () => {
  let app;
  let server;
  let tempDir;
  
  before(async () => {
    // テスト用の一時ディレクトリを作成
    tempDir = path.join(os.tmpdir(), `blockchain-api-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    // サーバーを初期化
    server = new BlockchainServer({
      port: 0, // 任意のポート
      dataDir: tempDir
    });
    
    // 初期化を待機
    await server.initialized;
    
    // Expressアプリを取得
    app = server.app;
  });
  
  after(async () => {
    // リソースを解放
    await server.blockchain.close();
    
    // 一時ディレクトリを削除
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  describe('GET /api/blockchain', () => {
    it('ブロックチェーン情報を返す', async () => {
      const response = await request(app)
        .get('/api/blockchain')
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.be.an('object');
      expect(response.body.chain).to.be.an('array');
      expect(response.body.height).to.be.a('number');
      expect(response.body.pendingTransactions).to.be.an('array');
    });
  });
  
  describe('GET /api/blocks', () => {
    it('ブロックのリストを返す', async () => {
      const response = await request(app)
        .get('/api/blocks')
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.be.an('object');
      expect(response.body.blocks).to.be.an('array');
      expect(response.body.total).to.be.a('number');
    });
    
    it('パラメータでブロックを制限する', async () => {
      const response = await request(app)
        .get('/api/blocks?start=0&limit=1')
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body.blocks).to.be.an('array');
      expect(response.body.blocks.length).to.be.at.most(1);
    });
  });
  
  describe('GET /api/blocks/:index', () => {
    it('インデックスでブロックを取得する', async () => {
      const response = await request(app)
        .get('/api/blocks/0')
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.be.an('object');
      expect(response.body.index).to.equal(0);
      expect(response.body.hash).to.be.a('string');
    });
    
    it('存在しないブロックに対して404を返す', async () => {
      await request(app)
        .get('/api/blocks/999')
        .expect(404);
    });
  });
  
  describe('POST /api/wallet', () => {
    it('新しいウォレットを作成する', async () => {
      const response = await request(app)
        .post('/api/wallet')
        .send({ name: 'testWallet' })
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.be.an('object');
      expect(response.body.success).to.be.true;
      expect(response.body.wallet).to.be.an('object');
      expect(response.body.wallet.name).to.equal('testWallet');
      expect(response.body.wallet.publicKey).to.be.a('string');
      expect(response.body.wallet.balance).to.be.a('number');
    });
    
    it('無効なウォレット名に対して400を返す', async () => {
      await request(app)
        .post('/api/wallet')
        .send({ name: '' })
        .expect(400);
    });
  });
  
  describe('GET /api/wallets', () => {
    it('ウォレットのリストを返す', async () => {
      const response = await request(app)
        .get('/api/wallets')
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.be.an('array');
      expect(response.body.length).to.be.at.least(1); // adminウォレットが存在する
    });
  });
  
  describe('POST /api/transactions', () => {
    it('新しいトランザクションを作成する', async () => {
      // 最初にウォレットを取得
      const walletsResponse = await request(app)
        .get('/api/wallets')
        .expect(200);
      
      const adminWallet = walletsResponse.body.find(w => w.name === 'admin');
      expect(adminWallet).to.exist;
      
      // トランザクションを作成
      const response = await request(app)
        .post('/api/transactions')
        .send({
          fromWallet: 'admin',
          toAddress: adminWallet.publicKey, // 自分自身に送金
          amount: 10,
          data: 'test transaction'
        })
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.be.an('object');
      expect(response.body.success).to.be.true;
      expect(response.body.transaction).to.be.an('object');
      expect(response.body.transaction.fromAddress).to.equal(adminWallet.publicKey);
      expect(response.body.transaction.toAddress).to.equal(adminWallet.publicKey);
      expect(response.body.transaction.amount).to.equal(10);
      expect(response.body.transaction.data).to.equal('test transaction');
    });
    
    it('無効なトランザクションに対して400を返す', async () => {
      await request(app)
        .post('/api/transactions')
        .send({
          fromWallet: 'admin',
          toAddress: '',
          amount: -10
        })
        .expect(400);
    });
  });
  
  describe('POST /api/mine', () => {
    it('ブロックをマイニングする', async () => {
      // バリデーターを追加
      await request(app)
        .post('/api/validators/stake')
        .send({
          walletName: 'admin',
          amount: 1000
        })
        .expect(200);
      
      // マイニング
      const response = await request(app)
        .post('/api/mine')
        .send({
          minerWallet: 'admin'
        })
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.be.an('object');
      expect(response.body.success).to.be.true;
      expect(response.body.blocks).to.be.an('array');
      expect(response.body.blocks.length).to.be.at.least(1);
      expect(response.body.reward).to.be.a('number');
    });
    
    it('無効なマイナーウォレットに対して400を返す', async () => {
      await request(app)
        .post('/api/mine')
        .send({
          minerWallet: ''
        })
        .expect(400);
    });
  });
  
  describe('GET /api/stats', () => {
    it('ネットワーク統計を返す', async () => {
      const response = await request(app)
        .get('/api/stats')
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.be.an('object');
      expect(response.body.blockCount).to.be.a('number');
      expect(response.body.transactionCount).to.be.a('number');
      expect(response.body.validatorCount).to.be.a('number');
      expect(response.body.walletCount).to.be.a('number');
    });
  });
});