import { EventEmitter } from 'events';

import { CryptoUtils } from '../utils/CryptoUtils';
import { EVMEscrowService } from './EVMEscrowService';
import { NearEscrowService } from './NearEscrowService';
import { 
  ChainId, 
  SwapRequest, 
  SwapStatus, 
  SwapOrder, 
  SwapResult,
  EscrowImmutables,
  NearEscrowImmutables,
  Timelocks 
} from '../types';

export interface SwapServiceConfig {
  defaultTimelock: number;
  maxSwapAmount: string;
  minSwapAmount: string;
  swapFeePercentage: number;
}

/**
 * Service for handling user-initiated cross-chain atomic swaps
 */
export class SwapService extends EventEmitter {
  private activeSwaps: Map<string, SwapOrder> = new Map();
  private isInitialized: boolean = false;

  constructor(
    private config: SwapServiceConfig,
    private evmEscrowService: EVMEscrowService,
    private nearEscrowService: NearEscrowService
  ) {
    super();
  }

  async initialize(): Promise<void> {
    try {
      console.log('Initializing SwapService...');
      
      // Initialize dependent services
      await this.evmEscrowService.initialize();
      await this.nearEscrowService.initialize();
      
      this.isInitialized = true;
      console.log('SwapService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SwapService:', error);
      throw error;
    }
  }

  /**
   * Execute a complete cross-chain atomic swap in a single call
   * This is the main function that users should call for a seamless swap experience
   */
  async executeCompleteSwap(request: SwapRequest): Promise<SwapResult> {
    if (!this.isInitialized) {
      throw new Error('SwapService not initialized');
    }

    console.log('Starting complete swap execution');

    try {
      // Step 1: Create the swap order
      const swapOrder = await this.createSwapInternal(request);
      const swapId = swapOrder.id;
      const secret = swapOrder.secret!;

      console.log(`Swap order created, proceeding with execution: ${swapId}`);

      // Step 2: Execute first leg (source escrow)
      const sourceEscrowAddress = await this.executeSwapFirstLegInternal(swapId);
      console.log(`First leg completed for swap ${swapId}: ${sourceEscrowAddress}`);

      // Step 3: Execute second leg (destination escrow) 
      const destinationEscrowAddress = await this.executeSwapSecondLegInternal(swapId);
      console.log(`Second leg completed for swap ${swapId}: ${destinationEscrowAddress}`);

      // Step 4: Complete the swap by revealing the secret
      const result = await this.completeSwapInternal(swapId, secret);
      
      console.log(`Complete swap executed successfully: ${swapId}`);

      return result;
    } catch (error) {
      console.error('Complete swap execution failed:', error);
      throw error;
    }
  }

  /**
   * Cancel a swap and refund if possible
   */
  async cancelSwap(swapId: string): Promise<void> {
    const swap = this.activeSwaps.get(swapId);
    if (!swap) {
      throw new Error(`Swap not found: ${swapId}`);
    }

    if (![SwapStatus.CREATED, SwapStatus.FIRST_LEG_COMPLETED, SwapStatus.SECOND_LEG_COMPLETED].includes(swap.status)) {
      throw new Error(`Cannot cancel swap in status: ${swap.status}`);
    }

    try {
      console.log(`Cancelling swap: ${swapId}`);

      swap.status = SwapStatus.CANCELLING;
      this.emit('swapStatusChanged', swap);

      // Cancel escrows if they exist
      if (swap.sourceEscrowAddress) {
        if (this.isEVMChain(swap.sourceChain)) {
          await this.evmEscrowService.cancelEscrow(
            swap.sourceChain as ChainId,
            swap.sourceEscrowAddress,
            swap.evmImmutables!
          );
        } else {
          await this.nearEscrowService.cancelEscrow(swap.sourceEscrowAddress);
        }
      }

      if (swap.destinationEscrowAddress) {
        if (this.isEVMChain(swap.destinationChain)) {
          await this.evmEscrowService.cancelEscrow(
            swap.destinationChain as ChainId,
            swap.destinationEscrowAddress,
            swap.evmImmutables!
          );
        } else {
          await this.nearEscrowService.cancelEscrow(swap.destinationEscrowAddress);
        }
      }

      swap.status = SwapStatus.CANCELLED;
      swap.updatedAt = new Date();

      this.emit('swapCancelled', swap);
      console.log(`Swap cancelled successfully: ${swapId}`);
    } catch (error) {
      swap.status = SwapStatus.FAILED;
      swap.error = error instanceof Error ? error.message : String(error);
      swap.updatedAt = new Date();
      
      this.emit('swapStatusChanged', swap);
      console.error(`Swap cancellation failed for ${swapId}:`, error);
      throw error;
    }
  }

  /**
   * Get swap by ID
   */
  getSwap(swapId: string): SwapOrder | null {
    return this.activeSwaps.get(swapId) || null;
  }

  /**
   * Get all active swaps
   */
  getAllSwaps(): SwapOrder[] {
    return Array.from(this.activeSwaps.values());
  }

  /**
   * Get swaps by status
   */
  getSwapsByStatus(status: SwapStatus): SwapOrder[] {
    return Array.from(this.activeSwaps.values()).filter(swap => swap.status === status);
  }

  private validateSwapRequest(request: SwapRequest): void {
    if (!request.sourceChain || !request.destinationChain) {
      throw new Error('Source and destination chains are required');
    }

    if (request.sourceChain === request.destinationChain) {
      throw new Error('Source and destination chains must be different');
    }

    if (!request.sourceToken || !request.destinationToken) {
      throw new Error('Source and destination tokens are required');
    }

    const amount = parseFloat(request.amount);
    // const minAmount = parseFloat(this.config.minSwapAmount);
    // const maxAmount = parseFloat(this.config.maxSwapAmount);

    // if (amount < minAmount || amount > maxAmount) {
    //   throw new Error(`Swap amount must be between ${minAmount} and ${maxAmount}`);
    // }
  }

  private async generateSwapOrder(request: SwapRequest): Promise<SwapOrder> {
    // Generate secret and hashlock
    const secret = CryptoUtils.generateSecret();
    const hashlock = CryptoUtils.createHashlock(secret);

    // Generate timelocks
    const currentTime = Math.floor(Date.now() / 1000);
    const timelocks: Timelocks = {
      src_lock_time: currentTime + this.config.defaultTimelock,
      dst_lock_time: currentTime + this.config.defaultTimelock / 2,
      src_unlock_time: currentTime + this.config.defaultTimelock * 2,
      dst_unlock_time: currentTime + this.config.defaultTimelock * 3
    };

    const swapOrder: SwapOrder = {
      id: CryptoUtils.generateSalt(),
      sourceChain: request.sourceChain,
      destinationChain: request.destinationChain,
      sourceToken: request.sourceToken,
      destinationToken: request.destinationToken,
      amount: request.amount,
      destinationAmount: request.destinationAmount,
      userAddress: request.userAddress,
      recipientAddress: request.recipientAddress,
      hashlock,
      secret, // Store secret securely
      timelocks,
      status: SwapStatus.CREATED,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Generate immutables for EVM chains
    if (this.isEVMChain(request.sourceChain) || this.isEVMChain(request.destinationChain)) {
      swapOrder.evmImmutables = {
        hashlock,
        timelocks,
        srcToken: request.sourceToken,
        dstToken: request.destinationToken,
        srcAddr: request.userAddress,
        dstAddr: request.recipientAddress,
        amount: request.amount,
        dstAmount: request.destinationAmount
      };
    }

    // Generate immutables for NEAR
    if (request.sourceChain === 'near' || request.destinationChain === 'near') {
      swapOrder.nearImmutables = {
        hashlock,
        timelocks,
        src_token: request.sourceToken,
        dst_token: request.destinationToken,
        src_addr: request.userAddress,
        dst_addr: request.recipientAddress,
        amount: request.amount,
        dst_amount: request.destinationAmount
      };
    }

    return swapOrder;
  }

  private async createSwapInternal(request: SwapRequest): Promise<SwapOrder> {
    if (!this.isInitialized) {
      throw new Error('SwapService not initialized');
    }

    console.log('Creating new swap');

    // Validate swap request
    this.validateSwapRequest(request);

    // Generate swap order
    const swapOrder = await this.generateSwapOrder(request);

    // Store active swap
    this.activeSwaps.set(swapOrder.id, swapOrder);

    // Emit swap created event
    this.emit('swapCreated', swapOrder);

    console.log(`Swap created successfully: ${swapOrder.id}`);
    return swapOrder;
  }

  /**
   * Execute the first leg of the atomic swap (create source escrow)
   */
  private async executeSwapFirstLegInternal(swapId: string): Promise<string> {
    const swap = this.activeSwaps.get(swapId);
    if (!swap) {
      throw new Error(`Swap not found: ${swapId}`);
    }

    if (swap.status !== SwapStatus.CREATED) {
      throw new Error(`Invalid swap status for first leg: ${swap.status}`);
    }

    try {
      console.log(`Executing swap first leg: ${swapId}`);

      // Update status
      swap.status = SwapStatus.FIRST_LEG_PENDING;
      this.emit('swapStatusChanged', swap);

      let escrowAddress: string;

      // Create source escrow based on source chain
      if (this.isEVMChain(swap.sourceChain)) {
        escrowAddress = await this.evmEscrowService.createEscrow(
          swap.sourceChain as ChainId,
          swap.evmImmutables!,
          'source'
        );
      } else {
        escrowAddress = await this.nearEscrowService.createSrcEscrow(
          swap.nearImmutables!
        );
      }

      // Update swap with escrow address
      swap.sourceEscrowAddress = escrowAddress;
      swap.status = SwapStatus.FIRST_LEG_COMPLETED;
      swap.updatedAt = new Date();

      this.emit('swapStatusChanged', swap);
      console.log(`Swap first leg completed for ${swapId}: ${escrowAddress}`);

      return escrowAddress;
    } catch (error) {
      swap.status = SwapStatus.FAILED;
      swap.error = error instanceof Error ? error.message : String(error);
      swap.updatedAt = new Date();
      
      this.emit('swapStatusChanged', swap);
      console.error(`Swap first leg failed for ${swapId}:`, error);
      throw error;
    }
  }

  /**
   * Execute the second leg of the atomic swap (create destination escrow)
   */
  private async executeSwapSecondLegInternal(swapId: string): Promise<string> {
    const swap = this.activeSwaps.get(swapId);
    if (!swap) {
      throw new Error(`Swap not found: ${swapId}`);
    }

    if (swap.status !== SwapStatus.FIRST_LEG_COMPLETED) {
      throw new Error(`Invalid swap status for second leg: ${swap.status}`);
    }

    try {
      console.log(`Executing swap second leg: ${swapId}`);

      // Update status
      swap.status = SwapStatus.SECOND_LEG_PENDING;
      this.emit('swapStatusChanged', swap);

      let escrowAddress: string;

      // Create destination escrow based on destination chain
      if (this.isEVMChain(swap.destinationChain)) {
        escrowAddress = await this.evmEscrowService.createDstEscrow(
          swap.destinationChain as ChainId,
          swap.evmImmutables!
        );
      } else {
        escrowAddress = await this.nearEscrowService.createDstEscrow(
          swap.nearImmutables!
        );
      }

      // Update swap with escrow address
      swap.destinationEscrowAddress = escrowAddress;
      swap.status = SwapStatus.SECOND_LEG_COMPLETED;
      swap.updatedAt = new Date();

      this.emit('swapStatusChanged', swap);
      console.log(`Swap second leg completed for ${swapId}: ${escrowAddress}`);

      return escrowAddress;
    } catch (error) {
      swap.status = SwapStatus.FAILED;
      swap.error = error instanceof Error ? error.message : String(error);
      swap.updatedAt = new Date();
      
      this.emit('swapStatusChanged', swap);
      console.error(`Swap second leg failed for ${swapId}:`, error);
      throw error;
    }
  }

  /**
   * Complete the atomic swap by revealing the secret
   */
  private async completeSwapInternal(swapId: string, secret: string): Promise<SwapResult> {
    const swap = this.activeSwaps.get(swapId);
    if (!swap) {
      throw new Error(`Swap not found: ${swapId}`);
    }

    if (swap.status !== SwapStatus.SECOND_LEG_COMPLETED) {
      throw new Error(`Invalid swap status for completion: ${swap.status}`);
    }

    try {
      console.log(`Completing swap: ${swapId}`);

      // Verify secret matches hashlock
      if (!CryptoUtils.verifySecret(secret, swap.hashlock)) {
        throw new Error('Invalid secret provided');
      }

      // Update status
      swap.status = SwapStatus.COMPLETING;
      swap.secret = secret;
      this.emit('swapStatusChanged', swap);

      const result: SwapResult = {
        swapId,
        secret,
        sourceTransaction: '',
        destinationTransaction: '',
        completedAt: new Date()
      };

      // Withdraw from destination escrow first
      if (this.isEVMChain(swap.destinationChain)) {
        result.destinationTransaction = await this.evmEscrowService.withdrawFunds(
          swap.destinationChain as ChainId,
          swap.destinationEscrowAddress!,
          secret,
          swap.evmImmutables!
        );
      } else {
        result.destinationTransaction = await this.nearEscrowService.withdrawFunds(
          swap.destinationEscrowAddress!,
          secret,
          swap.nearImmutables
        );
      }

      // Withdraw from source escrow
      if (this.isEVMChain(swap.sourceChain)) {
        result.sourceTransaction = await this.evmEscrowService.withdrawFunds(
          swap.sourceChain as ChainId,
          swap.sourceEscrowAddress!,
          secret,
          swap.evmImmutables!
        );
      } else {
        result.sourceTransaction = await this.nearEscrowService.withdrawFunds(
          swap.sourceEscrowAddress!,
          secret,
          swap.nearImmutables
        );
      }

      // Update swap status
      swap.status = SwapStatus.COMPLETED;
      swap.completedAt = new Date();
      swap.updatedAt = new Date();

      this.emit('swapCompleted', swap);
      console.log(`Swap completed successfully: ${swapId}`);

      return result;
    } catch (error) {
      swap.status = SwapStatus.FAILED;
      swap.error = error instanceof Error ? error.message : String(error);
      swap.updatedAt = new Date();
      
      this.emit('swapStatusChanged', swap);
      console.error(`Swap completion failed for ${swapId}:`, error);
      throw error;
    }
  }

  private isEVMChain(chain: string): boolean {
    return ['base-sepolia'].includes(chain);
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized) return false;
      
      const evmHealth = await this.evmEscrowService.healthCheck();
      const nearHealth = await this.nearEscrowService.healthCheck();
      
      return evmHealth && nearHealth;
    } catch (error) {
      console.error('SwapService health check failed:', error);
      return false;
    }
  }
}