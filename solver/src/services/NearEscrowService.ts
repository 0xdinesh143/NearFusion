import { EventEmitter } from 'events';
import { Near, Account, Contract, keyStores, KeyPair, providers, InMemorySigner } from 'near-api-js';
import { 
  NearEscrowImmutables, 
  TokenBalance,
  SolverError,
  SolverErrorCode,
  ChainId
} from '../types';


// NEAR contract method signatures
const FACTORY_VIEW_METHODS = [
  'get_escrow_info',
  'compute_escrow_id',
  'get_escrow_wasm_hash',
  'get_owner',
  'get_creation_fee',
  'get_treasury'
];

const FACTORY_CHANGE_METHODS = [
  'create_escrow'
];

const ESCROW_VIEW_METHODS = [
  'get_escrow_info',
  'get_immutables',
  'get_status',
  'can_withdraw',
  'can_cancel',
  'get_balance'
];

const ESCROW_CHANGE_METHODS = [
  'withdraw',
  'cancel',
  'rescue_funds'
];

/**
 * NEAR Escrow Service
 * 
 * Handles interactions with NEAR-based escrow contracts for cross-chain atomic swaps.
 * Integrates with NEAR Protocol's JSON-RPC API and contract layer on testnet.
 */
export class NearEscrowService extends EventEmitter {
  private near?: Near;
  private account?: Account;
  private factoryContract?: Contract & any;
  private escrowContracts: Map<string, Contract & any> = new Map();
  
  constructor(
    private networkId: string,
    private accountId: string,
    private privateKey: string,
    private rpcUrl: string,
    private factoryContractId: string
  ) {
    super();
  }

  /**
   * Initialize NEAR escrow service
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing NearEscrowService for testnet...');
      
      // Connect to NEAR
      await this.connectToNear();
      
      // Initialize account
      await this.initializeAccount();
      
      // Initialize factory contract
      await this.initializeFactoryContract();
      
      console.log('NearEscrowService initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize NearEscrowService:', error);
      throw error;
    }
  }

  /**
   * Create source escrow for NEAR→EVM swaps
   */
  async createSrcEscrow(immutables: NearEscrowImmutables, escrowType: 'Source' | 'Destination' = 'Source'): Promise<string> {
    try {
      console.log(`Creating NEAR source escrow: ${escrowType}`);

      if (!this.factoryContract) {
        throw new SolverError('Factory contract not initialized', SolverErrorCode.CONTRACT_ERROR);
      }

      // Calculate storage deposit
      const storageDeposit = await this.calculateStorageDeposit();
      
      // Create escrow using factory
      const result = await this.factoryContract.create_escrow({
        immutables: {
          hashlock: immutables.hashlock,
          timelocks: {
            src_lock_time: immutables.timelocks.src_lock_time,
            dst_lock_time: immutables.timelocks.dst_lock_time,
            src_unlock_time: immutables.timelocks.src_unlock_time,
            dst_unlock_time: immutables.timelocks.dst_unlock_time
          },
          src_token: immutables.src_token,
          dst_token: immutables.dst_token,
          src_addr: immutables.src_addr,
          dst_addr: immutables.dst_addr,
          amount: immutables.amount,
          dst_amount: immutables.dst_amount
        },
        escrow_type: escrowType
      }, {
        gas: '300000000000000', // 300 TGas
        attachedDeposit: storageDeposit
      });

      const escrowAccountId = this.parseEscrowId(result);
      
      // Initialize escrow contract instance
      await this.initializeEscrowContract(escrowAccountId);
      
      console.log(`NEAR source escrow created (${escrowType}): ${escrowAccountId}`);
      this.emit('escrowCreated', { 
        chain: 'near',
        address: escrowAccountId, 
        type: escrowType.toLowerCase() 
      });
      
      return escrowAccountId;
      
    } catch (error) {
      console.error('Failed to create NEAR source escrow:', error);
      throw new SolverError('Failed to create NEAR source escrow', SolverErrorCode.ESCROW_CREATION_FAILED);
    }
  }

  /**
   * Create destination escrow for EVM→NEAR swaps
   */
  async createDstEscrow(immutables: NearEscrowImmutables): Promise<string> {
    return this.createSrcEscrow(immutables, 'Destination');
  }

  /**
   * Generic escrow creation method
   */
  async createEscrow(immutables: NearEscrowImmutables, escrowType: 'Source' | 'Destination' = 'Source'): Promise<string> {
    return this.createSrcEscrow(immutables, escrowType);
  }

  /**
   * Withdraw funds from escrow using secret
   */
  async withdrawFunds(escrowAccountId: string, secret: string, immutables?: NearEscrowImmutables): Promise<string> {
    try {
      console.log(`Withdrawing funds from NEAR escrow: ${escrowAccountId}`);

      let escrow = this.escrowContracts.get(escrowAccountId);
      if (!escrow) {
        await this.initializeEscrowContract(escrowAccountId);
        escrow = this.escrowContracts.get(escrowAccountId);
        if (!escrow) {
          throw new SolverError(`No escrow contract found: ${escrowAccountId}`, SolverErrorCode.CONTRACT_ERROR);
        }
      }

      // Prepare withdrawal arguments
      const withdrawArgs: any = { secret };
      if (immutables) {
        withdrawArgs.immutables = immutables;
      }

      // Withdraw funds
      const result = await escrow.withdraw(withdrawArgs, {
        gas: '100000000000000' // 100 TGas
      });

      console.log(`Funds withdrawn from NEAR escrow: ${escrowAccountId}`);
      
      this.emit('fundsWithdrawn', { 
        chain: 'near',
        address: escrowAccountId, 
        secret,
        result 
      });
      
      return JSON.stringify(result);
      
    } catch (error) {
      console.error(`Failed to withdraw funds from NEAR escrow ${escrowAccountId}:`, error);
      throw new SolverError('Failed to withdraw funds from NEAR escrow', SolverErrorCode.WITHDRAWAL_ERROR);
    }
  }

  /**
   * Cancel escrow and refund
   */
  async cancelEscrow(escrowAccountId: string): Promise<string> {
    try {
      console.log(`Cancelling NEAR escrow: ${escrowAccountId}`);

      let escrow = this.escrowContracts.get(escrowAccountId);
      if (!escrow) {
        await this.initializeEscrowContract(escrowAccountId);
        escrow = this.escrowContracts.get(escrowAccountId);
        if (!escrow) {
          throw new SolverError(`No escrow contract found: ${escrowAccountId}`, SolverErrorCode.CONTRACT_ERROR);
        }
      }

      // Cancel escrow
      const result = await escrow.cancel({}, {
        gas: '50000000000000' // 50 TGas
      });

      console.log(`NEAR escrow cancelled: ${escrowAccountId}`);
      this.emit('escrowCancelled', { 
        chain: 'near',
        address: escrowAccountId, 
        result 
      });
      
      return JSON.stringify(result);
      
    } catch (error) {
      console.error(`Failed to cancel NEAR escrow ${escrowAccountId}:`, error);
      throw new SolverError('Failed to cancel NEAR escrow', SolverErrorCode.CANCELLATION_ERROR);
    }
  }

  /**
   * Get escrow information
   */
  async getEscrowInfo(escrowAccountId: string): Promise<any> {
    try {
      console.log(`Getting NEAR escrow info: ${escrowAccountId}`);

      let escrow = this.escrowContracts.get(escrowAccountId);
      if (!escrow) {
        await this.initializeEscrowContract(escrowAccountId);
        escrow = this.escrowContracts.get(escrowAccountId);
        if (!escrow) {
          throw new SolverError(`No escrow contract found: ${escrowAccountId}`, SolverErrorCode.CONTRACT_ERROR);
        }
      }

      // Get escrow state
      const info = await escrow.get_escrow_info();
      
      console.log(`Retrieved NEAR escrow info: ${escrowAccountId}`);
      return info;
      
    } catch (error) {
      console.error(`Failed to get NEAR escrow info ${escrowAccountId}:`, error);
      throw new SolverError('Failed to get escrow info', SolverErrorCode.CONTRACT_ERROR);
    }
  }

  /**
   * Check if withdrawal is possible
   */
  async canWithdraw(escrowAccountId: string): Promise<boolean> {
    try {
      let escrow = this.escrowContracts.get(escrowAccountId);
      if (!escrow) {
        await this.initializeEscrowContract(escrowAccountId);
        escrow = this.escrowContracts.get(escrowAccountId);
        if (!escrow) {
          return false;
        }
      }

      const canWithdraw = await escrow.can_withdraw();
      return canWithdraw;
    } catch (error) {
      console.log(`Failed to check withdraw status for ${escrowAccountId}:`, error);
      return false;
    }
  }

  /**
   * Check if cancellation is possible
   */
  async canCancel(escrowAccountId: string): Promise<boolean> {
    try {
      let escrow = this.escrowContracts.get(escrowAccountId);
      if (!escrow) {
        await this.initializeEscrowContract(escrowAccountId);
        escrow = this.escrowContracts.get(escrowAccountId);
        if (!escrow) {
          return false;
        }
      }

      const canCancel = await escrow.can_cancel();
      return canCancel;
    } catch (error) {
      console.log(`Failed to check cancel status for ${escrowAccountId}:`, error);
      return false;
    }
  }

  /**
   * Get NEAR token balances
   */
  async getBalances(): Promise<TokenBalance[]> {
    try {
      if (!this.account) {
        return [];
      }

      const balances: TokenBalance[] = [];
      
      // Get NEAR balance
      const accountState = await this.account.state();
      const nearBalance = accountState.amount;
      
      balances.push({
        chain: 'near',
        token: 'wrap.near',
        symbol: 'NEAR',
        balance: (BigInt(nearBalance) / BigInt(10 ** 24)).toString(), // Convert from yoctoNEAR
        valueUSD: '0' // Would need price feed integration
      });

      // TODO: Add NEP-141 token balances
      
      return balances;
      
    } catch (error) {
      console.error('Failed to get NEAR balances:', error);
      return [];
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.near || !this.account || !this.factoryContract) {
        return false;
      }
      
      // Test connection by getting account state
      await this.account.state();
      
      // Test factory contract
      await this.factoryContract.get_owner();
      
      return true;
      
    } catch (error) {
      console.error('NEAR health check failed:', error);
      return false;
    }
  }

  /**
   * Connect to NEAR network
   */
  private async connectToNear(): Promise<void> {
    try {
      console.log(`Connecting to NEAR network: ${this.networkId}`);

      const keyPair = this.parsePrivateKey(this.privateKey);
      const keyStore = new keyStores.InMemoryKeyStore();
      await keyStore.setKey(this.networkId, this.accountId, keyPair);

      const config = {
        networkId: this.networkId,
        keyStore,
        nodeUrl: this.rpcUrl,
        walletUrl: `https://wallet.${this.networkId}.near.org`,
        helperUrl: `https://helper.${this.networkId}.near.org`,
      };

      // Create Near instance directly without using deprecated connect function
      this.near = new Near({
        ...config,
        provider: new providers.JsonRpcProvider({ url: this.rpcUrl }),
        signer: new InMemorySigner(keyStore)
      });
      
      console.log('Connected to NEAR network');
      
    } catch (error) {
      console.error('Failed to connect to NEAR:', error);
      throw error;
    }
  }

  /**
   * Initialize NEAR account
   */
  private async initializeAccount(): Promise<void> {
    try {
      if (!this.near) {
        throw new Error('NEAR connection not established');
      }

      console.log(`Initializing NEAR account: ${this.accountId}`);
      
      this.account = await this.near.account(this.accountId);
      
      // Verify account exists
      await this.account.state();
      
      console.log('NEAR account initialized');
      
    } catch (error) {
      console.error('Failed to initialize NEAR account:', error);
      throw error;
    }
  }

  /**
   * Initialize factory contract
   */
  private async initializeFactoryContract(): Promise<void> {
    try {
      if (!this.account) {
        throw new Error('NEAR account not initialized');
      }

      console.log(`Initializing factory contract: ${this.factoryContractId}`);
      
      this.factoryContract = new Contract(
        this.account,
        this.factoryContractId,
        {
          viewMethods: FACTORY_VIEW_METHODS,
          changeMethods: FACTORY_CHANGE_METHODS,
          useLocalViewExecution: false
        }
      ) as Contract & any;
      
      console.log('Factory contract initialized');
      
    } catch (error) {
      console.error('Failed to initialize factory contract:', error);
      throw error;
    }
  }

  /**
   * Initialize escrow contract instance
   */
  private async initializeEscrowContract(escrowAccountId: string): Promise<void> {
    try {
      if (!this.account) {
        throw new Error('NEAR account not initialized');
      }

      console.log(`Initializing escrow contract: ${escrowAccountId}`);
      
      const escrowContract = new Contract(
        this.account,
        escrowAccountId,
        {
          viewMethods: ESCROW_VIEW_METHODS,
          changeMethods: ESCROW_CHANGE_METHODS,
          useLocalViewExecution: false
        }
      ) as Contract & any;
      
      this.escrowContracts.set(escrowAccountId, escrowContract);
      console.log(`Escrow contract initialized: ${escrowAccountId}`);
      
    } catch (error) {
      console.error(`Failed to initialize escrow contract ${escrowAccountId}:`, error);
      throw error;
    }
  }

  /**
   * Parse private key from string
   */
  private parsePrivateKey(privateKey: string): KeyPair {
    try {
      // Handle different private key formats
      if (privateKey.includes(':')) {
        return KeyPair.fromString(privateKey as any);
      } else {
        return KeyPair.fromString(`ed25519:${privateKey}` as any);
      }
    } catch (error) {
      console.error('Failed to parse private key:', error);
      throw new Error('Invalid NEAR private key format');
    }
  }

  /**
   * Calculate storage deposit for escrow creation
   */
  private async calculateStorageDeposit(): Promise<string> {
    try {
      if (this.factoryContract) {
        // Try to get creation fee from factory
        const creationFee = await this.factoryContract.get_creation_fee();
        return creationFee;
      }
    } catch (error) {
      console.log('Could not get creation fee from factory, using default');
    }
    
    // Fallback to default storage deposit for escrow contracts on NEAR testnet
    return '100000000000000000000000'; // 0.1 NEAR
  }

  /**
   * Parse escrow ID from factory result
   */
  private parseEscrowId(result: any): string {
    try {
      // The result should contain the escrow account ID
      if (typeof result === 'string') {
        return result;
      }
      
      // If result is an object, look for common fields
      if (result && typeof result === 'object') {
        if (result.escrow_id) return result.escrow_id;
        if (result.account_id) return result.account_id;
        if (result.address) return result.address;
      }
      
      // Fallback: generate a predictable escrow ID
      const timestamp = Date.now();
      return `escrow-${timestamp}.${this.factoryContractId}`;
      
    } catch (error) {
      console.error('Failed to parse escrow ID:', error);
      // Generate fallback ID
      return `escrow-${Date.now()}.${this.factoryContractId}`;
    }
  }
}