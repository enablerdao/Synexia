const BlockchainServer = require('./api/server');
const fs = require('fs');
const path = require('path');

// データディレクトリを作成
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ポート番号を取得
const port = process.env.PORT || 53839;

// サーバーを初期化
const server = new BlockchainServer({
  port,
  dataDir
});

// サーバーを起動
async function startServer() {
  try {
    await server.start();
    console.log(`Synexiaブロックチェーンサーバーが http://localhost:${port} で実行中`);
    console.log('Ctrl+Cでサーバーを停止');
  } catch (error) {
    console.error('サーバー起動エラー:', error);
    process.exit(1);
  }
}

// サーバーを起動
startServer();

// 終了処理
process.on('SIGINT', async () => {
  console.log('サーバーを終了しています...');
  try {
    await server.blockchain.close();
    process.exit(0);
  } catch (error) {
    console.error('終了エラー:', error);
    process.exit(1);
  }
});