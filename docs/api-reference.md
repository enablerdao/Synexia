# Synexia API リファレンス

このドキュメントでは、SynexiaブロックチェーンのAPIエンドポイントについて説明します。

## 基本情報

- **ベースURL**: `http://localhost:3000/api`
- **コンテンツタイプ**: `application/json`

## 認証

現在、APIは認証を必要としません。将来的にはJWTベースの認証が実装される予定です。

## エンドポイント

### ブロックチェーン情報

#### ブロックチェーン情報の取得

```
GET /blockchain
```

**レスポンス**:

```json
{
  "chain": [...],
  "height": 10,
  "latestBlock": {...},
  "pendingTransactions": [...],
  "validators": [...],
  "stats": {...}
}
```

#### ブロックのリスト取得

```
GET /blocks
```

**クエリパラメータ**:

- `start` (オプション): 開始インデックス (デフォルト: 0)
- `limit` (オプション): 取得するブロック数 (デフォルト: 10)

**レスポンス**:

```json
{
  "blocks": [...],
  "total": 100,
  "start": 0,
  "limit": 10
}
```

#### インデックスによるブロック取得

```
GET /blocks/:index
```

**パスパラメータ**:

- `index`: ブロックインデックス

**レスポンス**:

```json
{
  "index": 1,
  "timestamp": 1647270000000,
  "transactions": [...],
  "previousHash": "...",
  "hash": "...",
  "validator": "..."
}
```

#### ハッシュによるブロック取得

```
GET /blocks/hash/:hash
```

**パスパラメータ**:

- `hash`: ブロックハッシュ

**レスポンス**:

```json
{
  "index": 1,
  "timestamp": 1647270000000,
  "transactions": [...],
  "previousHash": "...",
  "hash": "...",
  "validator": "..."
}
```

### トランザクション

#### 保留中のトランザクション取得

```
GET /transactions
```

**レスポンス**:

```json
[
  {
    "fromAddress": "...",
    "toAddress": "...",
    "amount": 100,
    "timestamp": 1647270000000,
    "data": "...",
    "signature": "..."
  },
  ...
]
```

#### トランザクション取得

```
GET /transactions/:hash
```

**パスパラメータ**:

- `hash`: トランザクションハッシュ

**レスポンス**:

```json
{
  "fromAddress": "...",
  "toAddress": "...",
  "amount": 100,
  "timestamp": 1647270000000,
  "data": "...",
  "signature": "..."
}
```

#### トランザクション作成

```
POST /transactions
```

**リクエストボディ**:

```json
{
  "fromWallet": "walletName",
  "toAddress": "recipientAddress",
  "amount": 100,
  "data": "Optional data"
}
```

**レスポンス**:

```json
{
  "success": true,
  "transaction": {
    "fromAddress": "...",
    "toAddress": "...",
    "amount": 100,
    "timestamp": 1647270000000,
    "data": "...",
    "signature": "..."
  }
}
```

### ウォレット

#### ウォレットリスト取得

```
GET /wallets
```

**レスポンス**:

```json
[
  {
    "name": "wallet1",
    "publicKey": "...",
    "balance": 1000
  },
  ...
]
```

#### ウォレット取得

```
GET /wallet/:name
```

**パスパラメータ**:

- `name`: ウォレット名

**レスポンス**:

```json
{
  "name": "wallet1",
  "publicKey": "...",
  "balance": 1000
}
```

#### ウォレット作成

```
POST /wallet
```

**リクエストボディ**:

```json
{
  "name": "newWallet"
}
```

**レスポンス**:

```json
{
  "success": true,
  "wallet": {
    "name": "newWallet",
    "publicKey": "...",
    "balance": 1000
  }
}
```

### マイニング

#### ブロックのマイニング

```
POST /mine
```

**リクエストボディ**:

```json
{
  "minerWallet": "walletName"
}
```

**レスポンス**:

```json
{
  "success": true,
  "blocks": [...],
  "reward": 100
}
```

### バリデーター

#### バリデーターリスト取得

```
GET /validators
```

**レスポンス**:

```json
[
  {
    "address": "...",
    "stake": 1000
  },
  ...
]
```

#### トークンのステーキング

```
POST /validators/stake
```

**リクエストボディ**:

```json
{
  "walletName": "walletName",
  "amount": 1000
}
```

**レスポンス**:

```json
{
  "success": true,
  "validator": {
    "address": "...",
    "stake": 1000
  }
}
```

#### ステーキングの解除

```
POST /validators/unstake
```

**リクエストボディ**:

```json
{
  "walletName": "walletName"
}
```

**レスポンス**:

```json
{
  "success": true,
  "unstaked": 1000
}
```

### スマートコントラクト

#### コントラクトリスト取得

```
GET /contracts
```

**レスポンス**:

```json
[
  {
    "address": "...",
    "owner": "...",
    "codeSize": 1024
  },
  ...
]
```

#### コントラクト取得

```
GET /contracts/:address
```

**パスパラメータ**:

- `address`: コントラクトアドレス

**レスポンス**:

```json
{
  "address": "...",
  "owner": "...",
  "code": "...",
  "state": {...}
}
```

#### コントラクトデプロイ

```
POST /contracts
```

**リクエストボディ**:

```json
{
  "walletName": "walletName",
  "code": "contract code..."
}
```

**レスポンス**:

```json
{
  "success": true,
  "contractAddress": "..."
}
```

#### コントラクト実行

```
POST /contracts/:address/execute
```

**パスパラメータ**:

- `address`: コントラクトアドレス

**リクエストボディ**:

```json
{
  "walletName": "walletName",
  "method": "methodName",
  "params": {...}
}
```

**レスポンス**:

```json
{
  "success": true,
  "result": {...}
}
```

### ネットワーク統計

#### 統計情報取得

```
GET /stats
```

**レスポンス**:

```json
{
  "blockCount": 100,
  "transactionCount": 500,
  "pendingTransactions": 10,
  "validatorCount": 5,
  "totalValue": 10000,
  "averageBlockTime": 5.2,
  "cacheStats": {...},
  "batchProcessorStats": {...},
  "walletCount": 20,
  "contractCount": 5
}
```

## エラーレスポンス

エラーが発生した場合、APIは適切なHTTPステータスコードと以下の形式のJSONレスポンスを返します：

```json
{
  "error": "エラーメッセージ"
}
```

または、バリデーションエラーの場合：

```json
{
  "errors": [
    {
      "param": "amount",
      "msg": "金額は0より大きい必要があります",
      "location": "body"
    }
  ]
}
```

## レート制限

APIには以下のレート制限が適用されます：

- 一般的なAPIリクエスト: 15分間に100リクエスト
- 認証関連のリクエスト: 1時間に10リクエスト

レート制限を超えた場合、429ステータスコードが返されます。