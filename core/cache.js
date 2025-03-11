/**
 * キャッシュマネージャークラス
 * ブロックチェーンのパフォーマンスを向上させるためのキャッシュ層
 */
class CacheManager {
  /**
   * キャッシュマネージャーを初期化する
   * @param {Object} options - キャッシュオプション
   */
  constructor(options = {}) {
    this.options = {
      maxSize: options.maxSize || 1000,
      ttl: options.ttl || 60 * 60 * 1000, // デフォルト1時間
      ...options
    };
    
    // キャッシュストア
    this.cache = new Map();
    this.keyTimestamps = new Map();
    
    // 統計情報
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
    
    // 定期的なクリーンアップ
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000); // 1分ごとにクリーンアップ
  }
  
  /**
   * キャッシュからアイテムを取得する
   * @param {string} key - キャッシュキー
   * @returns {*} キャッシュされた値、存在しない場合はnull
   */
  get(key) {
    if (!this.cache.has(key)) {
      this.stats.misses++;
      return null;
    }
    
    const timestamp = this.keyTimestamps.get(key);
    const now = Date.now();
    
    // TTLチェック
    if (now - timestamp > this.options.ttl) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return this.cache.get(key);
  }
  
  /**
   * キャッシュにアイテムを設定する
   * @param {string} key - キャッシュキー
   * @param {*} value - キャッシュする値
   * @param {number} [ttl] - このエントリの有効期限（ミリ秒）
   */
  set(key, value, ttl = null) {
    // キャッシュサイズチェック
    if (this.cache.size >= this.options.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, value);
    this.keyTimestamps.set(key, Date.now());
    this.stats.sets++;
    
    // 個別のTTLを設定
    if (ttl) {
      setTimeout(() => {
        this.delete(key);
      }, ttl);
    }
  }
  
  /**
   * キャッシュからアイテムを削除する
   * @param {string} key - キャッシュキー
   * @returns {boolean} 削除が成功した場合はtrue
   */
  delete(key) {
    const result = this.cache.delete(key);
    if (result) {
      this.keyTimestamps.delete(key);
    }
    return result;
  }
  
  /**
   * キャッシュをクリアする
   */
  clear() {
    this.cache.clear();
    this.keyTimestamps.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
  }
  
  /**
   * 期限切れのキャッシュエントリをクリーンアップする
   */
  cleanup() {
    const now = Date.now();
    
    for (const [key, timestamp] of this.keyTimestamps.entries()) {
      if (now - timestamp > this.options.ttl) {
        this.delete(key);
        this.stats.evictions++;
      }
    }
  }
  
  /**
   * 最も古いキャッシュエントリを削除する
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, timestamp] of this.keyTimestamps.entries()) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
    }
  }
  
  /**
   * キャッシュの統計情報を取得する
   * @returns {Object} 統計情報
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
      : 0;
    
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hitRate: `${hitRate.toFixed(2)}%`
    };
  }
  
  /**
   * リソースを解放する
   */
  dispose() {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}

module.exports = CacheManager;