import { EventEmitter } from 'events';
import {
  SolverState,
  SwapRequest,
  SwapOrder,
  SwapResult,
  SwapStatus,
  TEEAttestation,
  SolverMetrics
} from '../types';
import { SwapService } from '../services/SwapService';
import { TEESecurityService } from '../services/TEESecurityService';


/**
 * NearFusion Shade Agent Solver - Backend service for cross-chain atomic swaps
 * Handles user-initiated swaps using NEAR's Shade Agent Framework and TEE
 */
export class ShadeAgentSolver extends EventEmitter {
  private state: SolverState;
  private isRunning: boolean = false;
  private startTime: Date = new Date();

  constructor(
    private swapService: SwapService,
    private teeService: TEESecurityService
  ) {
    super();
    
    this.state = this.initializeState();
    this.setupEventListeners();
  }

  /**
   * Start the solver backend service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Solver is already running');
      return;
    }

    try {
      console.log('Starting NearFusion Shade Agent Solver...');
      // Verify TEE attestation
      // await this.verifyTEEAttestation();

      // Initialize all services
      await this.initializeServices();



      this.isRunning = true;
      this.state.isRunning = true;
      this.startTime = new Date();

      this.emit('started');
      console.log('Solver started successfully');
    } catch (error) {
      console.error('Failed to start solver:', error);
      this.isRunning = false;
      this.state.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the solver backend service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Solver is not running');
      return;
    }

    try {
      console.log('Stopping Solver...');

      await this.shutdownServices();

      this.isRunning = false;
      this.state.isRunning = false;

      this.emit('stopped');
      console.log('Solver stopped successfully');
    } catch (error) {
      console.error('Error stopping solver:', error);
      throw error;
    }
  }

  /**
   * Get current solver state
   */
  getState(): SolverState {
    return { ...this.state };
  }

  /**
   * Get solver metrics
   */
  getMetrics(): SolverMetrics {
    const uptime = Date.now() - this.startTime.getTime();
    const successRate = this.state.totalSwapsProcessed > 0 
      ? (this.state.successfulSwaps / this.state.totalSwapsProcessed) * 100 
      : 0;

    const activeSwapsByChain: Record<string, number> = {};
    const swaps = this.swapService.getAllSwaps();
    
    swaps.forEach(swap => {
      if (swap.status !== SwapStatus.COMPLETED && swap.status !== SwapStatus.FAILED && swap.status !== SwapStatus.CANCELLED) {
        activeSwapsByChain[swap.sourceChain] = (activeSwapsByChain[swap.sourceChain] || 0) + 1;
        activeSwapsByChain[swap.destinationChain] = (activeSwapsByChain[swap.destinationChain] || 0) + 1;
      }
    });

    return {
      uptime,
      totalSwaps: this.state.totalSwapsProcessed,
      successRate,
      averageSwapTime: 0, // TODO: Calculate based on historical data
      totalVolumeUSD: this.state.totalVolumeUSD,
      feesEarnedUSD: '0', // TODO: Calculate based on swap fees
      activeSwapsByChain,
      errorsByType: {}, // TODO: Track error types
      lastUpdate: new Date()
    };
  }

  /**
   * Execute a complete cross-chain atomic swap in a single call
   * This provides the best UX by handling the entire swap process internally
   */
  async executeCompleteSwap(request: SwapRequest): Promise<SwapResult> {
    if (!this.isRunning) {
      throw new Error('Solver is not running');
    }

    try {
      console.log('Starting complete swap execution');

      // Update state - we're processing a new swap
      this.state.activeSwaps++;
      this.state.totalSwapsProcessed++;

      const result = await this.swapService.executeCompleteSwap(request);
      
      // Update state - swap completed successfully
      this.state.activeSwaps--;
      this.state.successfulSwaps++;

      this.emit('swapCompleted', result);
      console.log(`Complete swap executed successfully: ${result.swapId}`);
      
      return result;
    } catch (error) {
      console.error('Failed to execute complete swap:', error);
      
      // Update state - swap failed
      this.state.failedSwaps++;
      this.state.activeSwaps--;
      
      throw error;
    }
  }

  /**
   * Cancel a swap and refund if possible
   */
  async cancelSwap(swapId: string): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Solver is not running');
    }

    try {
      await this.swapService.cancelSwap(swapId);
      
      // Update state
      this.state.activeSwaps--;
      
      this.emit('swapCancelled', { swapId });
      console.log(`Swap cancelled successfully: ${swapId}`);
    } catch (error) {
      console.error(`Failed to cancel swap ${swapId}:`, error);
      throw error;
    }
  }

  /**
   * Get swap by ID
   */
  getSwap(swapId: string): SwapOrder | null {
    return this.swapService.getSwap(swapId);
  }

  /**
   * Get all active swaps
   */
  getAllSwaps(): SwapOrder[] {
    return this.swapService.getAllSwaps();
  }

  /**
   * Get swaps by status
   */
  getSwapsByStatus(status: SwapStatus): SwapOrder[] {
    return this.swapService.getSwapsByStatus(status);
  }


  private initializeState(): SolverState {
    return {
      isRunning: false,
      activeSwaps: 0,
      totalSwapsProcessed: 0,
      successfulSwaps: 0,
      failedSwaps: 0,
      totalVolumeUSD: '0',
      balances: [],
      services: {
        swap: false,
        tee: false
      }
    };
  }

  private setupEventListeners(): void {
    // Listen to swap service events
    this.swapService.on('swapCreated', (swap: SwapOrder) => {
      this.emit('swapCreated', swap);
    });

    this.swapService.on('swapStatusChanged', (swap: SwapOrder) => {
      this.emit('swapStatusChanged', swap);
    });

    this.swapService.on('swapCompleted', (swap: SwapOrder) => {
      this.emit('swapCompleted', swap);
    });

    this.swapService.on('swapCancelled', (swap: SwapOrder) => {
      this.emit('swapCancelled', swap);
    });

    // Listen to TEE service events
    this.teeService.on('attestationGenerated', (attestation: TEEAttestation) => {
      this.emit('teeAttestationGenerated', attestation);
    });

    this.teeService.on('error', (error: Error) => {
      console.error('TEE service error:', error);
      this.emit('error', error);
    });
  }

  private async verifyTEEAttestation(): Promise<void> {
    try {
      console.log('Verifying TEE attestation...');
      
      const attestation = await this.teeService.generateAttestation();
      const isValid = await this.teeService.verifyAttestation(attestation);

      console.log('isValid', isValid);
      
      if (!isValid) {
        throw new Error('TEE attestation verification failed');
      }
      
      console.log('TEE attestation verified successfully');
    } catch (error) {
      console.error('TEE attestation verification failed:', error);
      throw error;
    }
  }

  private async initializeServices(): Promise<void> {
    console.log('Initializing services...');

    try {
      // Initialize TEE service first
      await this.teeService.initialize();
      this.state.services.tee = true;
      console.log('TEE service initialized');

      // Initialize swap service
      await this.swapService.initialize();
      this.state.services.swap = true;
      console.log('Swap service initialized');

      console.log('All services initialized successfully');
    } catch (error) {
      console.error('Service initialization failed:', error);
      throw error;
    }
  }

  private async shutdownServices(): Promise<void> {
    console.log('Shutting down services...');

    try {
      // SwapService and other services don't have explicit shutdown
      this.state.services.swap = false;
      this.state.services.tee = false;

      console.log('All services shutdown successfully');
    } catch (error) {
      console.error('Service shutdown failed:', error);
      throw error;
    }
  }
}