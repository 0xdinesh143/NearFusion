#!/usr/bin/env node

/**
 * CrossFusion Solver Integration Test
 * 
 * Tests the basic functionality of the solver endpoints
 * with Base Sepolia and NEAR testnet integration.
 */

const axios = require('axios');

const SOLVER_URL = process.env.SOLVER_URL || 'http://localhost:3000';

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  baseURL: SOLVER_URL
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEndpoint(name, endpoint, method = 'GET', data = null) {
  try {
    log(`\n🧪 Testing ${name}...`, 'blue');
    
    const config = {
      method,
      url: endpoint,
      timeout: TEST_CONFIG.timeout,
      validateStatus: () => true // Don't throw on HTTP errors
    };

    if (data) {
      config.data = data;
      config.headers = { 'Content-Type': 'application/json' };
    }

    const response = await axios(config);
    
    if (response.status >= 200 && response.status < 300) {
      log(`✅ ${name}: ${response.status} - ${JSON.stringify(response.data, null, 2)}`, 'green');
      return { success: true, data: response.data };
    } else {
      log(`❌ ${name}: ${response.status} - ${response.statusText}`, 'red');
      log(`   Response: ${JSON.stringify(response.data, null, 2)}`, 'red');
      return { success: false, error: response.statusText, data: response.data };
    }
  } catch (error) {
    log(`❌ ${name}: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function runTests() {
  log('🚀 Starting CrossFusion Solver Integration Tests', 'cyan');
  log(`📡 Testing against: ${SOLVER_URL}`, 'yellow');

  const results = [];

  // Test 1: Health Check
  const health = await testEndpoint('Health Check', `${SOLVER_URL}/health`);
  results.push(health);

  // Test 2: Get State
  const state = await testEndpoint('Get Solver State', `${SOLVER_URL}/state`);
  results.push(state);

  // Test 3: Get Metrics
  const metrics = await testEndpoint('Get Solver Metrics', `${SOLVER_URL}/metrics`);
  results.push(metrics);

  // Test 4: Get Supported Tokens (Base Sepolia)
  const tokens = await testEndpoint('Get Base Sepolia Tokens', `${SOLVER_URL}/chains/base-sepolia/tokens`);
  results.push(tokens);

  // Test 5: Get Logs
  const logs = await testEndpoint('Get Logs', `${SOLVER_URL}/logs?limit=10`);
  results.push(logs);

  // Test 6: Quote Request (will likely fail without proper setup, but tests endpoint)
  const quoteData = {
    sourceChain: 'near',
    destinationChain: 'base-sepolia',
    sourceToken: 'wrap.near',
    destinationToken: '0x0000000000000000000000000000000000000000', // ETH
    amount: '1000000000000000000000000' // 1 NEAR
  };
  const quote = await testEndpoint('Get Quote', `${SOLVER_URL}/quote`, 'POST', quoteData);
  results.push(quote);

  // Summary
  log('\n📊 Test Results Summary', 'cyan');
  log('═'.repeat(50), 'cyan');
  
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  log(`✅ Successful: ${successCount}/${totalCount}`, successCount === totalCount ? 'green' : 'yellow');
  log(`❌ Failed: ${totalCount - successCount}/${totalCount}`, totalCount - successCount === 0 ? 'green' : 'red');

  if (successCount === totalCount) {
    log('\n🎉 All tests passed! Solver is ready for testnet usage.', 'green');
  } else {
    log('\n⚠️  Some tests failed. Check configuration and contract deployment.', 'yellow');
  }

  log('\n📝 Next Steps:', 'blue');
  log('1. Deploy EVM contracts to Base Sepolia testnet', 'yellow');
  log('2. Deploy NEAR contracts to testnet', 'yellow');
  log('3. Update BASE_SEPOLIA_ESCROW_FACTORY and NEAR_ESCROW_FACTORY in .env', 'yellow');
  log('4. Add your private keys and API keys to .env', 'yellow');
  log('5. Test actual swap operations', 'yellow');

  process.exit(successCount === totalCount ? 0 : 1);
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  log(`❌ Unhandled Rejection: ${reason}`, 'red');
  process.exit(1);
});

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    log(`❌ Test execution failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { runTests, testEndpoint };