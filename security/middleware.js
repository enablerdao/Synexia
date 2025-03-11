const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss-clean');
const hpp = require('hpp');
const cors = require('cors');
const { body, validationResult } = require('express-validator');

/**
 * セキュリティミドルウェアを設定する
 * @param {Object} app - Expressアプリケーション
 */
function setupSecurityMiddleware(app) {
  // Helmet - HTTPヘッダーのセキュリティ
  app.use(helmet());
  
  // CORS設定
  app.use(cors({
    origin: '*', // 本番環境では適切に制限する
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
  // レート制限 - APIリクエスト
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 100, // IPごとに100リクエスト
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 429,
      error: 'Too many requests, please try again later.'
    }
  });
  
  // レート制限 - ログイン/認証
  const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1時間
    max: 10, // IPごとに10リクエスト
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 429,
      error: 'Too many authentication attempts, please try again later.'
    }
  });
  
  // XSS防止
  app.use(xss());
  
  // HTTPパラメータ汚染防止
  app.use(hpp());
  
  // APIルートにレート制限を適用
  app.use('/api/', apiLimiter);
  
  // 認証ルートに厳しいレート制限を適用
  app.use('/api/auth/', authLimiter);
  
  return {
    apiLimiter,
    authLimiter
  };
}

/**
 * トランザクション検証ミドルウェア
 */
const validateTransaction = [
  body('fromWallet').notEmpty().withMessage('送信元ウォレットは必須です'),
  body('toAddress').notEmpty().withMessage('送信先アドレスは必須です'),
  body('amount').isNumeric().withMessage('金額は数値である必要があります')
    .custom(value => value > 0).withMessage('金額は0より大きい必要があります'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

/**
 * ウォレット作成検証ミドルウェア
 */
const validateWalletCreation = [
  body('name').notEmpty().withMessage('ウォレット名は必須です')
    .isLength({ min: 3, max: 30 }).withMessage('ウォレット名は3〜30文字である必要があります')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('ウォレット名は英数字、アンダースコア、ハイフンのみ使用できます'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

/**
 * ステーキング検証ミドルウェア
 */
const validateStaking = [
  body('walletName').notEmpty().withMessage('ウォレット名は必須です'),
  body('amount').isNumeric().withMessage('金額は数値である必要があります')
    .custom(value => value >= 1000).withMessage('ステーク量は1000以上である必要があります'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

/**
 * コントラクトデプロイ検証ミドルウェア
 */
const validateContractDeployment = [
  body('walletName').notEmpty().withMessage('ウォレット名は必須です'),
  body('code').notEmpty().withMessage('コントラクトコードは必須です')
    .isLength({ min: 10 }).withMessage('コントラクトコードが短すぎます'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

/**
 * コントラクト実行検証ミドルウェア
 */
const validateContractExecution = [
  body('walletName').notEmpty().withMessage('ウォレット名は必須です'),
  body('method').notEmpty().withMessage('メソッド名は必須です'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

module.exports = {
  setupSecurityMiddleware,
  validateTransaction,
  validateWalletCreation,
  validateStaking,
  validateContractDeployment,
  validateContractExecution
};