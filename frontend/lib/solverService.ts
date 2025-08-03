import { io, Socket } from 'socket.io-client';
import { SOLVER_API_URL } from '../config';

// Types based on solver backend
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
  transferTxHash?: string; // Hash of the user's transfer to escrow factory
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
  status: SwapStatus;
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

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface SolverState {
  isRunning: boolean;
  activeSwaps: number;
  totalSwapsProcessed: number;
  successfulSwaps: number;
  failedSwaps: number;
  totalVolumeUSD: string;
}

// WebSocket Event Types
export interface SwapUpdateEvent {
  type: 'initiated' | 'completed' | 'cancelled' | 'statusChanged';
  swapId: string;
  data: SwapResult | SwapOrder | { swapId: string };
  timestamp: Date;
}

export interface SwapCompletedEvent {
  type: 'swapCompleted';
  data: SwapResult;
  timestamp: Date;
}

export interface SwapCancelledEvent {
  type: 'swapCancelled';
  data: { swapId: string };
  timestamp: Date;
}

export interface SolverErrorEvent {
  type: 'error';
  error: string;
  timestamp: Date;
}

export interface SwapInitiatedEvent {
  type: 'swapInitiated';
  data: SwapOrder;
  timestamp: Date;
}

class SolverService {
  private baseUrl: string;
  private socket: Socket | null = null;

  constructor() {
    // Use the configuration from config file
    this.baseUrl = SOLVER_API_URL;
  }

  /**
   * Execute a complete swap
   */
  async executeSwap(swapRequest: SwapRequest): Promise<SwapResult> {
    try {
      const response = await fetch(`${this.baseUrl}/swaps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(swapRequest),
      });

      const result: ApiResponse<SwapResult> = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to execute swap');
      }

      return result.data!;
    } catch (error) {
      console.error('Error executing swap:', error);
      throw error;
    }
  }

  /**
   * Get swap status by ID
   */
  async getSwapStatus(swapId: string): Promise<SwapOrder> {
    try {
      const response = await fetch(`${this.baseUrl}/swaps/${swapId}`);
      const result: ApiResponse<SwapOrder> = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to get swap status');
      }

      return result.data!;
    } catch (error) {
      console.error('Error getting swap status:', error);
      throw error;
    }
  }

  /**
   * Cancel a swap
   */
  async cancelSwap(swapId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/swaps/${swapId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result: ApiResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel swap');
      }
    } catch (error) {
      console.error('Error cancelling swap:', error);
      throw error;
    }
  }

  /**
   * Get all swaps
   */
  async getAllSwaps(): Promise<SwapOrder[]> {
    try {
      const response = await fetch(`${this.baseUrl}/swaps`);
      const result: ApiResponse<SwapOrder[]> = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to get swaps');
      }

      return result.data!;
    } catch (error) {
      console.error('Error getting swaps:', error);
      throw error;
    }
  }

  /**
   * Get solver state
   */
  async getSolverState(): Promise<SolverState> {
    try {
      const response = await fetch(`${this.baseUrl}/state`);
      const result: ApiResponse<SolverState> = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to get solver state');
      }

      return result.data!;
    } catch (error) {
      console.error('Error getting solver state:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<unknown> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      const result: ApiResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Health check failed');
      }

      return result.data;
    } catch (error) {
      console.error('Error during health check:', error);
      throw error;
    }
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectWebSocket(callbacks?: {
    onSwapUpdate?: (event: SwapUpdateEvent) => void;
    onSwapCompleted?: (event: SwapCompletedEvent) => void;
    onSwapCancelled?: (event: SwapCancelledEvent) => void;
    onSwapInitiated?: (event: SwapInitiatedEvent) => void;
    onError?: (error: SolverErrorEvent) => void;
  }): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(this.baseUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Connected to solver WebSocket');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from solver WebSocket');
    });

    if (callbacks?.onSwapUpdate) {
      this.socket.on('swapUpdate', callbacks.onSwapUpdate);
    }

    if (callbacks?.onSwapCompleted) {
      this.socket.on('swapCompleted', callbacks.onSwapCompleted);
    }

    if (callbacks?.onSwapCancelled) {
      this.socket.on('swapCancelled', callbacks.onSwapCancelled);
    }

    if (callbacks?.onSwapInitiated) {
      this.socket.on('swapInitiated', callbacks.onSwapInitiated);
    }

    if (callbacks?.onError) {
      this.socket.on('solverError', callbacks.onError);
    }

    return this.socket;
  }

  /**
   * Subscribe to specific swap updates
   */
  subscribeToSwap(swapId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('subscribeToSwap', swapId);
    }
  }

  /**
   * Unsubscribe from specific swap updates
   */
  unsubscribeFromSwap(swapId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribeFromSwap', swapId);
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Export singleton instance
export const solverService = new SolverService();
export default solverService;