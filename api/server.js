const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const Blockchain = require('../core/blockchain');
const Wallet = require('../core/wallet');
const Transaction = require('../core/transaction');
const HybridConsensus = require('../consensus/hybrid');
const WasmEngine = require('../contracts/wasm-engine');
const TokenContract = require('../contracts/token-contract');

/**
 * ブロックチェーンAPIサーバークラス
 */
class BlockchainServer {
  /**
   * APIサーバーを初期化する
   * @param {Object} options - サーバーオプション
   */
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.dataDir = options.dataDir || './data';
    this.app = express();
    this.wallets = new Map(); // name -> wallet
    this.blockchain = new Blockchain(this.dataDir);
    this.consensus = new HybridConsensus(this.blockchain);
    this.contractEngine = new WasmEngine(this.blockchain);
    
    // サーバーの初期化
    this.setupServer();
    
    // ブロックチェーンの初期化（非同期）
    this.initialized = this.initialize();
  }

  /**
   * サーバーを設定する
   */
  setupServer() {
    // ミドルウェア
    this.app.use(cors());
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    
    // 静的ファイル
    this.app.use(express.static(path.join(__dirname, '../public')));
    
    // APIルート
    this.setupRoutes();
    
    // エラーハンドリング
    this.app.use((err, req, res, next) => {
      console.error('APIエラー:', err);
      res.status(500).json({ error: err.message });
    });
  }

  /**
   * APIルートを設定する
   */
  setupRoutes() {
    // ブロックチェーン情報
    this.app.get('/api/blockchain', this.getBlockchainInfo.bind(this));
    this.app.get('/api/blocks', this.getBlocks.bind(this));
    this.app.get('/api/blocks/:index', this.getBlockByIndex.bind(this));
    this.app.get('/api/blocks/hash/:hash', this.getBlockByHash.bind(this));
    
    // トランザクション
    this.app.get('/api/transactions', this.getPendingTransactions.bind(this));
    this.app.get('/api/transactions/:hash', this.getTransaction.bind(this));
    this.app.post('/api/transactions', this.createTransaction.bind(this));
    
    // ウォレット
    this.app.get('/api/wallets', this.getWallets.bind(this));
    this.app.get('/api/wallet/:name', this.getWallet.bind(this));
    this.app.post('/api/wallet', this.createWallet.bind(this));
    
    // マイニング
    this.app.post('/api/mine', this.mineBlocks.bind(this));
    
    // バリデーター
    this.app.get('/api/validators', this.getValidators.bind(this));
    this.app.post('/api/validators/stake', this.stakeTokens.bind(this));
    this.app.post('/api/validators/unstake', this.unstakeTokens.bind(this));
    
    // コントラクト
    this.app.get('/api/contracts', this.getContracts.bind(this));
    this.app.get('/api/contracts/:address', this.getContract.bind(this));
    this.app.post('/api/contracts', this.deployContract.bind(this));
    this.app.post('/api/contracts/:address/execute', this.executeContract.bind(this));
    
    // ネットワーク統計
    this.app.get('/api/stats', this.getNetworkStats.bind(this));
    
    // フロントエンドのルート
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });
  }

  /**
   * ブロックチェーンを初期化する
   * @returns {boolean} 初期化が成功した場合はtrue
   */
  async initialize() {
    try {
      // ブロックチェーンの初期化
      await this.blockchain.initialized;
      
      // ストレージからウォレットを読み込む
      await this.loadWallets();
      
      // 管理者ウォレットを作成または更新
      let adminWallet;
      if (!this.wallets.has('admin')) {
        adminWallet = new Wallet();
        this.wallets.set('admin', adminWallet);
        await this.blockchain.saveWallet('admin', adminWallet);
        
        // 管理者に初期資金を与える
        const tx = new Transaction(
          'genesis',
          adminWallet.getPublicKey(),
          10000,
          'GENESIS_FUNDS'
        );
        
        // システムトランザクションなので検証をスキップ
        this.blockchain.pendingTransactions.push(tx);
        await this.blockchain.storage.saveTransaction(tx);
        await this.blockchain.storage.savePendingTransactions(this.blockchain.pendingTransactions);
      } else {
        adminWallet = this.wallets.get('admin');
      }
      
      // 管理者の残高を直接設定（常に実行）
      await this.blockchain.storage.saveAccountState(adminWallet.getPublicKey(), 10000);
      console.log(`管理者ウォレットの残高を 10000 に設定しました`);
      
      // コンセンサスを初期化
      await this.consensus.initialize();
      
      // コントラクトエンジンを初期化
      await this.contractEngine.initialized;
      
      // トークンコントラクトをデプロイ
      try {
        const tokenCode = TokenContract.getCode();
        const tokenContractAddress = await this.contractEngine.deployContract(
          tokenCode,
          adminWallet.getPublicKey()
        );
        console.log(`トークンコントラクトがデプロイされました: ${tokenContractAddress}`);
      } catch (error) {
        console.error('トークンコントラクトのデプロイエラー:', error);
      }
      
      console.log('ブロックチェーンサーバーが正常に初期化されました');
      return true;
    } catch (error) {
      console.error('ブロックチェーンサーバーの初期化に失敗しました:', error);
      return false;
    }
  }

  /**
   * ストレージからウォレットを読み込む
   */
  async loadWallets() {
    try {
      const wallets = await this.blockchain.getAllWallets();
      
      for (const wallet of wallets) {
        this.wallets.set(wallet.name, Wallet.fromKeyPair(wallet.publicKey, wallet.privateKey));
      }
      
      console.log(`${wallets.length} 個のウォレットをストレージから読み込みました`);
    } catch (error) {
      console.error('ウォレットの読み込みエラー:', error);
    }
  }

  /**
   * サーバーを起動する
   * @returns {Object} サーバーインスタンス
   */
  async start() {
    // 初期化が完了するまで待機
    await this.initialized;
    
    return this.app.listen(this.port, '0.0.0.0', () => {
      console.log(`ブロックチェーンサーバーがポート ${this.port} で実行中`);
    });
  }

  /**
   * ブロックチェーン情報を取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getBlockchainInfo(req, res) {
    try {
      const latestBlock = await this.blockchain.getLatestBlock();
      const stats = await this.blockchain.getStats();
      
      res.json({
        chain: this.blockchain.chain,
        height: this.blockchain.chain.length - 1,
        latestBlock,
        pendingTransactions: this.blockchain.pendingTransactions,
        validators: Array.from(this.blockchain.validators.entries()),
        stats
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * ブロックを取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getBlocks(req, res) {
    try {
      const { start = 0, limit = 10 } = req.query;
      const startIndex = parseInt(start);
      const limitCount = parseInt(limit);
      
      const blocks = [];
      const endIndex = Math.min(startIndex + limitCount, this.blockchain.chain.length);
      
      for (let i = startIndex; i < endIndex; i++) {
        blocks.push(this.blockchain.chain[i]);
      }
      
      res.json({
        blocks,
        total: this.blockchain.chain.length,
        start: startIndex,
        limit: limitCount
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * インデックスからブロックを取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getBlockByIndex(req, res) {
    try {
      const index = parseInt(req.params.index);
      const block = await this.blockchain.getBlockByIndex(index);
      
      if (!block) {
        return res.status(404).json({ error: 'ブロックが見つかりません' });
      }
      
      res.json(block);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * ハッシュからブロックを取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getBlockByHash(req, res) {
    try {
      const hash = req.params.hash;
      const block = await this.blockchain.getBlockByHash(hash);
      
      if (!block) {
        return res.status(404).json({ error: 'ブロックが見つかりません' });
      }
      
      res.json(block);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 保留中のトランザクションを取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getPendingTransactions(req, res) {
    try {
      res.json(this.blockchain.pendingTransactions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * トランザクションを取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getTransaction(req, res) {
    try {
      const hash = req.params.hash;
      const tx = await this.blockchain.storage.getTransaction(hash);
      
      if (!tx) {
        return res.status(404).json({ error: 'トランザクションが見つかりません' });
      }
      
      res.json(tx);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * トランザクションを作成する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async createTransaction(req, res) {
    try {
      const { fromWallet, toAddress, amount, data } = req.body;
      
      if (!fromWallet || !toAddress || !amount) {
        return res.status(400).json({ error: '送信元ウォレット、送信先アドレス、金額が必要です' });
      }
      
      const wallet = this.wallets.get(fromWallet);
      if (!wallet) {
        return res.status(404).json({ error: 'ウォレットが見つかりません' });
      }
      
      const tx = await wallet.createTransaction(toAddress, parseFloat(amount), data, this.blockchain);
      await this.blockchain.addTransaction(tx);
      
      res.json({ success: true, transaction: tx });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * ウォレットを取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getWallets(req, res) {
    try {
      const walletList = [];
      
      for (const [name, wallet] of this.wallets.entries()) {
        const balance = await this.blockchain.getBalanceOfAddress(wallet.getPublicKey());
        
        walletList.push({
          name,
          publicKey: wallet.getPublicKey(),
          balance
        });
      }
      
      res.json(walletList);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * ウォレットを取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getWallet(req, res) {
    try {
      const name = req.params.name;
      const wallet = this.wallets.get(name);
      
      if (!wallet) {
        return res.status(404).json({ error: 'ウォレットが見つかりません' });
      }
      
      const balance = await this.blockchain.getBalanceOfAddress(wallet.getPublicKey());
      
      res.json({
        name,
        publicKey: wallet.getPublicKey(),
        balance
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * ウォレットを作成する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async createWallet(req, res) {
    try {
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'ウォレット名が必要です' });
      }
      
      if (this.wallets.has(name)) {
        return res.status(400).json({ error: 'ウォレット名が既に存在します' });
      }
      
      const wallet = new Wallet();
      this.wallets.set(name, wallet);
      
      // ウォレットをストレージに保存
      await this.blockchain.saveWallet(name, wallet);
      
      // 新しいウォレットに初期資金を与える
      const tx = new Transaction(
        'genesis',
        wallet.getPublicKey(),
        1000,
        'INITIAL_FUNDS'
      );
      
      // システムトランザクションなので検証をスキップ
      this.blockchain.pendingTransactions.push(tx);
      await this.blockchain.storage.saveTransaction(tx);
      await this.blockchain.storage.savePendingTransactions(this.blockchain.pendingTransactions);
      
      // 残高を直接設定
      await this.blockchain.storage.saveAccountState(wallet.getPublicKey(), 1000);
      
      res.json({
        success: true,
        wallet: {
          name,
          publicKey: wallet.getPublicKey(),
          balance: 1000
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * ブロックをマイニングする
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async mineBlocks(req, res) {
    try {
      const { minerWallet } = req.body;
      
      if (!minerWallet) {
        return res.status(400).json({ error: 'マイナーウォレットが必要です' });
      }
      
      const wallet = this.wallets.get(minerWallet);
      if (!wallet) {
        return res.status(404).json({ error: 'ウォレットが見つかりません' });
      }
      
      // バリデーターが存在するか確認
      if (this.blockchain.validators.size === 0) {
        return res.status(400).json({ error: '利用可能なバリデーターがありません' });
      }
      
      const newBlocks = await this.blockchain.minePendingTransactions(wallet.getPublicKey());
      
      res.json({
        success: true,
        blocks: newBlocks,
        reward: this.blockchain.miningReward
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * バリデーターを取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getValidators(req, res) {
    try {
      const validators = await this.consensus.pos.getAllValidators();
      res.json(validators);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * トークンをステーキングする
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async stakeTokens(req, res) {
    try {
      const { walletName, amount } = req.body;
      
      if (!walletName || !amount) {
        return res.status(400).json({ error: 'ウォレット名と金額が必要です' });
      }
      
      const wallet = this.wallets.get(walletName);
      if (!wallet) {
        return res.status(404).json({ error: 'ウォレットが見つかりません' });
      }
      
      const stakeAmount = parseFloat(amount);
      if (stakeAmount < this.blockchain.minStake) {
        return res.status(400).json({ error: `最小ステーク量は ${this.blockchain.minStake} です` });
      }
      
      const balance = await this.blockchain.getBalanceOfAddress(wallet.getPublicKey());
      if (balance < stakeAmount) {
        return res.status(400).json({ error: 'ステーキングするための残高が不足しています' });
      }
      
      // バリデーターを追加
      await this.consensus.addValidator(wallet.getPublicKey(), stakeAmount);
      
      // ステーキングトランザクションを作成
      const tx = new Transaction(
        wallet.getPublicKey(),
        'STAKE',
        stakeAmount,
        'STAKE_VALIDATOR'
      );
      
      tx.signTransaction(wallet.keyPair);
      await this.blockchain.addTransaction(tx);
      
      // 残高を更新
      await this.blockchain.storage.saveAccountState(
        wallet.getPublicKey(),
        balance - stakeAmount
      );
      
      res.json({
        success: true,
        validator: {
          address: wallet.getPublicKey(),
          stake: stakeAmount
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * ステーキングを解除する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async unstakeTokens(req, res) {
    try {
      const { walletName } = req.body;
      
      if (!walletName) {
        return res.status(400).json({ error: 'ウォレット名が必要です' });
      }
      
      const wallet = this.wallets.get(walletName);
      if (!wallet) {
        return res.status(404).json({ error: 'ウォレットが見つかりません' });
      }
      
      const publicKey = wallet.getPublicKey();
      
      if (!this.blockchain.validators.has(publicKey)) {
        return res.status(400).json({ error: 'このウォレットはバリデーターではありません' });
      }
      
      const stakeAmount = this.blockchain.validators.get(publicKey);
      
      // バリデーターを削除
      await this.consensus.removeValidator(publicKey);
      
      // アンステーキングトランザクションを作成
      const tx = new Transaction(
        'STAKE',
        publicKey,
        stakeAmount,
        'UNSTAKE_VALIDATOR'
      );
      
      await this.blockchain.addTransaction(tx);
      
      // 残高を更新
      const balance = await this.blockchain.getBalanceOfAddress(publicKey);
      await this.blockchain.storage.saveAccountState(
        publicKey,
        balance + stakeAmount
      );
      
      res.json({
        success: true,
        unstaked: stakeAmount
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * コントラクトを取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getContracts(req, res) {
    try {
      const contracts = await this.contractEngine.getAllContracts();
      res.json(contracts);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * コントラクトを取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getContract(req, res) {
    try {
      const address = req.params.address;
      
      const code = await this.contractEngine.getContractCode(address);
      const state = await this.contractEngine.getContractState(address);
      const owner = await this.contractEngine.getContractOwner(address);
      
      res.json({
        address,
        owner,
        code,
        state
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * コントラクトをデプロイする
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async deployContract(req, res) {
    try {
      const { walletName, code } = req.body;
      
      if (!walletName || !code) {
        return res.status(400).json({ error: 'ウォレット名とコードが必要です' });
      }
      
      const wallet = this.wallets.get(walletName);
      if (!wallet) {
        return res.status(404).json({ error: 'ウォレットが見つかりません' });
      }
      
      const contractAddress = await this.contractEngine.deployContract(
        code,
        wallet.getPublicKey()
      );
      
      res.json({
        success: true,
        contractAddress
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * コントラクトを実行する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async executeContract(req, res) {
    try {
      const { walletName, method, params } = req.body;
      const contractAddress = req.params.address;
      
      if (!walletName || !method) {
        return res.status(400).json({ error: 'ウォレット名とメソッドが必要です' });
      }
      
      const wallet = this.wallets.get(walletName);
      if (!wallet) {
        return res.status(404).json({ error: 'ウォレットが見つかりません' });
      }
      
      const result = await this.contractEngine.executeContract(
        contractAddress,
        method,
        params || {},
        wallet.getPublicKey()
      );
      
      res.json({
        success: true,
        result
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * ネットワーク統計を取得する
   * @param {Object} req - リクエスト
   * @param {Object} res - レスポンス
   */
  async getNetworkStats(req, res) {
    try {
      const blockchainStats = await this.blockchain.getStats();
      const networkStats = await this.consensus.getNetworkStats();
      
      res.json({
        ...blockchainStats,
        ...networkStats,
        walletCount: this.wallets.size,
        contractCount: (await this.contractEngine.getAllContracts()).length
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = BlockchainServer;