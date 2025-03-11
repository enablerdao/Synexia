/**
 * 有向非循環グラフ（DAG）クラス
 * ブロックチェーンの並列処理を可能にする構造
 */
class DAG {
  /**
   * DAGを初期化する
   */
  constructor() {
    this.vertices = new Map(); // hash -> { block, parents: [], children: [] }
    this.tips = new Set(); // Current tips (blocks with no children)
  }

  /**
   * 頂点（ブロック）を追加する
   * @param {Object} block - 追加するブロック
   * @returns {boolean} 追加が成功した場合はtrue
   */
  addVertex(block) {
    const hash = block.hash;
    
    if (this.vertices.has(hash)) {
      return false; // 既に存在する
    }
    
    // 新しい頂点を作成
    const vertex = {
      block,
      parents: [],
      children: []
    };
    
    this.vertices.set(hash, vertex);
    
    // 親ブロックとの接続
    if (block.previousHash !== '0') {
      this.addEdge(block.previousHash, hash);
    }
    
    // 参照ブロックとの接続（DAG構造）
    if (block.references && Array.isArray(block.references)) {
      for (const refHash of block.references) {
        this.addEdge(refHash, hash);
      }
    }
    
    // tipsを更新
    this.tips.add(hash);
    for (const parent of vertex.parents) {
      this.tips.delete(parent);
    }
    
    return true;
  }

  /**
   * エッジ（ブロック間の接続）を追加する
   * @param {string} parentHash - 親ブロックのハッシュ
   * @param {string} childHash - 子ブロックのハッシュ
   * @returns {boolean} 追加が成功した場合はtrue
   */
  addEdge(parentHash, childHash) {
    const parentVertex = this.vertices.get(parentHash);
    const childVertex = this.vertices.get(childHash);

    if (!parentVertex || !childVertex) {
      return false;
    }

    // 親子関係を追加
    if (!parentVertex.children.includes(childHash)) {
      parentVertex.children.push(childHash);
    }
    
    if (!childVertex.parents.includes(parentHash)) {
      childVertex.parents.push(parentHash);
    }

    return true;
  }

  /**
   * 現在のtips（子を持たないブロック）を取得する
   * @returns {Array} tipsのハッシュ配列
   */
  getTips() {
    return Array.from(this.tips);
  }

  /**
   * 最長パスを見つける（メインチェーン）
   * @returns {Array} 最長パスのハッシュ配列
   */
  findLongestPath() {
    // 各頂点の深さを計算
    const depths = new Map();
    const visited = new Set();
    
    // 深さ優先探索で深さを計算
    const calculateDepth = (hash) => {
      if (visited.has(hash)) {
        return depths.get(hash);
      }
      
      visited.add(hash);
      
      const vertex = this.vertices.get(hash);
      if (!vertex) return 0;
      
      if (vertex.parents.length === 0) {
        depths.set(hash, 0);
        return 0;
      }
      
      let maxParentDepth = -1;
      for (const parentHash of vertex.parents) {
        const parentDepth = calculateDepth(parentHash);
        maxParentDepth = Math.max(maxParentDepth, parentDepth);
      }
      
      const depth = maxParentDepth + 1;
      depths.set(hash, depth);
      return depth;
    };
    
    // 全てのtipsから深さを計算
    for (const tip of this.tips) {
      calculateDepth(tip);
    }
    
    // 最も深いtipを見つける
    let deepestTip = null;
    let maxDepth = -1;
    
    for (const tip of this.tips) {
      const depth = depths.get(tip) || 0;
      if (depth > maxDepth) {
        maxDepth = depth;
        deepestTip = tip;
      }
    }
    
    // 最長パスを構築
    const path = [];
    let current = deepestTip;
    
    while (current) {
      path.unshift(current); // 先頭に追加
      
      const vertex = this.vertices.get(current);
      if (!vertex || vertex.parents.length === 0) {
        break;
      }
      
      // 最も深い親を選択
      let deepestParent = null;
      let maxParentDepth = -1;
      
      for (const parentHash of vertex.parents) {
        const parentDepth = depths.get(parentHash) || 0;
        if (parentDepth > maxParentDepth) {
          maxParentDepth = parentDepth;
          deepestParent = parentHash;
        }
      }
      
      current = deepestParent;
    }
    
    return path;
  }

  /**
   * 特定のブロックの子ブロックを取得する
   * @param {string} hash - ブロックのハッシュ
   * @returns {Array} 子ブロックのハッシュ配列
   */
  getChildren(hash) {
    const vertex = this.vertices.get(hash);
    if (!vertex) return [];
    return [...vertex.children];
  }

  /**
   * 特定のブロックの親ブロックを取得する
   * @param {string} hash - ブロックのハッシュ
   * @returns {Array} 親ブロックのハッシュ配列
   */
  getParents(hash) {
    const vertex = this.vertices.get(hash);
    if (!vertex) return [];
    return [...vertex.parents];
  }

  /**
   * DAGのサイズ（頂点数）を取得する
   * @returns {number} 頂点数
   */
  size() {
    return this.vertices.size;
  }

  /**
   * DAGをJSON形式に変換する
   * @returns {Object} JSON形式のDAG
   */
  toJSON() {
    const vertices = {};
    
    for (const [hash, vertex] of this.vertices.entries()) {
      vertices[hash] = {
        parents: vertex.parents,
        children: vertex.children
      };
    }
    
    return {
      vertices,
      tips: Array.from(this.tips)
    };
  }

  /**
   * JSON形式からDAGを復元する
   * @param {Object} json - JSON形式のDAG
   * @param {Map} blocksMap - ハッシュからブロックへのマップ
   * @returns {DAG} 復元されたDAG
   */
  static fromJSON(json, blocksMap) {
    const dag = new DAG();
    
    // 頂点を追加
    for (const [hash, vertexData] of Object.entries(json.vertices)) {
      const block = blocksMap.get(hash);
      if (block) {
        dag.addVertex(block);
      }
    }
    
    // エッジを追加
    for (const [hash, vertexData] of Object.entries(json.vertices)) {
      for (const childHash of vertexData.children) {
        dag.addEdge(hash, childHash);
      }
    }
    
    // tipsを復元
    dag.tips = new Set(json.tips);
    
    return dag;
  }
}

module.exports = DAG;