import { EventEmitter } from 'events';
import {
  SolverConfig,
  SolverState,
  SwapRequest,
  SwapOrder,
  SwapResult,
  SwapStatus,
  TokenBalance,
  TEEAttestation,
  SolverError,
  SystemHealth,
  HealthCheckResult,
  SolverMetrics
} from '../types';
import { SwapService } from '../services/SwapService';
import { QuoteService } from '../services/QuoteService';
import { EVMEscrowService } from '../services/EVMEscrowService';
import { NearEscrowService } from '../services/NearEscrowService';
import { TEESecurityService } from '../services/TEESecurityService';
import { Logger } from '../utils/Logger';

/**
 * NearFusion Shade Agent Solver - Backend service for cross-chain atomic swaps
 * Handles user-initiated swaps using NEAR's Shade Agent Framework and TEE
 */
export class ShadeAgentSolver extends EventEmitter {
  private state: SolverState;
  private isRunning: boolean = false;
  private healthCheckInterval?: NodeJS.Timeout;
  private startTime: Date = new Date();

  constructor(
    private config: SolverConfig,
    private swapService: SwapService,
    private quoteService: QuoteService,
    private evmEscrowService: EVMEscrowService,
    private nearEscrowService: NearEscrowService,
    private teeService: TEESecurityService,
    private logger: Logger
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
      this.logger.warn('Solver is already running');
      return;
    }

    try {
      this.logger.info('Starting NearFusion Shade Agent Solver...');

      // Verify TEE attestation
      await this.verifyTEEAttestation();

      // Initialize all services
      await this.initializeServices();

      // Start health monitoring
      this.startHealthMonitoring();

      this.isRunning = true;
      this.state.isRunning = true;
      this.startTime = new Date();

      this.emit('started');
      this.logger.info('Solver started successfully');
    } catch (error) {
      this.logger.error('Failed to start solver', { error });
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
      this.logger.warn('Solver is not running');
      return;
    }

    try {
      this.logger.info('Stopping Solver...');

      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Wait for active swaps to complete (with timeout)
      await this.waitForActiveSwaps(30000); // 30 second timeout

      // Shutdown services
      await this.shutdownServices();

      this.isRunning = false;
      this.state.isRunning = false;

      this.emit('stopped');
      this.logger.info('Solver stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping solver', { error });
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
   * Create a new cross-chain swap
   */
  async createSwap(request: SwapRequest): Promise<SwapOrder> {
    if (!this.isRunning) {
      throw new Error('Solver is not running');
    }

    try {
      this.logger.info('Creating new swap', { request });

      const swapOrder = await this.swapService.createSwap(request);
      
      // Update state
      this.state.activeSwaps++;
      this.state.totalSwapsProcessed++;

      this.emit('swapCreated', swapOrder);
      return swapOrder;
    } catch (error) {
      this.logger.error('Failed to create swap', { error, request });
      this.state.failedSwaps++;
      throw error;
    }
  }

  /**
   * Execute swap first leg (create source escrow)
   */
  async executeSwapFirstLeg(swapId: string): Promise<string> {
    if (!this.isRunning) {
      throw new Error('Solver is not running');
    }

    try {
      const escrowAddress = await this.swapService.executeSwapFirstLeg(swapId);
      this.emit('swapFirstLegCompleted', { swapId, escrowAddress });
      return escrowAddress;
    } catch (error) {
      this.logger.error('Failed to execute swap first leg', { error, swapId });
      this.state.failedSwaps++;
      throw error;
    }
  }

  /**
   * Execute swap second leg (create destination escrow)
   */
  async executeSwapSecondLeg(swapId: string): Promise<string> {
    if (!this.isRunning) {
      throw new Error('Solver is not running');
    }

    try {
      const escrowAddress = await this.swapService.executeSwapSecondLeg(swapId);
      this.emit('swapSecondLegCompleted', { swapId, escrowAddress });
      return escrowAddress;
    } catch (error) {
      this.logger.error('Failed to execute swap second leg', { error, swapId });
      this.state.failedSwaps++;
      throw error;
    }
  }

  /**
   * Complete a swap by revealing the secret
   */
  async completeSwap(swapId: string, secret: string): Promise<SwapResult> {
    if (!this.isRunning) {
      throw new Error('Solver is not running');
    }

    try {
      const result = await this.swapService.completeSwap(swapId, secret);
      
      // Update state
      this.state.activeSwaps--;
      this.state.successfulSwaps++;

      this.emit('swapCompleted', result);
      return result;
    } catch (error) {
      this.logger.error('Failed to complete swap', { error, swapId });
      this.state.failedSwaps++;
      this.state.activeSwaps--;
      throw error;
    }
  }

  /**
   * Cancel a swap
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
    } catch (error) {
      this.logger.error('Failed to cancel swap', { error, swapId });
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
   * Get all swaps
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

  /**
   * Get system health status
   */
  async getHealth(): Promise<SystemHealth> {
    const services: HealthCheckResult[] = [];

    // Check swap service
    try {
      const swapHealthy = await this.swapService.healthCheck();
      services.push({
        service: 'swap',
        status: swapHealthy ? 'healthy' : 'unhealthy',
        lastCheck: new Date()
      });
    } catch (error) {
      services.push({
        service: 'swap',
        status: 'unhealthy',
        lastCheck: new Date(),
        details: error
      });
    }

    // Check quote service
    try {
      const quoteHealthy = await this.quoteService.healthCheck();
      services.push({
        service: 'quote',
        status: quoteHealthy ? 'healthy' : 'unhealthy',
        lastCheck: new Date()
      });
    } catch (error) {
      services.push({
        service: 'quote',
        status: 'unhealthy',
        lastCheck: new Date(),
        details: error
      });
    }

    // Check EVM escrow service
    try {
      const evmHealthy = await this.evmEscrowService.healthCheck();
      services.push({
        service: 'evmEscrow',
        status: evmHealthy ? 'healthy' : 'unhealthy',
        lastCheck: new Date()
      });
    } catch (error) {
      services.push({
        service: 'evmEscrow',
        status: 'unhealthy',
        lastCheck: new Date(),
        details: error
      });
    }

    // Check NEAR escrow service
    try {
      const nearHealthy = await this.nearEscrowService.healthCheck();
      services.push({
        service: 'nearEscrow',
        status: nearHealthy ? 'healthy' : 'unhealthy',
        lastCheck: new Date()
      });
    } catch (error) {
      services.push({
        service: 'nearEscrow',
        status: 'unhealthy',
        lastCheck: new Date(),
        details: error
      });
    }

    // Check TEE service
    try {
      const teeHealthy = await this.teeService.healthCheck();
      services.push({
        service: 'tee',
        status: teeHealthy ? 'healthy' : 'unhealthy',
        lastCheck: new Date()
      });
    } catch (error) {
      services.push({
        service: 'tee',
        status: 'unhealthy',
        lastCheck: new Date(),
        details: error
      });
    }

    // Determine overall health
    const unhealthyServices = services.filter(s => s.status === 'unhealthy');
    const degradedServices = services.filter(s => s.status === 'degraded');

    let overall: 'healthy' | 'unhealthy' | 'degraded';
    if (unhealthyServices.length > 0) {
      overall = 'unhealthy';
    } else if (degradedServices.length > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    return {
      overall,
      services,
      timestamp: new Date()
    };
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
      lastHealthCheck: new Date(),
      services: {
        swap: false,
        quote: false,
        evmEscrow: false,
        nearEscrow: false,
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
      this.logger.error('TEE service error', { error });
      this.emit('error', error);
    });
  }

  private async verifyTEEAttestation(): Promise<void> {
    try {
      this.logger.info('Verifying TEE attestation...');
      const attestation = await this.teeService.generateAttestation();
      const isValid = await this.teeService.verifyAttestation(attestation);
      
      if (!isValid) {
        throw new Error('TEE attestation verification failed');
      }
      
      this.logger.info('TEE attestation verified successfully');
    } catch (error) {
      this.logger.error('TEE attestation verification failed', { error });
      throw error;
    }
  }

  private async initializeServices(): Promise<void> {
    this.logger.info('Initializing services...');

    try {
      // Initialize TEE service first
      await this.teeService.initialize();
      this.state.services.tee = true;
      this.logger.info('TEE service initialized');

      // Initialize swap service
      await this.swapService.initialize();
      this.state.services.swap = true;
      this.logger.info('Swap service initialized');

      // Initialize quote service
      await this.quoteService.initialize();
      this.state.services.quote = true;
      this.logger.info('Quote service initialized');

      // EVM and NEAR services are initialized by SwapService
      this.state.services.evmEscrow = true;
      this.state.services.nearEscrow = true;

      this.logger.info('All services initialized successfully');
    } catch (error) {
      this.logger.error('Service initialization failed', { error });
      throw error;
    }
  }

  private async shutdownServices(): Promise<void> {
    this.logger.info('Shutting down services...');

    try {
      await this.quoteService.shutdown();
      this.state.services.quote = false;
      this.logger.info('Quote service shutdown');

      // SwapService and other services don't have explicit shutdown
      this.state.services.swap = false;
      this.state.services.evmEscrow = false;
      this.state.services.nearEscrow = false;
      this.state.services.tee = false;

      this.logger.info('All services shutdown successfully');
    } catch (error) {
      this.logger.error('Service shutdown failed', { error });
      throw error;
    }
  }

  private startHealthMonitoring(): void {
    const healthCheckInterval = 30000; // 30 seconds

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.logger.error('Health check failed', { error });
      }
    }, healthCheckInterval);

    this.logger.info('Health monitoring started');
  }

  private async performHealthCheck(): Promise<void> {
    const health = await this.getHealth();
    this.state.lastHealthCheck = new Date();

    // Update service states
    health.services.forEach(service => {
      if (service.service in this.state.services) {
        this.state.services[service.service as keyof typeof this.state.services] = 
          service.status === 'healthy';
      }
    });

    // Update balances
    await this.updateBalances();

    this.emit('healthCheck', health);
  }

  private async updateBalances(): Promise<void> {
    try {
      // Get EVM balances (Base Sepolia only)
      const evmBalances = await Promise.allSettled([
        this.evmEscrowService.getBalances('base-sepolia')
      ]);

      // Get NEAR balances
      const nearBalances = await this.nearEscrowService.getBalances();

      // Combine all balances
      const allBalances: TokenBalance[] = [];
      
      // Process EVM balances
      evmBalances.forEach(result => {
        if (result.status === 'fulfilled') {
          allBalances.push(...result.value);
        }
      });

      // Add NEAR balances
      allBalances.push(...nearBalances);

      // Update state
      this.state.balances = allBalances;
      
    } catch (error) {
      this.logger.error('Failed to update balances', { error });
    }
  }

  private async waitForActiveSwaps(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkActiveSwaps = () => {
        const activeSwaps = this.swapService.getSwapsByStatus(SwapStatus.FIRST_LEG_PENDING)
          .concat(this.swapService.getSwapsByStatus(SwapStatus.SECOND_LEG_PENDING))
          .concat(this.swapService.getSwapsByStatus(SwapStatus.COMPLETING));

        if (activeSwaps.length === 0 || Date.now() - startTime > timeoutMs) {
          resolve();
        } else {
          setTimeout(checkActiveSwaps, 1000);
        }
      };

      checkActiveSwaps();
    });
  }
}