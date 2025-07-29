import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/Logger';

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

export interface TokenPrice {
  address: string;
  symbol: string;
  price: number;
  chain: string;
  lastUpdated: Date;
}

export interface QuoteServiceConfig {
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
}

/**
 * Service for calculating cross-chain swap quotes and managing token prices
 */
export class QuoteService extends EventEmitter {
  private priceCache: Map<string, TokenPrice> = new Map();
  private apiClients: Map<string, AxiosInstance> = new Map();
  private priceUpdateInterval?: NodeJS.Timeout;
  private isInitialized: boolean = false;

  // Chain to price feed mapping
  private chainTokenMap = {
    'base-sepolia': 'base',
    near: 'near'
  };

  // Token price ID mapping for CoinGecko/DefiLlama
  private tokenPriceIds: Record<string, string> = {
    // Base Sepolia tokens (use mainnet equivalents for pricing)
    'base-sepolia:0x0000000000000000000000000000000000000000': 'ethereum',
    'base-sepolia:0x036CbD53842c5426634e7929541eC2318f3dCF7e': 'usd-coin',
    'base-sepolia:0x4200000000000000000000000000000000000006': 'ethereum',
    // NEAR tokens
    'near:wrap.near': 'near',
    'near:usdc.fakes.testnet': 'usd-coin',
    'near:usdt.fakes.testnet': 'tether'
  };

  // Average transaction costs in USD (estimated)
  private avgTransactionCosts = {
    'base-sepolia': 0.01, // Base has lower fees, testnet even lower
    near: 0.001 // NEAR has very low transaction costs
  };

  constructor(
    private config: QuoteServiceConfig,
    private logger: Logger
  ) {
    super();
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing QuoteService...');
      
      // Initialize API clients
      this.initializeApiClients();
      
      // Load initial prices
      await this.updateAllPrices();
      
      // Start price monitoring
      this.startPriceMonitoring();
      
      this.isInitialized = true;
      this.logger.info('QuoteService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize QuoteService', { error });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down QuoteService...');
    
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
    }
    
    this.logger.info('QuoteService shutdown complete');
  }

  /**
   * Get quote for a cross-chain swap
   */
  async getQuote(request: SwapQuoteRequest): Promise<SwapQuote> {
    if (!this.isInitialized) {
      throw new Error('QuoteService not initialized');
    }

    this.logger.debug('Getting quote', { request });

    try {
      // Get token prices
      const sourcePrice = await this.getTokenPrice(request.sourceToken, request.sourceChain);
      const destinationPrice = await this.getTokenPrice(request.destinationToken, request.destinationChain);

      if (!sourcePrice || !destinationPrice) {
        throw new Error('Unable to fetch token prices');
      }

      // Calculate base amounts
      const sourceAmount = parseFloat(request.amount);
      const sourceValueUSD = sourceAmount * sourcePrice.price;
      const estimatedRate = sourcePrice.price / destinationPrice.price;
      const baseDestinationAmount = sourceAmount * estimatedRate;

      // Calculate fees
      const baseFee = sourceValueUSD * (this.config.baseFeePercentage / 100);
      const gasCost = await this.estimateGasCosts(request);
      const totalFeesUSD = baseFee + gasCost;
      const totalFeesInDestToken = totalFeesUSD / destinationPrice.price;

      // Calculate final amounts
      const destinationAmount = baseDestinationAmount - totalFeesInDestToken;
      const slippageTolerance = request.slippageTolerance || this.config.slippageTolerance;
      const minimumReceived = destinationAmount * (1 - slippageTolerance / 100);

      // Calculate price impact (simplified)
      const priceImpact = this.calculatePriceImpact(sourceAmount, sourcePrice.price);

      // Generate route (simplified for cross-chain)
      const route = this.generateRoute(request);

      const quote: SwapQuote = {
        sourceAmount: sourceAmount.toString(),
        destinationAmount: destinationAmount.toString(),
        estimatedRate: estimatedRate.toString(),
        minimumReceived: minimumReceived.toString(),
        priceImpact: priceImpact.toString(),
        gasCost: gasCost.toString(),
        totalFees: totalFeesUSD.toString(),
        route,
        validUntil: new Date(Date.now() + 5 * 60 * 1000) // Valid for 5 minutes
      };

      this.logger.debug('Quote generated', { quote });
      return quote;
    } catch (error) {
      this.logger.error('Failed to generate quote', { error, request });
      throw error;
    }
  }

  /**
   * Get current token price
   */
  async getTokenPrice(tokenAddress: string, chain: string): Promise<TokenPrice | null> {
    const cacheKey = `${chain}:${tokenAddress.toLowerCase()}`;
    const cached = this.priceCache.get(cacheKey);

    // Return cached price if recent (less than 1 minute old)
    if (cached && Date.now() - cached.lastUpdated.getTime() < 60000) {
      return cached;
    }

    try {
      const price = await this.fetchTokenPrice(tokenAddress, chain);
      if (price) {
        this.priceCache.set(cacheKey, price);
      }
      return price;
    } catch (error) {
      this.logger.error('Failed to fetch token price', { error, tokenAddress, chain });
      return cached || null; // Return cached if available, otherwise null
    }
  }

  /**
   * Get multiple token prices
   */
  async getTokenPrices(tokens: Array<{ address: string; chain: string }>): Promise<TokenPrice[]> {
    const prices = await Promise.allSettled(
      tokens.map(token => this.getTokenPrice(token.address, token.chain))
    );

    return prices
      .filter((result): result is PromiseFulfilledResult<TokenPrice> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);
  }

  /**
   * Get supported tokens for a chain
   */
  getSupportedTokens(chain: string): string[] {
    // Return commonly supported tokens for each chain
    const supportedTokens: Record<string, string[]> = {
      'base-sepolia': [
        '0x0000000000000000000000000000000000000000', // ETH
        '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC (Base Sepolia testnet)
        '0x4200000000000000000000000000000000000006', // WETH (Base Sepolia)
      ],
      near: [
        'wrap.near', // wNEAR
        'usdc.fakes.testnet', // USDC (testnet)
        'usdt.fakes.testnet', // USDT (testnet)
      ]
    };

    return supportedTokens[chain] || [];
  }

  private initializeApiClients(): void {
    // Initialize CoinGecko client
    if (this.config.priceFeeds.coingecko) {
      const coingeckoClient = axios.create({
        baseURL: this.config.priceFeeds.coingecko.apiUrl,
        timeout: 10000,
        headers: this.config.priceFeeds.coingecko.apiKey ? {
          'X-CG-Pro-API-Key': this.config.priceFeeds.coingecko.apiKey
        } : {}
      });
      this.apiClients.set('coingecko', coingeckoClient);
    }

    // Initialize DefiLlama client
    if (this.config.priceFeeds.defillama) {
      const defillamaClient = axios.create({
        baseURL: this.config.priceFeeds.defillama.apiUrl,
        timeout: 10000
      });
      this.apiClients.set('defillama', defillamaClient);
    }

    // Initialize custom client
    if (this.config.priceFeeds.custom) {
      const customClient = axios.create({
        baseURL: this.config.priceFeeds.custom.apiUrl,
        timeout: 10000,
        headers: this.config.priceFeeds.custom.apiKey ? {
          'Authorization': `Bearer ${this.config.priceFeeds.custom.apiKey}`
        } : {}
      });
      this.apiClients.set('custom', customClient);
    }
  }

  private async fetchTokenPrice(tokenAddress: string, chain: string): Promise<TokenPrice | null> {
    // Try different price sources in order of preference
    const sources = ['defillama', 'coingecko', 'custom'];

    for (const source of sources) {
      try {
        const price = await this.fetchFromSource(source, tokenAddress, chain);
        if (price) return price;
      } catch (error) {
        this.logger.debug(`Failed to fetch price from ${source}`, { error, tokenAddress, chain });
      }
    }

    return null;
  }

  private async fetchFromSource(source: string, tokenAddress: string, chain: string): Promise<TokenPrice | null> {
    const client = this.apiClients.get(source);
    if (!client) return null;

    switch (source) {
      case 'defillama':
        return this.fetchFromDefiLlama(client, tokenAddress, chain);
      case 'coingecko':
        return this.fetchFromCoinGecko(client, tokenAddress, chain);
      case 'custom':
        return this.fetchFromCustom(client, tokenAddress, chain);
      default:
        return null;
    }
  }

  private async fetchFromDefiLlama(client: AxiosInstance, tokenAddress: string, chain: string): Promise<TokenPrice | null> {
    try {
      const chainMapping: Record<string, string> = {
        'base-sepolia': 'base',
        near: 'near'
      };

      const mappedChain = chainMapping[chain];
      if (!mappedChain) return null;

      const address = tokenAddress === '0x0000000000000000000000000000000000000000' 
        ? `${mappedChain}:0x0000000000000000000000000000000000000000`
        : `${mappedChain}:${tokenAddress}`;

      const response = await client.get(`/prices/current/${address}`);
      const priceData = response.data.coins[address];

      if (!priceData) return null;

      return {
        address: tokenAddress,
        symbol: priceData.symbol || 'UNKNOWN',
        price: priceData.price,
        chain,
        lastUpdated: new Date()
      };
    } catch (error) {
      this.logger.debug('DefiLlama price fetch failed', { error });
      return null;
    }
  }

  private async fetchFromCoinGecko(client: AxiosInstance, tokenAddress: string, chain: string): Promise<TokenPrice | null> {
    try {
      // This is a simplified implementation
      // In practice, you'd need to map token addresses to CoinGecko IDs
      const response = await client.get('/simple/price', {
        params: {
          ids: this.mapTokenToCoinGeckoId(tokenAddress, chain),
          vs_currencies: 'usd'
        }
      });

      const coinId = this.mapTokenToCoinGeckoId(tokenAddress, chain);
      const priceData = response.data[coinId];

      if (!priceData) return null;

      return {
        address: tokenAddress,
        symbol: 'UNKNOWN', // Would need additional call to get symbol
        price: priceData.usd,
        chain,
        lastUpdated: new Date()
      };
    } catch (error) {
      this.logger.debug('CoinGecko price fetch failed', { error });
      return null;
    }
  }

  private async fetchFromCustom(client: AxiosInstance, tokenAddress: string, chain: string): Promise<TokenPrice | null> {
    try {
      const response = await client.get('/price', {
        params: {
          token: tokenAddress,
          chain
        }
      });

      return {
        address: tokenAddress,
        symbol: response.data.symbol || 'UNKNOWN',
        price: response.data.price,
        chain,
        lastUpdated: new Date()
      };
    } catch (error) {
      this.logger.debug('Custom price fetch failed', { error });
      return null;
    }
  }

  private mapTokenToCoinGeckoId(tokenAddress: string, chain: string): string {
    // Simplified mapping - in practice you'd maintain a comprehensive mapping
    const mappings: Record<string, string> = {
      'ethereum:0x0000000000000000000000000000000000000000': 'ethereum',
      'polygon:0x0000000000000000000000000000000000001010': 'matic-network',
      'bsc:0x0000000000000000000000000000000000000000': 'binancecoin',
      'arbitrum:0x0000000000000000000000000000000000000000': 'ethereum',
      'near:wrap.near': 'near'
    };

    return mappings[`${chain}:${tokenAddress}`] || 'unknown';
  }

  private async estimateGasCosts(request: SwapQuoteRequest): Promise<number> {
    // Simplified gas estimation
    const gasCosts: Record<string, number> = {
      'base-sepolia': 2, // Base has lower fees than Ethereum
      near: 0.01     // NEAR has very low transaction costs
    };

    const sourceGas = gasCosts[request.sourceChain] || 10;
    const destGas = gasCosts[request.destinationChain] || 10;

    return sourceGas + destGas;
  }

  private calculatePriceImpact(amount: number, price: number): number {
    // Simplified price impact calculation
    const volumeUSD = amount * price;
    
    if (volumeUSD < 1000) return 0.1;      // 0.1% for small trades
    if (volumeUSD < 10000) return 0.3;     // 0.3% for medium trades
    if (volumeUSD < 100000) return 0.5;    // 0.5% for large trades
    return 1.0;                            // 1.0% for very large trades
  }

  private generateRoute(request: SwapQuoteRequest): SwapRoute[] {
    return [
      {
        chain: request.sourceChain,
        protocol: 'NearFusion',
        token: request.sourceToken,
        percentage: 50
      },
      {
        chain: request.destinationChain,
        protocol: 'NearFusion',
        token: request.destinationToken,
        percentage: 50
      }
    ];
  }

  private startPriceMonitoring(): void {
    this.priceUpdateInterval = setInterval(async () => {
      try {
        await this.updateAllPrices();
      } catch (error) {
        this.logger.error('Price update failed', { error });
      }
    }, this.config.updateInterval);
  }

  private async updateAllPrices(): Promise<void> {
    this.logger.debug('Updating all token prices...');
    
    // Get all unique tokens from cache and supported tokens
    const tokensToUpdate = new Set<string>();
    
    // Add cached tokens that need updating
    for (const [key, price] of this.priceCache.entries()) {
      if (Date.now() - price.lastUpdated.getTime() > this.config.updateInterval) {
        tokensToUpdate.add(key);
      }
    }

    // Add commonly traded tokens
    const commonTokens = [
      'ethereum:0x0000000000000000000000000000000000000000',
      'polygon:0x0000000000000000000000000000000000001010',
      'bsc:0x0000000000000000000000000000000000000000',
      'arbitrum:0x0000000000000000000000000000000000000000',
      'near:wrap.near'
    ];

    commonTokens.forEach(token => tokensToUpdate.add(token));

    // Update prices in batches
    const updatePromises = Array.from(tokensToUpdate).map(async (key) => {
      const [chain, address] = key.split(':');
      try {
        await this.getTokenPrice(address, chain);
      } catch (error) {
        this.logger.debug('Failed to update price for token', { key, error });
      }
    });

    await Promise.allSettled(updatePromises);
    this.logger.debug(`Updated prices for ${tokensToUpdate.size} tokens`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized) return false;
      
      // Test with Base Sepolia ETH
      const testPrice = await this.getTokenPrice('0x0000000000000000000000000000000000000000', 'base-sepolia');
      return testPrice !== null;
    } catch (error) {
      this.logger.error('QuoteService health check failed', { error });
      return false;
    }
  }

  private getNativeTokens(): string[] {
    return [
      'base-sepolia:0x0000000000000000000000000000000000000000' // Base Sepolia ETH
    ];
  }
}