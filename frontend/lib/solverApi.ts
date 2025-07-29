import { SOLVER_API_URL } from '../config'

// Types
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
  validUntil: Date;
}

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
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

class SolverApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = SOLVER_API_URL) {
    this.baseUrl = baseUrl;
  }

  private async makeRequest<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Health check
  async getHealth(): Promise<ApiResponse> {
    return this.makeRequest('/health');
  }

  // Get solver state
  async getState(): Promise<ApiResponse> {
    return this.makeRequest('/state');
  }

  // Get swap quote
  async getQuote(request: SwapQuoteRequest): Promise<ApiResponse<SwapQuote>> {
    return this.makeRequest('/quote', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Create swap
  async createSwap(request: SwapRequest): Promise<ApiResponse<SwapOrder>> {
    return this.makeRequest('/swaps', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Get all swaps
  async getSwaps(): Promise<ApiResponse<SwapOrder[]>> {
    return this.makeRequest('/swaps');
  }

  // Get specific swap
  async getSwap(id: string): Promise<ApiResponse<SwapOrder>> {
    return this.makeRequest(`/swaps/${id}`);
  }

  // Execute first leg
  async executeFirstLeg(swapId: string): Promise<ApiResponse<{ escrowAddress: string }>> {
    return this.makeRequest(`/swaps/${swapId}/first-leg`, {
      method: 'POST',
    });
  }

  // Execute second leg  
  async executeSecondLeg(swapId: string): Promise<ApiResponse<{ escrowAddress: string }>> {
    return this.makeRequest(`/swaps/${swapId}/second-leg`, {
      method: 'POST',
    });
  }

  // Complete swap
  async completeSwap(swapId: string, secret: string): Promise<ApiResponse> {
    return this.makeRequest(`/swaps/${swapId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ secret }),
    });
  }

  // Cancel swap
  async cancelSwap(swapId: string): Promise<ApiResponse> {
    return this.makeRequest(`/swaps/${swapId}/cancel`, {
      method: 'POST',
    });
  }

  // Get supported tokens for a chain
  async getSupportedTokens(chainId: string): Promise<ApiResponse<string[]>> {
    return this.makeRequest(`/chains/${chainId}/tokens`);
  }

  // Get logs
  async getLogs(limit: number = 100): Promise<ApiResponse<any[]>> {
    return this.makeRequest(`/logs?limit=${limit}`);
  }
}

export const solverApi = new SolverApiClient();
export default solverApi;