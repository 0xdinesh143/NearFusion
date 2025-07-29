import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ShadeAgentSolver } from './core/ShadeAgentSolver';
import { SwapService, SwapServiceConfig } from './services/SwapService';
import { QuoteService, QuoteServiceConfig } from './services/QuoteService';
import { EVMEscrowService } from './services/EVMEscrowService';
import { NearEscrowService } from './services/NearEscrowService';
import { TEESecurityService, TEEConfig } from './services/TEESecurityService';
import { Logger, LogLevel } from './utils/Logger';
import { 
  SolverConfig, 
  NetworkConfig, 
  ChainId, 
  SwapRequest,
  SwapQuoteRequest,
  ApiResponse
} from './types';

// Initialize logger
const logger = new Logger('Main', process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO);

/**
 * Load configuration from environment variables
 */
function loadConfiguration(): SolverConfig {
  const config: SolverConfig = {
    networks: {
      'base-sepolia': {
        rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
        chainId: 84532,
        name: 'Base Sepolia',
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18
        },
        blockExplorerUrl: 'https://sepolia-explorer.base.org',
        escrowFactoryAddress: process.env.BASE_SEPOLIA_ESCROW_FACTORY
      },
      near: {
        rpcUrl: process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org',
        chainId: 0, // NEAR doesn't use numeric chain IDs
        name: 'NEAR Protocol Testnet',
        nativeCurrency: {
          name: 'NEAR',
          symbol: 'NEAR',
          decimals: 24
        },
        blockExplorerUrl: 'https://explorer.testnet.near.org'
      }
    },
    near: {
      networkId: process.env.NEAR_NETWORK_ID || 'testnet',
      accountId: process.env.NEAR_ACCOUNT_ID || '',
      privateKey: process.env.NEAR_PRIVATE_KEY || '',
      rpcUrl: process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org',
      factoryContractId: process.env.NEAR_ESCROW_FACTORY || 'crossfusion-factory.testnet'
    },
    evm: {
      privateKey: process.env.EVM_PRIVATE_KEY || ''
    },
    quote: {
      priceFeeds: {
        defillama: {
          apiUrl: 'https://coins.llama.fi'
        },
        coingecko: {
          apiUrl: 'https://api.coingecko.com/api/v3',
          apiKey: process.env.COINGECKO_API_KEY
        }
      },
      updateInterval: 60000, // 1 minute
      slippageTolerance: 1.0, // 1%
      baseFeePercentage: 0.3 // 0.3%
    },
    swap: {
      defaultTimelock: 3600, // 1 hour
      maxSwapAmount: '1000000', // $1M
      minSwapAmount: '10', // $10
      swapFeePercentage: 0.25 // 0.25%
    },
    tee: {
      attestationUrl: process.env.TEE_ATTESTATION_URL || 'https://attestation.phala.network',
      apiKey: process.env.PHALA_CLOUD_API_KEY,
      environment: (process.env.NODE_ENV === 'production') ? 'production' : 'development'
    },
    server: {
      port: parseInt(process.env.SOLVER_PORT || '3000'),
      cors: {
        origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000']
      }
    },
    logging: {
      level: (process.env.LOG_LEVEL as any) || 'info'
    }
  };

  return config;
}

/**
 * Initialize all services
 */
async function initializeServices(config: SolverConfig) {
  logger.info('Initializing services...');

  // Initialize TEE service
  const teeService = new TEESecurityService(config.tee, logger.child('TEE'));

  // Initialize EVM escrow service
  const evmEscrowService = new EVMEscrowService(
    config.networks,
    config.evm.privateKey,
    logger.child('EVMEscrow')
  );

  // Initialize NEAR escrow service
  const nearEscrowService = new NearEscrowService(
    config.near.networkId,
    config.near.accountId,
    config.near.privateKey,
    config.near.rpcUrl,
    config.near.factoryContractId,
    logger.child('NEAREscrow')
  );

  // Initialize quote service
  const quoteService = new QuoteService(
    config.quote,
    logger.child('Quote')
  );

  // Initialize swap service
  const swapService = new SwapService(
    config.swap,
    evmEscrowService,
    nearEscrowService,
    logger.child('Swap')
  );

  return {
    teeService,
    evmEscrowService,
    nearEscrowService,
    quoteService,
    swapService
  };
}

/**
 * Setup API server with endpoints for frontend integration
 */
function setupApiServer(solver: ShadeAgentSolver, quoteService: QuoteService, services: any, config: SolverConfig): express.Application {
  const app = express();

  // Middleware
  app.use(cors({
    origin: config.server.cors.origins,
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`, { 
      body: req.body, 
      query: req.query,
      ip: req.ip 
    });
    next();
  });

  // Get solver state
  app.get('/state', (req, res) => {
    try {
      const state = solver.getState();
      const response: ApiResponse = {
        success: true,
        data: state,
        timestamp: new Date()
      };
      res.json(response);
    } catch (error) {
      logger.error('Failed to get state', { error });
      const response: ApiResponse = {
        success: false,
        error: 'Failed to get solver state',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date(),
        services: {
          evm: await services.evmEscrowService.healthCheck(),
          near: await services.nearEscrowService.healthCheck(),
          quote: true, // QuoteService doesn't have async health check
          solver: solver.getState().isRunning
        },
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      };

      const allHealthy = Object.values(health.services).every(status => status === true);
      const statusCode = allHealthy ? 200 : 503;
      
      res.status(statusCode).json({
        success: allHealthy,
        data: health,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Health check failed', { error });
      res.status(503).json({
        success: false,
        error: 'Health check failed',
        timestamp: new Date()
      });
    }
  });

  // Get solver metrics
  app.get('/metrics', (req, res) => {
    try {
      const metrics = solver.getMetrics();
      const response: ApiResponse = {
        success: true,
        data: metrics,
        timestamp: new Date()
      };
      res.json(response);
    } catch (error) {
      logger.error('Failed to get metrics', { error });
      const response: ApiResponse = {
        success: false,
        error: 'Failed to get solver metrics',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Get swap quote
  app.post('/quote', async (req, res) => {
    try {
      const quoteRequest: SwapQuoteRequest = req.body;
      
      // Validate request
      if (!quoteRequest.sourceChain || !quoteRequest.destinationChain || 
          !quoteRequest.sourceToken || !quoteRequest.destinationToken || 
          !quoteRequest.amount) {
        const response: ApiResponse = {
          success: false,
          error: 'Missing required fields: sourceChain, destinationChain, sourceToken, destinationToken, amount',
          timestamp: new Date()
        };
        return res.status(400).json(response);
      }

      const quote = await quoteService.getQuote(quoteRequest);
      const response: ApiResponse = {
        success: true,
        data: quote,
        timestamp: new Date()
      };
      res.json(response);
    } catch (error) {
      logger.error('Failed to generate quote', { error, body: req.body });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate quote',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Create new swap
  app.post('/swaps', async (req, res) => {
    try {
      const swapRequest: SwapRequest = req.body;
      
      // Validate request
      if (!swapRequest.sourceChain || !swapRequest.destinationChain || 
          !swapRequest.sourceToken || !swapRequest.destinationToken || 
          !swapRequest.amount || !swapRequest.userAddress) {
        const response: ApiResponse = {
          success: false,
          error: 'Missing required fields',
          timestamp: new Date()
        };
        return res.status(400).json(response);
      }

      const swap = await solver.createSwap(swapRequest);
      const response: ApiResponse = {
        success: true,
        data: swap,
        timestamp: new Date()
      };
      res.status(201).json(response);
    } catch (error) {
      logger.error('Failed to create swap', { error, body: req.body });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create swap',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Get all swaps
  app.get('/swaps', (req, res) => {
    try {
      const swaps = solver.getAllSwaps();
      const response: ApiResponse = {
        success: true,
        data: swaps,
        timestamp: new Date()
      };
      res.json(response);
    } catch (error) {
      logger.error('Failed to get swaps', { error });
      const response: ApiResponse = {
        success: false,
        error: 'Failed to get swaps',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Get specific swap
  app.get('/swaps/:id', (req, res) => {
    try {
      const swap = solver.getSwap(req.params.id);
      if (!swap) {
        const response: ApiResponse = {
          success: false,
          error: 'Swap not found',
          timestamp: new Date()
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: swap,
        timestamp: new Date()
      };
      res.json(response);
    } catch (error) {
      logger.error('Failed to get swap', { error, swapId: req.params.id });
      const response: ApiResponse = {
        success: false,
        error: 'Failed to get swap',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Execute swap first leg
  app.post('/swaps/:id/first-leg', async (req, res) => {
    try {
      const escrowAddress = await solver.executeSwapFirstLeg(req.params.id);
      const response: ApiResponse = {
        success: true,
        data: { escrowAddress },
        timestamp: new Date()
      };
      res.json(response);
    } catch (error) {
      logger.error('Failed to execute first leg', { error, swapId: req.params.id });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute first leg',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Execute swap second leg
  app.post('/swaps/:id/second-leg', async (req, res) => {
    try {
      const escrowAddress = await solver.executeSwapSecondLeg(req.params.id);
      const response: ApiResponse = {
        success: true,
        data: { escrowAddress },
        timestamp: new Date()
      };
      res.json(response);
    } catch (error) {
      logger.error('Failed to execute second leg', { error, swapId: req.params.id });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute second leg',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Complete swap
  app.post('/swaps/:id/complete', async (req, res) => {
    try {
      const { secret } = req.body;
      if (!secret) {
        const response: ApiResponse = {
          success: false,
          error: 'Secret is required',
          timestamp: new Date()
        };
        return res.status(400).json(response);
      }

      const result = await solver.completeSwap(req.params.id, secret);
      const response: ApiResponse = {
        success: true,
        data: result,
        timestamp: new Date()
      };
      res.json(response);
    } catch (error) {
      logger.error('Failed to complete swap', { error, swapId: req.params.id });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete swap',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Cancel swap
  app.post('/swaps/:id/cancel', async (req, res) => {
    try {
      await solver.cancelSwap(req.params.id);
      const response: ApiResponse = {
        success: true,
        data: { message: 'Swap cancelled successfully' },
        timestamp: new Date()
      };
      res.json(response);
    } catch (error) {
      logger.error('Failed to cancel swap', { error, swapId: req.params.id });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel swap',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Get supported tokens for a chain
  app.get('/chains/:chainId/tokens', (req, res) => {
    try {
      const tokens = quoteService.getSupportedTokens(req.params.chainId);
      const response: ApiResponse = {
        success: true,
        data: tokens,
        timestamp: new Date()
      };
      res.json(response);
    } catch (error) {
      logger.error('Failed to get supported tokens', { error, chainId: req.params.chainId });
      const response: ApiResponse = {
        success: false,
        error: 'Failed to get supported tokens',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Get logs
  app.get('/logs', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = logger.getHistory().slice(-limit);
      const response: ApiResponse = {
        success: true,
        data: logs,
        timestamp: new Date()
      };
      res.json(response);
    } catch (error) {
      logger.error('Failed to get logs', { error });
      const response: ApiResponse = {
        success: false,
        error: 'Failed to get logs',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Error handling middleware
  app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled API error', { error, path: req.path, method: req.method });
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      timestamp: new Date()
    };
    res.status(500).json(response);
  });

  // 404 handler
  app.use((req, res) => {
    const response: ApiResponse = {
      success: false,
      error: 'Endpoint not found',
      timestamp: new Date()
    };
    res.status(404).json(response);
  });

  return app;
}

/**
 * Main application function
 */
async function main() {
  try {
    logger.info('Starting NearFusion Shade Agent Solver Backend...');

    // Load configuration
    const config = loadConfiguration();
    logger.info('Configuration loaded');

    // Initialize services
    const services = await initializeServices(config);
    logger.info('Services initialized');

    // Create solver instance
    const solver = new ShadeAgentSolver(
      config,
      services.swapService,
      services.quoteService,
      services.evmEscrowService,
      services.nearEscrowService,
      services.teeService,
      logger.child('Solver')
    );

    // Setup API server
    const app = setupApiServer(solver, services.quoteService, services, config);

    // Start solver
    await solver.start();
    logger.info('Solver started');

    // Start HTTP server
    const server = app.listen(config.server.port, () => {
      logger.info(`NearFusion Solver API server running on port ${config.server.port}`);
      logger.info(`Health check: http://localhost:${config.server.port}/health`);
    });

    // Setup event listeners
    solver.on('swapCreated', (swap) => {
      logger.info('Swap created', { swapId: swap.id });
    });

    solver.on('swapCompleted', (result) => {
      logger.info('Swap completed', { swapId: result.swapId });
    });

    solver.on('error', (error) => {
      logger.error('Solver error', { error });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      server.close(async () => {
        try {
          await solver.stop();
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start application', { error });
    process.exit(1);
  }
}

// Handle unhandled rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main();
}

export { main };