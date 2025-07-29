// Core Types
export type ChainId = 'base-sepolia' | 'near';

export interface NetworkConfig {
  rpcUrl: string;
  chainId: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrl: string;
  escrowFactoryAddress?: string;
}

// Swap Request and Order Types
export interface SwapRequest {
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  amount: string;
  destinationAmount: string;
  userAddress: string;
  recipientAddress: string;
  slippageTolerance?: number;
}

export enum SwapStatus {
  CREATED = 'created',
  FIRST_LEG_PENDING = 'first_leg_pending',
  FIRST_LEG_COMPLETED = 'first_leg_completed',
  SECOND_LEG_PENDING = 'second_leg_pending',
  SECOND_LEG_COMPLETED = 'second_leg_completed',
  COMPLETING = 'completing',
  COMPLETED = 'completed',
  CANCELLING = 'cancelling',
  CANCELLED = 'cancelled',
  FAILED = 'failed'
}

export interface SwapOrder {
  id: string;
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  amount: string;
  destinationAmount: string;
  userAddress: string;
  recipientAddress: string;
  hashlock: string;
  secret?: string;
  timelocks: Timelocks;
  status: SwapStatus;
  sourceEscrowAddress?: string;
  destinationEscrowAddress?: string;
  evmImmutables?: EscrowImmutables;
  nearImmutables?: NearEscrowImmutables;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface SwapResult {
  swapId: string;
  secret: string;
  sourceTransaction: string;
  destinationTransaction: string;
  completedAt: Date;
}

// Escrow Types
export interface EscrowImmutables {
  hashlock: string;
  timelocks: Timelocks;
  srcToken: string;
  dstToken: string;
  srcAddr: string;
  dstAddr: string;
  amount: string;
  dstAmount: string;
}

export interface NearEscrowImmutables {
  hashlock: string;
  timelocks: Timelocks;
  src_token: string;
  dst_token: string;
  src_addr: string;
  dst_addr: string;
  amount: string;
  dst_amount: string;
}

export interface Timelocks {
  src_lock_time: number;
  dst_lock_time: number;
  src_unlock_time: number;
  dst_unlock_time: number;
}

// Solver Configuration
export interface SolverConfig {
  // Network configurations
  networks: Record<ChainId, NetworkConfig>;
  
  // NEAR configuration
  near: {
    networkId: string;
    accountId: string;
    privateKey: string;
    rpcUrl: string;
    factoryContractId: string;
  };
  
  // EVM configuration
  evm: {
    privateKey: string;
  };
  
  // Quote service configuration
  quote: {
    priceFeeds: {
      coingecko?: {
        apiKey?: string;
        apiUrl: string;
      };
      defillama?: {
        apiUrl: string;
      };
      custom?: {
        apiUrl: string;
        apiKey?: string;
      };
    };
    updateInterval: number;
    slippageTolerance: number;
    baseFeePercentage: number;
  };
  
  // Swap service configuration
  swap: {
    defaultTimelock: number;
    maxSwapAmount: string;
    minSwapAmount: string;
    swapFeePercentage: number;
  };
  
  // TEE configuration
  tee: {
    attestationUrl: string;
    apiKey?: string;
    environment: 'development' | 'production';
  };
  
  // Server configuration
  server: {
    port: number;
    cors: {
      origins: string[];
    };
  };
  
  // Logging
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}

// State and Monitoring Types
export interface SolverState {
  isRunning: boolean;
  activeSwaps: number;
  totalSwapsProcessed: number;
  successfulSwaps: number;
  failedSwaps: number;
  totalVolumeUSD: string;
  balances: TokenBalance[];
  lastHealthCheck: Date;
  services: {
    swap: boolean;
    quote: boolean;
    evmEscrow: boolean;
    nearEscrow: boolean;
    tee: boolean;
  };
}

export interface TokenBalance {
  chain: ChainId | 'near';
  token: string;
  symbol: string;
  balance: string;
  valueUSD: string;
}

// TEE Types
export interface TEEAttestation {
  attestationData: string;
  signature: string;
  timestamp: Date;
  publicKey: string;
  isValid: boolean;
}

export interface TEEConfig {
  attestationUrl: string;
  apiKey?: string;
  environment: 'development' | 'production';
}

// Error Types - Updated to be a proper error class
export class SolverError extends Error {
  constructor(
    message: string,
    public code: string,
    public chainId?: ChainId | string,
    public details?: any
  ) {
    super(message);
    this.name = 'SolverError';
  }
}

export enum SolverErrorCode {
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  SWAP_VALIDATION_FAILED = 'SWAP_VALIDATION_FAILED',
  ESCROW_CREATION_FAILED = 'ESCROW_CREATION_FAILED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INVALID_SECRET = 'INVALID_SECRET',
  TIMELOCK_EXPIRED = 'TIMELOCK_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TEE_ATTESTATION_FAILED = 'TEE_ATTESTATION_FAILED',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  WITHDRAWAL_ERROR = 'WITHDRAWAL_ERROR',
  CANCELLATION_ERROR = 'CANCELLATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// API Types for frontend integration
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface SwapQuoteRequest {
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  amount: string;
  slippageTolerance?: number;
}

export interface SwapQuote {
  sourceAmount: string;
  destinationAmount: string;
  estimatedRate: string;
  minimumReceived: string;
  priceImpact: string;
  gasCost: string;
  totalFees: string;
  route: SwapRoute[];
  validUntil: Date;
}

export interface SwapRoute {
  chain: string;
  protocol: string;
  token: string;
  percentage: number;
}

// WebSocket Event Types
export interface WebSocketEvent {
  type: 'swapCreated' | 'swapStatusChanged' | 'swapCompleted' | 'swapCancelled' | 'error';
  data: any;
  timestamp: Date;
}

// Metrics and Analytics
export interface SolverMetrics {
  uptime: number;
  totalSwaps: number;
  successRate: number;
  averageSwapTime: number;
  totalVolumeUSD: string;
  feesEarnedUSD: string;
  activeSwapsByChain: Record<string, number>;
  errorsByType: Record<string, number>;
  lastUpdate: Date;
}

// Health Check Types
export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  lastCheck: Date;
  details?: any;
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  services: HealthCheckResult[];
  timestamp: Date;
}