document.addEventListener('DOMContentLoaded', () => {
  // APIエンドポイント
  const API_URL = '';
  
  // DOM要素
  const navLinks = document.querySelectorAll('.navbar-menu a');
  const pages = document.querySelectorAll('.page');
  const toast = document.getElementById('toast');
  const toastTitle = document.getElementById('toast-title');
  const toastMessage = document.getElementById('toast-message');
  const toastClose = document.getElementById('toast-close');
  const loadingOverlay = document.getElementById('loading-overlay');
  
  // ブロックチェーンページ要素
  const blockchainHeight = document.getElementById('blockchain-height');
  const blockchainTransactions = document.getElementById('blockchain-transactions');
  const blockchainValidators = document.getElementById('blockchain-validators');
  const blockchainPending = document.getElementById('blockchain-pending');
  const blocksTable = document.getElementById('blocks-table');
  const minerWalletSelect = document.getElementById('miner-wallet');
  const mineButton = document.getElementById('mine-button');
  
  // ウォレットページ要素
  const walletNameInput = document.getElementById('wallet-name');
  const createWalletButton = document.getElementById('create-wallet-button');
  const stakeWalletSelect = document.getElementById('stake-wallet');
  const stakeAmountInput = document.getElementById('stake-amount');
  const stakeButton = document.getElementById('stake-button');
  const walletsTable = document.getElementById('wallets-table');
  
  // トランザクションページ要素
  const txFromWalletSelect = document.getElementById('tx-from-wallet');
  const txToWalletSelect = document.getElementById('tx-to-wallet');
  const txAmountInput = document.getElementById('tx-amount');
  const txDataInput = document.getElementById('tx-data');
  const createTxButton = document.getElementById('create-tx-button');
  const pendingTransactionsTable = document.getElementById('pending-transactions-table');
  
  // スマートコントラクトページ要素
  const contractOwnerWalletSelect = document.getElementById('contract-owner-wallet');
  const contractCodeTextarea = document.getElementById('contract-code');
  const deployContractButton = document.getElementById('deploy-contract-button');
  const executeContractSelect = document.getElementById('execute-contract');
  const contractCallerWalletSelect = document.getElementById('contract-caller-wallet');
  const contractMethodInput = document.getElementById('contract-method');
  const contractParamsTextarea = document.getElementById('contract-params');
  const executeContractButton = document.getElementById('execute-contract-button');
  const contractsTable = document.getElementById('contracts-table');
  
  // ナビゲーション
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetPage = link.getAttribute('data-page');
      
      // アクティブなリンクを更新
      navLinks.forEach(navLink => navLink.classList.remove('active'));
      link.classList.add('active');
      
      // ページを切り替え
      pages.forEach(page => {
        if (page.id === `${targetPage}-page`) {
          page.style.display = 'block';
        } else {
          page.style.display = 'none';
        }
      });
      
      // ページに応じたデータを読み込む
      if (targetPage === 'blockchain') {
        fetchBlockchain();
      } else if (targetPage === 'wallets') {
        fetchWallets();
      } else if (targetPage === 'transactions') {
        fetchTransactions();
      } else if (targetPage === 'smart-contracts') {
        fetchContracts();
      }
    });
  });
  
  // トースト通知
  function showToast(title, message, isError = false) {
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    
    toast.className = 'toast show';
    if (isError) {
      toast.classList.add('error');
    } else {
      toast.classList.add('success');
    }
    
    setTimeout(() => {
      hideToast();
    }, 5000);
  }
  
  function hideToast() {
    toast.className = 'toast';
  }
  
  toastClose.addEventListener('click', hideToast);
  
  // ローディング表示
  function showLoading() {
    loadingOverlay.classList.add('show');
  }
  
  function hideLoading() {
    loadingOverlay.classList.remove('show');
  }
  
  // ユーティリティ関数
  function truncateString(str, length) {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length) + '...';
  }
  
  // API Functions
  async function fetchBlockchain() {
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/blockchain`);
      const data = await response.json();
      
      // Update blockchain status
      blockchainHeight.textContent = data.height || 0;
      
      let totalTransactions = 0;
      if (data.chain && Array.isArray(data.chain)) {
        data.chain.forEach(block => {
          if (block.transactions && Array.isArray(block.transactions)) {
            totalTransactions += block.transactions.length;
          }
        });
      }
      
      blockchainTransactions.textContent = totalTransactions;
      blockchainValidators.textContent = data.validators ? data.validators.length : 0;
      blockchainPending.textContent = data.pendingTransactions ? data.pendingTransactions.length : 0;
      
      // Update blocks table
      blocksTable.innerHTML = '';
      
      if (data.chain && Array.isArray(data.chain)) {
        data.chain.slice().reverse().forEach(block => {
          const row = document.createElement('tr');
          
          // Handle missing properties safely
          const index = block.index !== undefined ? block.index : 'N/A';
          const hash = block.hash || 'N/A';
          const timestamp = block.timestamp ? new Date(block.timestamp).toLocaleString() : 'N/A';
          const txCount = block.transactions && Array.isArray(block.transactions) ? block.transactions.length : 0;
          const validator = block.validator || 'N/A';
          
          row.innerHTML = `
            <td>${index}</td>
            <td><span class="truncate" title="${hash}">${truncateString(hash, 15)}</span></td>
            <td>${timestamp}</td>
            <td>${txCount}</td>
            <td><span class="truncate" title="${validator}">${truncateString(validator, 15)}</span></td>
          `;
          
          blocksTable.appendChild(row);
        });
      }
      
    } catch (error) {
      console.error('Error fetching blockchain:', error);
      showToast('Error', 'Failed to fetch blockchain data', true);
    } finally {
      hideLoading();
    }
  }
  
  async function fetchWallets() {
    const wallets = await getWalletsList();
    
    // Update wallet selects
    updateWalletSelects(wallets);
    
    // Update wallets table
    walletsTable.innerHTML = '';
    
    wallets.forEach(wallet => {
      const row = document.createElement('tr');
      
      row.innerHTML = `
        <td>${wallet.name}</td>
        <td><span class="truncate" title="${wallet.publicKey}">${truncateString(wallet.publicKey, 15)}</span></td>
        <td>${wallet.balance}</td>
        <td>
          ${wallet.name !== 'admin' ? `<button class="btn danger unstake-button" data-wallet="${wallet.name}">Unstake</button>` : ''}
        </td>
      `;
      
      walletsTable.appendChild(row);
    });
    
    // Add event listeners to unstake buttons
    document.querySelectorAll('.unstake-button').forEach(button => {
      button.addEventListener('click', async () => {
        const walletName = button.getAttribute('data-wallet');
        await unstakeTokens(walletName);
      });
    });
  }
  
  async function getWalletsList() {
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/wallets`);
      const wallets = await response.json();
      return wallets;
    } catch (error) {
      console.error('Error fetching wallets:', error);
      showToast('Error', 'Failed to fetch wallets', true);
      return [];
    } finally {
      hideLoading();
    }
  }
  
  function updateWalletSelects(wallets) {
    // Clear all wallet selects
    [minerWalletSelect, stakeWalletSelect, txFromWalletSelect, txToWalletSelect, 
     contractOwnerWalletSelect, contractCallerWalletSelect].forEach(select => {
      select.innerHTML = '';
    });
    
    // Add wallet options to all selects
    wallets.forEach(wallet => {
      const option = document.createElement('option');
      option.value = wallet.name;
      option.textContent = wallet.name;
      
      const optionClone1 = option.cloneNode(true);
      const optionClone2 = option.cloneNode(true);
      const optionClone3 = option.cloneNode(true);
      const optionClone4 = option.cloneNode(true);
      const optionClone5 = option.cloneNode(true);
      
      minerWalletSelect.appendChild(option);
      stakeWalletSelect.appendChild(optionClone1);
      txFromWalletSelect.appendChild(optionClone2);
      txToWalletSelect.appendChild(optionClone3);
      contractOwnerWalletSelect.appendChild(optionClone4);
      contractCallerWalletSelect.appendChild(optionClone5);
    });
  }
  
  async function fetchTransactions() {
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/transactions`);
      const transactions = await response.json();
      
      // Update pending transactions table
      pendingTransactionsTable.innerHTML = '';
      
      transactions.forEach(tx => {
        const row = document.createElement('tr');
        
        const fromAddress = tx.fromAddress || 'System';
        const toAddress = tx.toAddress || 'N/A';
        const amount = tx.amount !== undefined ? tx.amount : 0;
        const data = tx.data || '-';
        const timestamp = tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'N/A';
        
        row.innerHTML = `
          <td><span class="truncate" title="${fromAddress}">${fromAddress === 'System' || fromAddress === 'genesis' ? fromAddress : truncateString(fromAddress, 15)}</span></td>
          <td><span class="truncate" title="${toAddress}">${truncateString(toAddress, 15)}</span></td>
          <td>${amount}</td>
          <td>${data}</td>
          <td>${timestamp}</td>
        `;
        
        pendingTransactionsTable.appendChild(row);
      });
      
    } catch (error) {
      console.error('Error fetching transactions:', error);
      showToast('Error', 'Failed to fetch transactions', true);
    } finally {
      hideLoading();
    }
  }
  
  async function fetchContracts() {
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/contracts`);
      const contracts = await response.json();
      
      // Update contracts table
      contractsTable.innerHTML = '';
      
      // Update contract select
      executeContractSelect.innerHTML = '';
      
      contracts.forEach(contract => {
        // Add to table
        const row = document.createElement('tr');
        
        row.innerHTML = `
          <td><span class="truncate" title="${contract.address}">${truncateString(contract.address, 15)}</span></td>
          <td><span class="truncate" title="${contract.owner}">${truncateString(contract.owner, 15)}</span></td>
          <td>${contract.codeSize} bytes</td>
          <td>
            <button class="btn secondary view-contract-button" data-address="${contract.address}">View</button>
          </td>
        `;
        
        contractsTable.appendChild(row);
        
        // Add to select
        const option = document.createElement('option');
        option.value = contract.address;
        option.textContent = truncateString(contract.address, 15);
        executeContractSelect.appendChild(option);
      });
      
      // Add event listeners to view contract buttons
      document.querySelectorAll('.view-contract-button').forEach(button => {
        button.addEventListener('click', async () => {
          const address = button.getAttribute('data-address');
          await viewContract(address);
        });
      });
      
    } catch (error) {
      console.error('Error fetching contracts:', error);
      showToast('Error', 'Failed to fetch contracts', true);
    } finally {
      hideLoading();
    }
  }
  
  async function viewContract(address) {
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/contracts/${address}`);
      const contract = await response.json();
      
      // Display contract details in a modal or alert for now
      alert(`Contract Address: ${contract.address}
Owner: ${contract.owner}
State: ${JSON.stringify(contract.state, null, 2)}`);
      
    } catch (error) {
      console.error('Error fetching contract:', error);
      showToast('Error', 'Failed to fetch contract details', true);
    } finally {
      hideLoading();
    }
  }
  
  // Event Handlers
  mineButton.addEventListener('click', async () => {
    const minerWallet = minerWalletSelect.value;
    
    if (!minerWallet) {
      showToast('Error', 'Please select a miner wallet', true);
      return;
    }
    
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/mine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ minerWallet })
      });
      
      const result = await response.json();
      
      if (result.error) {
        showToast('Error', result.error, true);
      } else {
        showToast('Success', `Mined ${result.blocks.length} blocks with reward ${result.reward} tokens`);
        fetchBlockchain();
      }
    } catch (error) {
      console.error('Error mining blocks:', error);
      showToast('Error', 'Failed to mine blocks', true);
    } finally {
      hideLoading();
    }
  });
  
  createWalletButton.addEventListener('click', async () => {
    const name = walletNameInput.value.trim();
    
    if (!name) {
      showToast('Error', 'Please enter a wallet name', true);
      return;
    }
    
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name })
      });
      
      const result = await response.json();
      
      if (result.error) {
        showToast('Error', result.error, true);
      } else {
        showToast('Success', `Wallet "${name}" created successfully`);
        walletNameInput.value = '';
        fetchWallets();
      }
    } catch (error) {
      console.error('Error creating wallet:', error);
      showToast('Error', 'Failed to create wallet', true);
    } finally {
      hideLoading();
    }
  });
  
  stakeButton.addEventListener('click', async () => {
    const walletName = stakeWalletSelect.value;
    const amount = stakeAmountInput.value;
    
    if (!walletName || !amount) {
      showToast('Error', 'Please select a wallet and enter an amount', true);
      return;
    }
    
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/validators/stake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ walletName, amount })
      });
      
      const result = await response.json();
      
      if (result.error) {
        showToast('Error', result.error, true);
      } else {
        showToast('Success', `Staked ${amount} tokens from wallet "${walletName}"`);
        stakeAmountInput.value = '';
        fetchWallets();
        fetchBlockchain();
      }
    } catch (error) {
      console.error('Error staking tokens:', error);
      showToast('Error', 'Failed to stake tokens', true);
    } finally {
      hideLoading();
    }
  });
  
  async function unstakeTokens(walletName) {
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/validators/unstake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ walletName })
      });
      
      const result = await response.json();
      
      if (result.error) {
        showToast('Error', result.error, true);
      } else {
        showToast('Success', `Unstaked ${result.unstaked} tokens to wallet "${walletName}"`);
        fetchWallets();
        fetchBlockchain();
      }
    } catch (error) {
      console.error('Error unstaking tokens:', error);
      showToast('Error', 'Failed to unstake tokens', true);
    } finally {
      hideLoading();
    }
  }
  
  createTxButton.addEventListener('click', async () => {
    const fromWallet = txFromWalletSelect.value;
    const toAddress = txToWalletSelect.options[txToWalletSelect.selectedIndex].text;
    const amount = txAmountInput.value;
    const data = txDataInput.value;
    
    if (!fromWallet || !toAddress || !amount) {
      showToast('Error', 'Please fill in all required fields', true);
      return;
    }
    
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fromWallet, toAddress, amount, data })
      });
      
      const result = await response.json();
      
      if (result.error) {
        showToast('Error', result.error, true);
      } else {
        showToast('Success', `Transaction created successfully`);
        txAmountInput.value = '';
        txDataInput.value = '';
        fetchTransactions();
        fetchWallets();
      }
    } catch (error) {
      console.error('Error creating transaction:', error);
      showToast('Error', 'Failed to create transaction', true);
    } finally {
      hideLoading();
    }
  });
  
  deployContractButton.addEventListener('click', async () => {
    const walletName = contractOwnerWalletSelect.value;
    const code = contractCodeTextarea.value.trim();
    
    if (!walletName || !code) {
      showToast('Error', 'Please select a wallet and enter contract code', true);
      return;
    }
    
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/contracts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ walletName, code })
      });
      
      const result = await response.json();
      
      if (result.error) {
        showToast('Error', result.error, true);
      } else {
        showToast('Success', `Contract deployed successfully at ${result.contractAddress}`);
        contractCodeTextarea.value = '';
        fetchContracts();
      }
    } catch (error) {
      console.error('Error deploying contract:', error);
      showToast('Error', 'Failed to deploy contract', true);
    } finally {
      hideLoading();
    }
  });
  
  executeContractButton.addEventListener('click', async () => {
    const contractAddress = executeContractSelect.value;
    const walletName = contractCallerWalletSelect.value;
    const method = contractMethodInput.value.trim();
    let params = {};
    
    try {
      params = contractParamsTextarea.value.trim() ? JSON.parse(contractParamsTextarea.value) : {};
    } catch (error) {
      showToast('Error', 'Invalid JSON parameters', true);
      return;
    }
    
    if (!contractAddress || !walletName || !method) {
      showToast('Error', 'Please fill in all required fields', true);
      return;
    }
    
    showLoading();
    try {
      const response = await fetch(`${API_URL}/api/contracts/${contractAddress}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ walletName, method, params })
      });
      
      const result = await response.json();
      
      if (result.error) {
        showToast('Error', result.error, true);
      } else {
        showToast('Success', `Contract executed successfully`);
        contractMethodInput.value = '';
        contractParamsTextarea.value = '';
        fetchContracts();
      }
    } catch (error) {
      console.error('Error executing contract:', error);
      showToast('Error', 'Failed to execute contract', true);
    } finally {
      hideLoading();
    }
  });
  
  // Initial load
  fetchBlockchain();
  
  // Add sample token contract code
  contractCodeTextarea.value = `
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
}
  `.trim();
});