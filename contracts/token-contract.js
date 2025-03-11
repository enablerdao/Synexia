/**
 * 標準トークンコントラクト
 * ERC-20に似た機能を提供
 */
class TokenContract {
  /**
   * コントラクトを初期化する
   * @param {string} name - トークン名
   * @param {string} symbol - トークンシンボル
   * @param {number} decimals - 小数点以下の桁数
   * @param {number} totalSupply - 総供給量
   * @param {string} owner - コントラクト所有者のアドレス
   */
  constructor(name, symbol, decimals, totalSupply, owner) {
    this.name = name;
    this.symbol = symbol;
    this.decimals = decimals;
    this.totalSupply = totalSupply;
    this.owner = owner;
    this.balances = {};
    this.allowances = {};
    
    // 初期供給量を所有者に割り当て
    this.balances[owner] = totalSupply;
  }

  /**
   * 残高を取得する
   * @param {string} address - アドレス
   * @returns {number} 残高
   */
  balanceOf(address) {
    return this.balances[address] || 0;
  }

  /**
   * トークンを転送する
   * @param {string} from - 送信元アドレス
   * @param {string} to - 送信先アドレス
   * @param {number} amount - 金額
   * @returns {boolean} 転送が成功した場合はtrue
   */
  transfer(from, to, amount) {
    if (!from || !to || amount <= 0) {
      return false;
    }
    
    const fromBalance = this.balanceOf(from);
    if (fromBalance < amount) {
      return false;
    }
    
    this.balances[from] = fromBalance - amount;
    this.balances[to] = (this.balances[to] || 0) + amount;
    
    return true;
  }

  /**
   * 代理人に転送権限を与える
   * @param {string} owner - 所有者アドレス
   * @param {string} spender - 代理人アドレス
   * @param {number} amount - 金額
   * @returns {boolean} 承認が成功した場合はtrue
   */
  approve(owner, spender, amount) {
    if (!owner || !spender || amount < 0) {
      return false;
    }
    
    if (!this.allowances[owner]) {
      this.allowances[owner] = {};
    }
    
    this.allowances[owner][spender] = amount;
    return true;
  }

  /**
   * 承認された金額を取得する
   * @param {string} owner - 所有者アドレス
   * @param {string} spender - 代理人アドレス
   * @returns {number} 承認された金額
   */
  allowance(owner, spender) {
    if (!owner || !spender) {
      return 0;
    }
    
    if (!this.allowances[owner]) {
      return 0;
    }
    
    return this.allowances[owner][spender] || 0;
  }

  /**
   * 代理人がトークンを転送する
   * @param {string} spender - 代理人アドレス
   * @param {string} from - 送信元アドレス
   * @param {string} to - 送信先アドレス
   * @param {number} amount - 金額
   * @returns {boolean} 転送が成功した場合はtrue
   */
  transferFrom(spender, from, to, amount) {
    if (!spender || !from || !to || amount <= 0) {
      return false;
    }
    
    const allowedAmount = this.allowance(from, spender);
    if (allowedAmount < amount) {
      return false;
    }
    
    const fromBalance = this.balanceOf(from);
    if (fromBalance < amount) {
      return false;
    }
    
    this.balances[from] = fromBalance - amount;
    this.balances[to] = (this.balances[to] || 0) + amount;
    
    this.allowances[from][spender] = allowedAmount - amount;
    
    return true;
  }

  /**
   * 新しいトークンを発行する（所有者のみ）
   * @param {string} caller - 呼び出し元アドレス
   * @param {string} to - 送信先アドレス
   * @param {number} amount - 金額
   * @returns {boolean} 発行が成功した場合はtrue
   */
  mint(caller, to, amount) {
    if (caller !== this.owner) {
      return false;
    }
    
    if (!to || amount <= 0) {
      return false;
    }
    
    this.totalSupply += amount;
    this.balances[to] = (this.balances[to] || 0) + amount;
    
    return true;
  }

  /**
   * トークンを焼却する
   * @param {string} from - 送信元アドレス
   * @param {number} amount - 金額
   * @returns {boolean} 焼却が成功した場合はtrue
   */
  burn(from, amount) {
    if (!from || amount <= 0) {
      return false;
    }
    
    const fromBalance = this.balanceOf(from);
    if (fromBalance < amount) {
      return false;
    }
    
    this.balances[from] = fromBalance - amount;
    this.totalSupply -= amount;
    
    return true;
  }

  /**
   * コントラクト所有者を変更する（所有者のみ）
   * @param {string} caller - 呼び出し元アドレス
   * @param {string} newOwner - 新しい所有者アドレス
   * @returns {boolean} 変更が成功した場合はtrue
   */
  transferOwnership(caller, newOwner) {
    if (caller !== this.owner) {
      return false;
    }
    
    if (!newOwner) {
      return false;
    }
    
    this.owner = newOwner;
    return true;
  }

  /**
   * コントラクトの状態をJSON形式で取得する
   * @returns {Object} コントラクトの状態
   */
  getState() {
    return {
      name: this.name,
      symbol: this.symbol,
      decimals: this.decimals,
      totalSupply: this.totalSupply,
      owner: this.owner,
      balances: this.balances,
      allowances: this.allowances
    };
  }

  /**
   * JSON形式からコントラクトを復元する
   * @param {Object} json - JSON形式のコントラクト状態
   * @returns {TokenContract} 復元されたコントラクト
   */
  static fromState(json) {
    const contract = new TokenContract(
      json.name,
      json.symbol,
      json.decimals,
      json.totalSupply,
      json.owner
    );
    
    contract.balances = json.balances || {};
    contract.allowances = json.allowances || {};
    
    return contract;
  }

  /**
   * コントラクトコードを文字列形式で取得する
   * @returns {string} コントラクトコード
   */
  static getCode() {
    return `
      contract TokenContract {
        string public name;
        string public symbol;
        uint8 public decimals;
        uint256 public totalSupply;
        address public owner;
        
        mapping(address => uint256) public balances;
        mapping(address => mapping(address => uint256)) public allowances;
        
        constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _totalSupply) {
          name = _name;
          symbol = _symbol;
          decimals = _decimals;
          totalSupply = _totalSupply;
          owner = msg.sender;
          balances[msg.sender] = _totalSupply;
        }
        
        function balanceOf(address account) public view returns (uint256) {
          return balances[account];
        }
        
        function transfer(address to, uint256 amount) public returns (bool) {
          require(balances[msg.sender] >= amount, "Insufficient balance");
          balances[msg.sender] -= amount;
          balances[to] += amount;
          return true;
        }
        
        function approve(address spender, uint256 amount) public returns (bool) {
          allowances[msg.sender][spender] = amount;
          return true;
        }
        
        function allowance(address owner, address spender) public view returns (uint256) {
          return allowances[owner][spender];
        }
        
        function transferFrom(address from, address to, uint256 amount) public returns (bool) {
          require(allowances[from][msg.sender] >= amount, "Insufficient allowance");
          require(balances[from] >= amount, "Insufficient balance");
          
          balances[from] -= amount;
          balances[to] += amount;
          allowances[from][msg.sender] -= amount;
          
          return true;
        }
        
        function mint(address to, uint256 amount) public returns (bool) {
          require(msg.sender == owner, "Only owner can mint");
          
          totalSupply += amount;
          balances[to] += amount;
          
          return true;
        }
        
        function burn(uint256 amount) public returns (bool) {
          require(balances[msg.sender] >= amount, "Insufficient balance");
          
          balances[msg.sender] -= amount;
          totalSupply -= amount;
          
          return true;
        }
        
        function transferOwnership(address newOwner) public returns (bool) {
          require(msg.sender == owner, "Only owner can transfer ownership");
          
          owner = newOwner;
          return true;
        }
      }
    `;
  }
}

module.exports = TokenContract;