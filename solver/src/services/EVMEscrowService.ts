import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import { 
  ChainId, 
  NetworkConfig, 
  EscrowImmutables, 
  TokenBalance,
  SolverError,
  SolverErrorCode
} from '../types';


// Contract ABIs
const ESCROW_FACTORY_ABI = [
  {
    "inputs": [
      {
        "internalType": "contract IERC20",
        "name": "accessToken",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "uint32",
        "name": "rescueDelaySrc",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "rescueDelayDst",
        "type": "uint32"
      },
      {
        "internalType": "uint256",
        "name": "_creationFee",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "_treasury",
        "type": "address"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "minConfirmations",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "dustThreshold",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "maxAmount",
            "type": "uint256"
          }
        ],
        "internalType": "struct BTCEscrowFactory.BitcoinConfig",
        "name": "_bitcoinConfig",
        "type": "tuple"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "Create2EmptyBytecode",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "FailedDeployment",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "FeeTransferFailed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "balance",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "needed",
        "type": "uint256"
      }
    ],
    "name": "InsufficientBalance",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientEscrowBalance",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidBitcoinAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidBitcoinAmount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidFeeAmount",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "SafeERC20FailedOperation",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "minConfirmations",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "dustThreshold",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "maxAmount",
            "type": "uint256"
          }
        ],
        "indexed": false,
        "internalType": "struct BTCEscrowFactory.BitcoinConfig",
        "name": "config",
        "type": "tuple"
      }
    ],
    "name": "BitcoinConfigUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oldFee",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newFee",
        "type": "uint256"
      }
    ],
    "name": "CreationFeeUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "escrow",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "hashlock",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "Address",
        "name": "taker",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      }
    ],
    "name": "DstEscrowCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "escrow",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "hashlock",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "Address",
        "name": "maker",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      }
    ],
    "name": "SrcEscrowCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "oldTreasury",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "newTreasury",
        "type": "address"
      }
    ],
    "name": "TreasuryUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "ACCESS_TOKEN",
    "outputs": [
      {
        "internalType": "contract IERC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "BTC_ESCROW_DST_IMPLEMENTATION",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "BTC_ESCROW_SRC_IMPLEMENTATION",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "orderHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "hashlock",
            "type": "bytes32"
          },
          {
            "internalType": "Address",
            "name": "maker",
            "type": "uint256"
          },
          {
            "internalType": "Address",
            "name": "taker",
            "type": "uint256"
          },
          {
            "internalType": "Address",
            "name": "token",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "safetyDeposit",
            "type": "uint256"
          },
          {
            "internalType": "Timelocks",
            "name": "timelocks",
            "type": "uint256"
          }
        ],
        "internalType": "struct IBaseEscrow.Immutables",
        "name": "immutables",
        "type": "tuple"
      }
    ],
    "name": "addressOfEscrowDst",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "orderHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "hashlock",
            "type": "bytes32"
          },
          {
            "internalType": "Address",
            "name": "maker",
            "type": "uint256"
          },
          {
            "internalType": "Address",
            "name": "taker",
            "type": "uint256"
          },
          {
            "internalType": "Address",
            "name": "token",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "safetyDeposit",
            "type": "uint256"
          },
          {
            "internalType": "Timelocks",
            "name": "timelocks",
            "type": "uint256"
          }
        ],
        "internalType": "struct IBaseEscrow.Immutables",
        "name": "immutables",
        "type": "tuple"
      }
    ],
    "name": "addressOfEscrowSrc",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "bitcoinConfig",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "minConfirmations",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "dustThreshold",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "maxAmount",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "orderHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "hashlock",
            "type": "bytes32"
          },
          {
            "internalType": "Address",
            "name": "maker",
            "type": "uint256"
          },
          {
            "internalType": "Address",
            "name": "taker",
            "type": "uint256"
          },
          {
            "internalType": "Address",
            "name": "token",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "safetyDeposit",
            "type": "uint256"
          },
          {
            "internalType": "Timelocks",
            "name": "timelocks",
            "type": "uint256"
          }
        ],
        "internalType": "struct IBaseEscrow.Immutables",
        "name": "immutables",
        "type": "tuple"
      }
    ],
    "name": "createDstEscrow",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "orderHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "hashlock",
            "type": "bytes32"
          },
          {
            "internalType": "Address",
            "name": "maker",
            "type": "uint256"
          },
          {
            "internalType": "Address",
            "name": "taker",
            "type": "uint256"
          },
          {
            "internalType": "Address",
            "name": "token",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "safetyDeposit",
            "type": "uint256"
          },
          {
            "internalType": "Timelocks",
            "name": "timelocks",
            "type": "uint256"
          }
        ],
        "internalType": "struct IBaseEscrow.Immutables",
        "name": "immutables",
        "type": "tuple"
      }
    ],
    "name": "createSrcEscrow",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "creationFee",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "minConfirmations",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "dustThreshold",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "maxAmount",
            "type": "uint256"
          }
        ],
        "internalType": "struct BTCEscrowFactory.BitcoinConfig",
        "name": "newConfig",
        "type": "tuple"
      }
    ],
    "name": "setBitcoinConfig",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "newFee",
        "type": "uint256"
      }
    ],
    "name": "setCreationFee",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newTreasury",
        "type": "address"
      }
    ],
    "name": "setTreasury",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "treasury",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]
const ESCROW_ABI = [
  // Escrow interface
  'function withdraw(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external',
  'function cancel(tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external',
  'function rescueFunds(address token, uint256 amount, tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external',
  'function RESCUE_DELAY() external view returns (uint256)',
  'function FACTORY() external view returns (address)',
  'event EscrowWithdrawal(bytes32 secret)',
  'event EscrowCancelled()',
  'event FundsRescued(address token, uint256 amount)'
];

/**
 * EVM Escrow Service
 * 
 * Handles interactions with EVM-based escrow contracts on
 * Base Sepolia testnet for cross-chain atomic swaps.
 */
export class EVMEscrowService extends EventEmitter {
  private providers: Map<ChainId, ethers.JsonRpcProvider> = new Map();
  private wallets: Map<ChainId, ethers.Wallet> = new Map();
  private factoryContracts: Map<ChainId, ethers.Contract> = new Map();
  private escrowContracts: Map<string, ethers.Contract> = new Map();
  
  constructor(
    private networks: Record<ChainId, NetworkConfig>,
    private privateKey: string
  ) {
    super();
  }

  /**
   * Initialize EVM escrow service
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing EVMEscrowService...');
      
      // Initialize Base Sepolia chain
      for (const [chainId, config] of Object.entries(this.networks)) {
        if (chainId !== 'near') {
          await this.initializeChain(chainId as ChainId, config);
        }
      }
      
      console.log('EVMEscrowService initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize EVMEscrowService:', error);
      throw error;
    }
  }

  /**
   * Create destination escrow for NEAR→EVM swaps
   */
  async createDstEscrow(chainId: ChainId, immutables: EscrowImmutables, swapId: string): Promise<string> {
    try {
      console.log(`Creating EVM destination escrow on chain: ${chainId}`);

      const factory = this.factoryContracts.get(chainId);

      if (!factory) {
        throw new SolverError(`No factory contract for chain ${chainId}`, SolverErrorCode.CONTRACT_ERROR, chainId);
      }

      // Format immutables for contract call
      const contractImmutables = this.formatImmutablesForContract(immutables,chainId, swapId);
      
      // Calculate required safety deposit (typically for gas costs)
      const safetyDeposit = this.calculateSafetyDeposit(immutables);
      
      // Add safety deposit to immutables
      contractImmutables.safetyDeposit = safetyDeposit;

      // Get creation fee from contract
      const creationFee = await factory.creationFee();
      
     
      
      const valueToSend = creationFee + safetyDeposit + contractImmutables.amount;
      
      // Create destination escrow
      const tx = await factory.createDstEscrow(
        contractImmutables,
        { value: valueToSend }
      );

      console.log('tx', tx);
      
      const receipt = await tx.wait();
      const escrowAddress = this.parseEscrowCreatedEvent(receipt, 'destination');
      
      // Initialize escrow contract instance
      await this.initializeEscrowContract(escrowAddress);
      
      console.log(`EVM destination escrow created on ${chainId}: ${escrowAddress}`);
      this.emit('escrowCreated', { chainId, address: escrowAddress, type: 'destination' });
      
      return escrowAddress;
      
    } catch (error) {
      console.error(`Failed to create EVM destination escrow on ${chainId}:`, error);
      throw new SolverError('Failed to create destination escrow', SolverErrorCode.ESCROW_CREATION_FAILED, chainId);
    }
  }

  /**
   * Create source escrow for EVM→NEAR swaps
   */
  async createSrcEscrow(chainId: ChainId, immutables: EscrowImmutables, swapId: string): Promise<string> {
    try {
      const factory = this.factoryContracts.get(chainId);


      if (!factory) {
        throw new SolverError(`No factory contract for chain ${chainId}`, SolverErrorCode.CONTRACT_ERROR, chainId);
      }

      const contractImmutables = this.formatImmutablesForContract(immutables, chainId, swapId);

      // Calculate required safety deposit
      const safetyDeposit = this.calculateSafetyDeposit(immutables);
      
      // Add safety deposit to immutables
      contractImmutables.safetyDeposit = safetyDeposit;
      
      const creationFee = await factory.creationFee();
      
      const valueToSend = creationFee + safetyDeposit + contractImmutables.amount;

      const feeData = await this.providers.get(chainId)?.getFeeData();
      const baseGasPrice = feeData?.gasPrice || ethers.parseUnits("2", "gwei");
      const highGasPrice = baseGasPrice * 10n; 

      // Create source escrow
      const tx = await factory.createSrcEscrow(
        contractImmutables,
        { value: valueToSend , gasPrice: highGasPrice }
      );

      
      
      const receipt = await tx.wait();
      const escrowAddress = this.parseEscrowCreatedEvent(receipt, 'source');
      
      // Initialize escrow contract instance
      await this.initializeEscrowContract(escrowAddress);
      
      console.log(`EVM source escrow created on ${chainId}: ${escrowAddress}`);
      this.emit('escrowCreated', { chainId, address: escrowAddress, type: 'source' });
      
      return escrowAddress;
      
    } catch (error) {
      console.error(`Failed to create EVM source escrow on ${chainId}:`, error);
      throw new SolverError('Failed to create source escrow', SolverErrorCode.ESCROW_CREATION_FAILED, chainId);
    }
  }


  /**
   * Withdraw funds from escrow using secret
   */
  async withdrawFunds(chainId: ChainId, escrowAddress: string, secret: string, immutables: EscrowImmutables, swapId: string): Promise<string> {
    try {
      console.log(`Withdrawing funds from EVM escrow on ${chainId}: ${escrowAddress}`);

      let escrow = this.escrowContracts.get(escrowAddress);
      if (!escrow) {
        // Try to initialize escrow contract if not found
        await this.initializeEscrowContract(escrowAddress);
        escrow = this.escrowContracts.get(escrowAddress);
        if (!escrow) {
          throw new SolverError(`No escrow contract found at ${escrowAddress}`, SolverErrorCode.CONTRACT_ERROR, chainId);
        }
      }

      // Format immutables for contract call
      const contractImmutables = this.formatImmutablesForContract(immutables, chainId, swapId);
      
      // Convert secret to bytes32
      const secretBytes32 = ethers.keccak256(ethers.toUtf8Bytes(secret));
      
      // Withdraw funds
      const tx = await escrow.withdraw(secretBytes32, contractImmutables);
      const receipt = await tx.wait();
      
      console.log(`Funds withdrawn from EVM escrow on ${chainId} at ${escrowAddress}: ${receipt.hash}`);
      
      this.emit('fundsWithdrawn', { 
        chainId, 
        address: escrowAddress, 
        transactionHash: receipt.hash,
        secret 
      });
      
      return receipt.hash;
      
    } catch (error) {
      console.error(`Failed to withdraw funds from EVM escrow on ${chainId} at ${escrowAddress}:`, error);
      throw new SolverError('Failed to withdraw funds', SolverErrorCode.WITHDRAWAL_ERROR, chainId);
    }
  }

  /**
   * Cancel escrow and refund
   */
  async cancelEscrow(chainId: ChainId, escrowAddress: string, immutables: EscrowImmutables, swapId: string  ): Promise<string> {
    try {
      console.log(`Cancelling EVM escrow on ${chainId}: ${escrowAddress}`);

      let escrow = this.escrowContracts.get(escrowAddress);
      if (!escrow) {
        await this.initializeEscrowContract(escrowAddress);
        escrow = this.escrowContracts.get(escrowAddress);
        if (!escrow) {
          throw new SolverError(`No escrow contract found at ${escrowAddress}`, SolverErrorCode.CONTRACT_ERROR, chainId);
        }
      }

      // Format immutables for contract call
      const contractImmutables = this.formatImmutablesForContract(immutables,chainId, swapId);
      // Cancel escrow
      const tx = await escrow.cancel(contractImmutables);
      const receipt = await tx.wait();
      
      console.log(`EVM escrow cancelled on ${chainId} at ${escrowAddress}: ${receipt.hash}`);
      
      this.emit('escrowCancelled', { 
        chainId, 
        address: escrowAddress, 
        transactionHash: receipt.hash 
      });
      
      return receipt.hash;
      
    } catch (error) {
      console.error(`Failed to cancel EVM escrow on ${chainId} at ${escrowAddress}:`, error);
      throw new SolverError('Failed to cancel escrow', SolverErrorCode.CANCELLATION_ERROR, chainId);
    }
  }

  /**
   * Get the deterministic address of an escrow before deployment
   */
  async getEscrowAddress(chainId: ChainId, immutables: EscrowImmutables, swapId: string, type: 'source' | 'destination' = 'destination'): Promise<string> {
    try {
      const factory = this.factoryContracts.get(chainId);
      if (!factory) {
        throw new SolverError(`No factory contract for chain ${chainId}`, SolverErrorCode.CONTRACT_ERROR, chainId);
      }

      const contractImmutables = this.formatImmutablesForContract(immutables, chainId, swapId);
      contractImmutables.safetyDeposit = this.calculateSafetyDeposit(immutables);
      
      const address = type === 'source' 
        ? await factory.addressOfEscrowSrc(contractImmutables)
        : await factory.addressOfEscrowDst(contractImmutables);
      
      return address;
      
    } catch (error) {
      console.error(`Failed to get ${type} escrow address on ${chainId}:`, error);
      throw new SolverError(`Failed to get ${type} escrow address`, SolverErrorCode.CONTRACT_ERROR, chainId);
    }
  }

  /**
   * Get token balances for a chain
   */
  async getBalances(chainId: ChainId): Promise<TokenBalance[]> {
    try {
      const balances: TokenBalance[] = [];
      const wallet = this.wallets.get(chainId);
      const networkConfig = this.networks[chainId];
      
      if (!wallet || !networkConfig) {
        return balances;
      }

      // Get native token balance
      const nativeBalance = await wallet.provider!.getBalance(wallet.address);
      
      balances.push({
        chain: chainId,
        token: ethers.ZeroAddress,
        symbol: networkConfig.nativeCurrency.symbol,
        balance: ethers.formatEther(nativeBalance),
        valueUSD: '0' // Would need price feed integration
      });

      // TODO: Add ERC20 token balance checking
      
      return balances;
      
    } catch (error) {
      console.error(`Failed to get balances on ${chainId}:`, error);
      return [];
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check if all providers are connected
      for (const [chainId, provider] of this.providers.entries()) {
        await provider.getBlockNumber();
      }
      return true;
    } catch (error) {
      console.error('EVM health check failed:', error);
      return false;
    }
  }

  /**
   * Initialize a specific chain
   */
  private async initializeChain(chainId: ChainId, config: NetworkConfig): Promise<void> {
    try {
      console.log(`Initializing EVM chain: ${chainId}`);

      // Create provider
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      this.providers.set(chainId, provider);

      // Create wallet
      const wallet = new ethers.Wallet(this.privateKey, provider);
      this.wallets.set(chainId, wallet);

      // Initialize factory contract if address is provided
      if (config.escrowFactoryAddress) {
        const factoryContract = new ethers.Contract(
          config.escrowFactoryAddress,
          ESCROW_FACTORY_ABI,
          wallet
        );
        this.factoryContracts.set(chainId, factoryContract);
      }

      console.log(`EVM chain initialized: ${chainId}`);
      
    } catch (error) {
      console.error(`Failed to initialize EVM chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Initialize escrow contract instance
   */
  private async initializeEscrowContract(escrowAddress: string): Promise<void> {
    try {
      // Get the first available wallet for contract interaction
      const wallet = Array.from(this.wallets.values())[0];
      if (!wallet) {
        throw new Error('No wallet available for escrow contract initialization');
      }

      const escrowContract = new ethers.Contract(
        escrowAddress,
        ESCROW_ABI,
        wallet
      );
      
      this.escrowContracts.set(escrowAddress, escrowContract);
      console.log(`Escrow contract initialized: ${escrowAddress}`);
      
    } catch (error) {
      console.error(`Failed to initialize escrow contract ${escrowAddress}:`, error);
      throw error;
    }
  }

  /**
   * Format immutables for contract calls
   */
  private formatImmutablesForContract(immutables: EscrowImmutables, chainId: ChainId, orderId: string): any {
    const wallet = this.wallets.get(chainId);
    // Validate and normalize addresses to prevent ENS resolution attempts
    const takerAddress = this.validateAndNormalizeAddress(immutables.srcAddr);
    const makerAddress = this.validateAndNormalizeAddress(wallet?.address || "");
    const tokenAddress = this.validateAndNormalizeAddress(immutables.srcToken);

    // Pack timelocks according to TimelocksLib format
    // TimelocksLib expects relative durations (seconds from deployment), not absolute timestamps
    // Bits 224-255: deployment timestamp (will be set by contract during deployment)
    // Bits 64-95: cancellation period (relative duration)
    // Bits 32-63: public withdrawal period (relative duration) 
    // Bits 0-31: withdrawal period (relative duration)
    const now = Math.floor(Date.now() / 1000);
    
    // Create escrow immutables
    const dstWithdrawal = immutables.timelocks.withdrawalPeriod;
    const dstPublicWithdrawal = immutables.timelocks.withdrawalPeriod * 2;
    const dstCancellation = immutables.timelocks.cancellationPeriod;

    // Pack timelocks
    const timelocks = (BigInt(now) << 224n) |
                    (BigInt(dstCancellation) << 64n) |
                    (BigInt(dstPublicWithdrawal) << 32n) |
                    BigInt(dstWithdrawal);

    return {
      orderHash: ethers.keccak256(ethers.toUtf8Bytes(orderId)), // Using hashlock as orderHash for simplicity
      hashlock: immutables.hashlock,
      maker: BigInt(makerAddress),
      taker: BigInt(takerAddress),
      token: BigInt(tokenAddress),
      amount: ethers.parseEther(immutables.amount.toString()),
      safetyDeposit: BigInt(0), // Will be set separately
      timelocks: timelocks
    };
  }

  /**
   * Validate and normalize an Ethereum address to prevent ENS resolution
   */
  private validateAndNormalizeAddress(address: string): string {
    // Check if it's a valid Ethereum address
    if (!ethers.isAddress(address)) {
      throw new Error(`Invalid Ethereum address: ${address}`);
    }
    
    // Return the checksummed address (this normalizes it without ENS resolution)
    return ethers.getAddress(address);
  }

  /**
   * Calculate required safety deposit for escrow creation
   */
  private calculateSafetyDeposit(immutables: EscrowImmutables): bigint {
    // Calculate safety deposit based on gas costs and security requirements
    // For testnet, use a minimal amount
    return ethers.parseEther('0.001'); // 0.001 ETH safety deposit
  }

  /**
   * Parse escrow created event from transaction receipt
   */
  private parseEscrowCreatedEvent(receipt: ethers.TransactionReceipt, type: 'source' | 'destination'): string {
    try {
      const factory = Array.from(this.factoryContracts.values())[0];
      if (!factory) {
        throw new Error('No factory contract available for event parsing');
      }

      // Parse logs to find the appropriate escrow created event
      const logs = receipt.logs.filter(log => log.address === factory.target);
      const expectedEventName = type === 'source' ? 'SrcEscrowCreated' : 'DstEscrowCreated';
      
      for (const log of logs) {
        try {
          const parsedLog = factory.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          
          if (parsedLog && parsedLog.name === expectedEventName) {
            return parsedLog.args.escrow;
          }
        } catch (parseError) {
          // Continue to next log if parsing fails
          continue;
        }
      }
      
      throw new Error(`${expectedEventName} event not found in receipt`);
      
    } catch (error) {
      console.error(`Failed to parse ${type} escrow created event:`, error);
      throw new Error(`Failed to parse ${type} escrow address from transaction receipt`);
    }
  }
}