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
import { Logger } from '../utils/Logger';

// Contract ABIs
const ESCROW_FACTORY_ABI = [
  // Factory interface
  'function createDstEscrow(tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint256 srcLockTime, uint256 dstLockTime, uint256 srcUnlockTime, uint256 dstUnlockTime) timelocks) dstImmutables) external payable',
  'function addressOfEscrowDst(tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint256 srcLockTime, uint256 dstLockTime, uint256 srcUnlockTime, uint256 dstUnlockTime) timelocks) immutables) external view returns (address)',
  'function ESCROW_DST_IMPLEMENTATION() external view returns (address)',
  'event DstEscrowCreated(address escrow, bytes32 hashlock, address taker, address indexed creator, uint8 creatorType)'
];

const ESCROW_ABI = [
  // Escrow interface
  'function withdraw(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint256 srcLockTime, uint256 dstLockTime, uint256 srcUnlockTime, uint256 dstUnlockTime) timelocks) immutables) external',
  'function cancel(tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint256 srcLockTime, uint256 dstLockTime, uint256 srcUnlockTime, uint256 dstUnlockTime) timelocks) immutables) external',
  'function rescueFunds(address token, uint256 amount, tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint256 srcLockTime, uint256 dstLockTime, uint256 srcUnlockTime, uint256 dstUnlockTime) timelocks) immutables) external',
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
    private privateKey: string,
    private logger: Logger
  ) {
    super();
  }

  /**
   * Initialize EVM escrow service
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing EVMEscrowService...');
      
      // Initialize Base Sepolia chain
      for (const [chainId, config] of Object.entries(this.networks)) {
        if (chainId !== 'near') {
          await this.initializeChain(chainId as ChainId, config);
        }
      }
      
      this.logger.info('EVMEscrowService initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize EVMEscrowService', { error });
      throw error;
    }
  }

  /**
   * Create destination escrow for NEAR→EVM swaps
   */
  async createDstEscrow(chainId: ChainId, immutables: EscrowImmutables): Promise<string> {
    try {
      this.logger.info('Creating EVM destination escrow', { chainId });

      const factory = this.factoryContracts.get(chainId);
      if (!factory) {
        throw new SolverError(`No factory contract for chain ${chainId}`, SolverErrorCode.CONTRACT_ERROR, chainId);
      }

      // Format immutables for contract call
      const contractImmutables = this.formatImmutablesForContract(immutables);
      
      // Calculate required safety deposit (typically for gas costs)
      const safetyDeposit = this.calculateSafetyDeposit(immutables);
      
      // Add safety deposit to immutables
      contractImmutables.safetyDeposit = safetyDeposit;
      
      // Create destination escrow
      const tx = await factory.createDstEscrow(
        contractImmutables,
        { value: safetyDeposit }
      );
      
      const receipt = await tx.wait();
      const escrowAddress = this.parseEscrowCreatedEvent(receipt);
      
      // Initialize escrow contract instance
      await this.initializeEscrowContract(escrowAddress);
      
      this.logger.info('EVM destination escrow created', { chainId, escrowAddress });
      this.emit('escrowCreated', { chainId, address: escrowAddress, type: 'destination' });
      
      return escrowAddress;
      
    } catch (error) {
      this.logger.error('Failed to create EVM destination escrow', { error, chainId });
      throw new SolverError('Failed to create destination escrow', SolverErrorCode.ESCROW_CREATION_FAILED, chainId);
    }
  }

  /**
   * Generic escrow creation method - defaults to destination for EVM
   */
  async createEscrow(chainId: ChainId, immutables: EscrowImmutables, type: 'source' | 'destination' = 'destination'): Promise<string> {
    // For EVM chains, we primarily create destination escrows for NEAR→EVM swaps
    return this.createDstEscrow(chainId, immutables);
  }

  /**
   * Withdraw funds from escrow using secret
   */
  async withdrawFunds(chainId: ChainId, escrowAddress: string, secret: string, immutables: EscrowImmutables): Promise<string> {
    try {
      this.logger.info('Withdrawing funds from EVM escrow', { chainId, escrowAddress });

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
      const contractImmutables = this.formatImmutablesForContract(immutables);
      
      // Convert secret to bytes32
      const secretBytes32 = ethers.keccak256(ethers.toUtf8Bytes(secret));
      
      // Withdraw funds
      const tx = await escrow.withdraw(secretBytes32, contractImmutables);
      const receipt = await tx.wait();
      
      this.logger.info('Funds withdrawn from EVM escrow', { 
        chainId, 
        address: escrowAddress, 
        transactionHash: receipt.hash 
      });
      
      this.emit('fundsWithdrawn', { 
        chainId, 
        address: escrowAddress, 
        transactionHash: receipt.hash,
        secret 
      });
      
      return receipt.hash;
      
    } catch (error) {
      this.logger.error('Failed to withdraw funds from EVM escrow', { error, chainId, escrowAddress });
      throw new SolverError('Failed to withdraw funds', SolverErrorCode.WITHDRAWAL_ERROR, chainId);
    }
  }

  /**
   * Cancel escrow and refund
   */
  async cancelEscrow(chainId: ChainId, escrowAddress: string, immutables: EscrowImmutables): Promise<string> {
    try {
      this.logger.info('Cancelling EVM escrow', { chainId, escrowAddress });

      let escrow = this.escrowContracts.get(escrowAddress);
      if (!escrow) {
        await this.initializeEscrowContract(escrowAddress);
        escrow = this.escrowContracts.get(escrowAddress);
        if (!escrow) {
          throw new SolverError(`No escrow contract found at ${escrowAddress}`, SolverErrorCode.CONTRACT_ERROR, chainId);
        }
      }

      // Format immutables for contract call
      const contractImmutables = this.formatImmutablesForContract(immutables);
      
      // Cancel escrow
      const tx = await escrow.cancel(contractImmutables);
      const receipt = await tx.wait();
      
      this.logger.info('EVM escrow cancelled', { 
        chainId, 
        address: escrowAddress, 
        transactionHash: receipt.hash 
      });
      
      this.emit('escrowCancelled', { 
        chainId, 
        address: escrowAddress, 
        transactionHash: receipt.hash 
      });
      
      return receipt.hash;
      
    } catch (error) {
      this.logger.error('Failed to cancel EVM escrow', { error, chainId, escrowAddress });
      throw new SolverError('Failed to cancel escrow', SolverErrorCode.CANCELLATION_ERROR, chainId);
    }
  }

  /**
   * Get the deterministic address of an escrow before deployment
   */
  async getEscrowAddress(chainId: ChainId, immutables: EscrowImmutables): Promise<string> {
    try {
      const factory = this.factoryContracts.get(chainId);
      if (!factory) {
        throw new SolverError(`No factory contract for chain ${chainId}`, SolverErrorCode.CONTRACT_ERROR, chainId);
      }

      const contractImmutables = this.formatImmutablesForContract(immutables);
      contractImmutables.safetyDeposit = this.calculateSafetyDeposit(immutables);
      
      const address = await factory.addressOfEscrowDst(contractImmutables);
      return address;
      
    } catch (error) {
      this.logger.error('Failed to get escrow address', { error, chainId });
      throw new SolverError('Failed to get escrow address', SolverErrorCode.CONTRACT_ERROR, chainId);
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
      this.logger.error('Failed to get balances', { error, chainId });
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
      this.logger.error('EVM health check failed', { error });
      return false;
    }
  }

  /**
   * Initialize a specific chain
   */
  private async initializeChain(chainId: ChainId, config: NetworkConfig): Promise<void> {
    try {
      this.logger.debug('Initializing EVM chain', { chainId });

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

      this.logger.debug('EVM chain initialized', { chainId });
      
    } catch (error) {
      this.logger.error('Failed to initialize EVM chain', { error, chainId });
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
      this.logger.debug('Escrow contract initialized', { escrowAddress });
      
    } catch (error) {
      this.logger.error('Failed to initialize escrow contract', { error, escrowAddress });
      throw error;
    }
  }

  /**
   * Format immutables for contract calls
   */
  private formatImmutablesForContract(immutables: EscrowImmutables): any {
    return {
      orderHash: immutables.hashlock, // Using hashlock as orderHash for simplicity
      hashlock: immutables.hashlock,
      maker: immutables.srcAddr,
      taker: immutables.dstAddr,
      token: immutables.dstToken,
      amount: BigInt(immutables.dstAmount),
      safetyDeposit: BigInt(0), // Will be set separately
      timelocks: {
        srcLockTime: immutables.timelocks.src_lock_time,
        dstLockTime: immutables.timelocks.dst_lock_time,
        srcUnlockTime: immutables.timelocks.src_unlock_time,
        dstUnlockTime: immutables.timelocks.dst_unlock_time
      }
    };
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
  private parseEscrowCreatedEvent(receipt: ethers.TransactionReceipt): string {
    try {
      const factory = Array.from(this.factoryContracts.values())[0];
      if (!factory) {
        throw new Error('No factory contract available for event parsing');
      }

      // Parse logs to find DstEscrowCreated event
      const logs = receipt.logs.filter(log => log.address === factory.target);
      
      for (const log of logs) {
        try {
          const parsedLog = factory.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          
          if (parsedLog && parsedLog.name === 'DstEscrowCreated') {
            return parsedLog.args.escrow;
          }
        } catch (parseError) {
          // Continue to next log if parsing fails
          continue;
        }
      }
      
      throw new Error('DstEscrowCreated event not found in receipt');
      
    } catch (error) {
      this.logger.error('Failed to parse escrow created event', { error });
      // Return a placeholder for now - in production this should throw
      throw new Error('Failed to parse escrow address from transaction receipt');
    }
  }
}