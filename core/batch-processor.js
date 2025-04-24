/**
 * バッチプロセッサークラス
 * トランザクションのバッチ処理を行い、パフォーマンスを向上させる
 */
class BatchProcessor {
  /**
   * バッチプロセッサーを初期化する
   * @param {Object} options - バッチ処理オプション
   */
  constructor(options = {}) {
    this.options = {
      batchSize: options.batchSize || 100,
      batchInterval: options.batchInterval || 5000, // 5秒
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000, // 1秒
      ...options
    };
    
    this.queue = [];
    this.processing = false;
    this.timer = null;
    
    // 統計情報
    this.stats = {
      totalProcessed: 0,
      totalBatches: 0,
      totalErrors: 0,
      totalRetries: 0,
      averageBatchSize: 0,
      averageProcessingTime: 0
    };
  }
  
  /**
   * アイテムをキューに追加する
   * @param {*} item - 処理するアイテム
   * @returns {Promise} 処理が完了したときに解決されるPromise
   */
  enqueue(item) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        item,
        resolve,
        reject,
        retries: 0
      });
      
      // タイマーが設定されていない場合は設定する
      if (!this.timer) {
        this.timer = setTimeout(() => this.processBatch(), this.options.batchInterval);
      }
      
      // バッチサイズに達した場合は即時処理
      if (this.queue.length >= this.options.batchSize) {
        clearTimeout(this.timer);
        this.timer = null;
        this.processBatch();
      }
    });
  }
  
  /**
   * バッチを処理する
   * @private
   */
  async processBatch() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    this.timer = null;
    
    // 現在のバッチを取得
    const batchSize = Math.min(this.queue.length, this.options.batchSize);
    const batch = this.queue.splice(0, batchSize);
    
    const startTime = Date.now();
    
    try {
      // バッチ処理を実行
      const results = await this.options.processBatch(batch.map(item => item.item));
      
      // 結果を各Promiseに返す
      batch.forEach((item, index) => {
        item.resolve(results[index]);
      });
      
      // 統計情報を更新
      this.stats.totalProcessed += batch.length;
      this.stats.totalBatches++;
      this.stats.averageBatchSize = this.stats.totalProcessed / this.stats.totalBatches;
      this.stats.averageProcessingTime = (
        (this.stats.averageProcessingTime * (this.stats.totalBatches - 1)) +
        (Date.now() - startTime)
      ) / this.stats.totalBatches;
      
    } catch (error) {
      this.stats.totalErrors++;
      
      // 各アイテムを再試行キューに戻すか、エラーを返す
      batch.forEach(item => {
        if (item.retries < this.options.maxRetries) {
          item.retries++;
          this.stats.totalRetries++;
          
          // 遅延して再キューイング
          setTimeout(() => {
            this.queue.unshift(item);
          }, this.options.retryDelay * item.retries);
        } else {
          item.reject(error);
        }
      });
    } finally {
      this.processing = false;
      
      // キューにアイテムが残っている場合は次のバッチを処理
      if (this.queue.length > 0) {
        this.timer = setTimeout(() => this.processBatch(), this.options.batchInterval);
      }
    }
  }
  
  /**
   * 統計情報を取得する
   * @returns {Object} 統計情報
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      isProcessing: this.processing
    };
  }
  
  /**
   * すべてのキューアイテムを処理する
   * @returns {Promise} すべての処理が完了したときに解決されるPromise
   */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    // キューが空になるまで処理
    while (this.queue.length > 0) {
      await this.processBatch();
    }
  }
  
  /**
   * リソースを解放する
   */
  dispose() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    // 未処理のアイテムをすべて拒否
    this.queue.forEach(item => {
      item.reject(new Error('BatchProcessor was disposed'));
    });
    
    this.queue = [];
    this.processing = false;
  }
}

module.exports = BatchProcessor;