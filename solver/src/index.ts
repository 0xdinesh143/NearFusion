import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { ShadeAgentSolver } from './core/ShadeAgentSolver';
import { SwapService } from './services/SwapService';
import { EVMEscrowService } from './services/EVMEscrowService';
import { NearEscrowService } from './services/NearEscrowService';
import { TEESecurityService } from './services/TEESecurityService';

import { 
  SolverConfig, 
  SwapRequest,
  SwapQuoteRequest,
  ApiResponse,
  SwapResult,
  SwapOrder
} from './types';



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
        blockExplorerUrl: 'https://testnet.nearblocks.io/'
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

  };

  return config;
}

/**
 * Initialize all services
 */
async function initializeServices(config: SolverConfig) {
  console.log('Initializing services...');

  // Initialize TEE service
  const teeService = new TEESecurityService(config.tee);

  // Initialize EVM escrow service
  const evmEscrowService = new EVMEscrowService(
    config.networks,
    config.evm.privateKey
  );

  // Initialize NEAR escrow service
  const nearEscrowService = new NearEscrowService(
    config.near.networkId,
    config.near.accountId,
    config.near.privateKey,
    config.near.rpcUrl,
    config.near.factoryContractId
  );



  // Initialize swap service
  const swapService = new SwapService(
    config.swap,
    evmEscrowService,
    nearEscrowService
  );

  return {
    teeService,
    evmEscrowService,
    nearEscrowService,
    swapService
  };
}

/**
 * Setup WebSocket event broadcasting
 */
function setupWebSocketEvents(solver: ShadeAgentSolver, io: SocketIOServer): void {
  // Handle WebSocket connections
  io.on('connection', (socket) => {
    console.log(`Client connected to WebSocket: ${socket.id}`);

    // Send current solver state on connection
    socket.emit('solverState', solver.getState());

    // Handle client disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected from WebSocket: ${socket.id}`);
    });

    // Handle client subscribing to specific swap events
    socket.on('subscribeToSwap', (swapId: string) => {
      socket.join(`swap:${swapId}`);
      console.log(`Client ${socket.id} subscribed to swap: ${swapId}`);
    });

    // Handle client unsubscribing from swap events
    socket.on('unsubscribeFromSwap', (swapId: string) => {
      socket.leave(`swap:${swapId}`);
      console.log(`Client ${socket.id} unsubscribed from swap: ${swapId}`);
    });
  });

  // Broadcast swap events to all connected clients
  solver.on('swapCompleted', (result: SwapResult) => {
    console.log(`Broadcasting swap completed event for swap: ${result.swapId}`);
    
    // Broadcast to all clients
    io.emit('swapCompleted', {
      type: 'swapCompleted',
      data: result,
      timestamp: new Date()
    });

    // Broadcast to specific swap subscribers
    io.to(`swap:${result.swapId}`).emit('swapUpdate', {
      type: 'completed',
      swapId: result.swapId,
      data: result,
      timestamp: new Date()
    });
  });

  solver.on('swapCancelled', (data: { swapId: string }) => {
    console.log(`Broadcasting swap cancelled event for swap: ${data.swapId}`);
    
    // Broadcast to all clients
    io.emit('swapCancelled', {
      type: 'swapCancelled',
      data,
      timestamp: new Date()
    });

    // Broadcast to specific swap subscribers
    io.to(`swap:${data.swapId}`).emit('swapUpdate', {
      type: 'cancelled',
      swapId: data.swapId,
      data,
      timestamp: new Date()
    });
  });

  solver.on('swapStatusChanged', (swap: SwapOrder) => {
    console.log(`Broadcasting swap status changed for swap ${swap.id}: ${swap.status}`);
    
    // Broadcast to specific swap subscribers
    io.to(`swap:${swap.id}`).emit('swapUpdate', {
      type: 'statusChanged',
      swapId: swap.id,
      data: swap,
      timestamp: new Date()
    });
  });

  solver.on('error', (error: Error) => {
    console.error(`Broadcasting solver error: ${error.message}`);
    
    // Broadcast error to all clients
    io.emit('solverError', {
      type: 'error',
      error: error.message,
      timestamp: new Date()
    });
  });
}

/**
 * Setup API server with endpoints for frontend integration
 */
function setupApiServer(solver: ShadeAgentSolver, config: SolverConfig, io: SocketIOServer): express.Application {
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
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // Setup WebSocket event broadcasting
  setupWebSocketEvents(solver, io);

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
      console.error('Failed to get state:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to get solver state',
        timestamp: new Date()
      };
      res.status(500).json(response);
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
      console.error('Failed to get metrics:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to get solver metrics',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });


  // Execute complete swap (unified endpoint)
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

      const result = await solver.executeCompleteSwap(swapRequest);
      const response: ApiResponse = {
        success: true,
        data: result,
        timestamp: new Date()
      };
      res.status(201).json(response);
    } catch (error) {
      console.error('Failed to execute complete swap:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute swap',
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
      console.error('Failed to get swaps:', error);
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
      console.error(`Failed to get swap ${req.params.id}:`, error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to get swap',
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
      console.error(`Failed to cancel swap ${req.params.id}:`, error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel swap',
        timestamp: new Date()
      };
      res.status(500).json(response);
    }
  });

  // Error handling middleware
  app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`Unhandled API error at ${req.method} ${req.path}:`, error);
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

  // Health check endpoint
  app.get('/health', (req, res) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date(),
        services: {
          solver: solver.getState().isRunning,
          websocket: io.engine.clientsCount !== undefined
        },
        websocket: {
          connectedClients: io.engine.clientsCount
        }
      };
      
      res.json({
        success: true,
        data: health,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Health check failed',
        timestamp: new Date()
      });
    }
  });

  return app;
}

/**
 * Main application function
 */
async function main() {
  try {
    console.log('Starting NearFusion Shade Agent Solver Backend...');

    // Load configuration
    const config = loadConfiguration();
    console.log('Configuration loaded');

    // Initialize services
    const services = await initializeServices(config);
    console.log('Services initialized');

    // Create solver instance
    const solver = new ShadeAgentSolver(
      services.swapService,
      services.teeService
    );

    // Create HTTP server for Socket.IO
    const httpServer = createServer();
    
    // Setup Socket.IO server
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.server.cors.origins,
        credentials: true
      }
    });

    // Setup API server
    const app = setupApiServer(solver, config, io);
    
    // Attach Express app to HTTP server
    httpServer.on('request', app);

    // Start solver
    await solver.start();
    console.log('Solver started');

    // Start HTTP server with WebSocket support
    httpServer.listen(config.server.port, () => {
      console.log(`NearFusion Solver API server running on port ${config.server.port}`);
      console.log(`WebSocket server running on ws://localhost:${config.server.port}`);
      console.log(`Health check: http://localhost:${config.server.port}/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
    
      // httpServer.close(async () => {
      //   try {
      //     await solver.stop();
      //     console.log('Graceful shutdown completed');
      //     process.exit(0);
      //   } catch (error) {
      //     console.error('Error during shutdown:', error);
      //     process.exit(1);
      //   }
      // });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main();
}

export { main };