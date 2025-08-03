"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowUpDown, Loader, AlertCircle, CheckCircle, Clock } from "lucide-react";
import Link from "next/link";
import { Geist_Mono } from "next/font/google";
import Image from "next/image";
import { setupWalletSelector, WalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { useAppKit } from "@reown/appkit/react";
import { useAccount, useBalance } from "wagmi";
import { 
  solverService, 
  SwapOrder, 
  SwapStatus, 
  SwapRequest, 
  SwapUpdateEvent, 
  SwapCompletedEvent, 
  SwapCancelledEvent, 
  SolverErrorEvent 
} from "../lib/solverService";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Token addresses for price API
const TOKEN_ADDRESSES = {
  ETH: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  NEAR: "0x85f17cf997934a597031b2e18a9ab6ebd4b9f6a4"
};

interface TokenPrices {
  ETH: number;
  NEAR: number;
}

export default function SwapPage() {
  const { open } = useAppKit();
  const { isConnected: isETHConnected, address: ethAddress } = useAccount();
  const [isNEARConnected, setIsNEARConnected] = useState(false);
  const [nearAddress, setNearAddress] = useState<string>("");
  const [nearSelector, setNearSelector] = useState<WalletSelector | null>(null);
  
  // Balance tracking
  const [nearBalance, setNearBalance] = useState<string>("0");
  
  // Get ETH balance using wagmi
  const { data: ethBalanceData } = useBalance({
    address: ethAddress as `0x${string}`,
    query: {
      enabled: !!ethAddress && isETHConnected,
      refetchInterval: 30000, // Refetch every 30 seconds
    },
  });

  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromToken, setFromToken] = useState("ETH");
  const [toToken, setToToken] = useState("NEAR");
  const [tokenPrices, setTokenPrices] = useState<TokenPrices>({ ETH: 0, NEAR: 0 });

  // Swap execution state
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [currentSwap, setCurrentSwap] = useState<SwapOrder | null>(null);

  // Fetch token prices from our API route
  const fetchTokenPrices = async () => {
    try {
      const response = await fetch('/api/prices');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      setTokenPrices({
        ETH: data[TOKEN_ADDRESSES.ETH] || 0,
        NEAR: data[TOKEN_ADDRESSES.NEAR] || 0
      });
    } catch (error) {
      console.error('Error fetching token prices:', error);
      // Fallback to default prices if API fails
      setTokenPrices({ ETH: 0, NEAR: 0 });
    } 
  };

  // Fetch NEAR balance
  const fetchNearBalance = useCallback(async () => {
    if (!nearAddress || !isNEARConnected) {
      setNearBalance("0");
      return;
    }

    try {
      // Using NEAR RPC to get account balance
      const response = await fetch('https://rpc.testnet.near.org', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'dontcare',
          method: 'query',
          params: {
            request_type: 'view_account',
            finality: 'final',
            account_id: nearAddress,
          },
        }),
      });

      const data = await response.json();
      
      if (data.result) {
        // Convert yoctoNEAR to NEAR (1 NEAR = 10^24 yoctoNEAR)
        const balanceInYocto = data.result.amount;
        const balanceInNear = parseFloat(balanceInYocto) / 1e24;
        setNearBalance(balanceInNear.toFixed(6));
      } else {
        setNearBalance("0");
      }
    } catch (error) {
      console.error('Error fetching NEAR balance:', error);
      setNearBalance("0");
    }
  }, [nearAddress, isNEARConnected]);

  // Initialize NEAR wallet selector and check for existing connections
  useEffect(() => {
    const initializeNearWallet = async () => {
      try {
        const selector = await setupWalletSelector({
          network: "testnet",
          modules: [setupMeteorWallet(), setupHereWallet(), setupMyNearWallet()],
        });
        
        setNearSelector(selector);

        // Check if wallet is already connected
        const wallet = await selector.wallet();
        if (wallet) {
          const accounts = await wallet.getAccounts();
          if (accounts && accounts.length > 0) {
            setIsNEARConnected(true);
            setNearAddress(accounts[0].accountId);
          }
        }

        // Listen for wallet connection events
        selector.on("signedIn", (data) => {
          setIsNEARConnected(true);
          if (data.accounts && data.accounts.length > 0) {
            setNearAddress(data.accounts[0].accountId);
          }
        });

        selector.on("signedOut", () => {
          console.log("NEAR wallet disconnected");
          setIsNEARConnected(false);
          setNearAddress("");
          setNearBalance("0");
        });

      } catch (error) {
        console.error("Failed to initialize NEAR wallet:", error);
      }
    };

    initializeNearWallet();
  }, []);

  // Fetch NEAR balance when address changes
  useEffect(() => {
    if (nearAddress && isNEARConnected) {
      fetchNearBalance();
      // Refresh NEAR balance every 30 seconds
      const interval = setInterval(fetchNearBalance, 30000);
      return () => clearInterval(interval);
    } else {
      setNearBalance("0");
    }
  }, [nearAddress, isNEARConnected, fetchNearBalance]);

  // Fetch prices on component mount and setup WebSocket
  useEffect(() => {
    fetchTokenPrices();
    // Refresh prices every 30 seconds
    const interval = setInterval(fetchTokenPrices, 30000);

    // Setup WebSocket for real-time swap updates
    solverService.connectWebSocket({
      onSwapUpdate: (event: SwapUpdateEvent) => {
        console.log('Swap update:', event);
        if (currentSwap && event.swapId === currentSwap.id) {
          setCurrentSwap(event.data as SwapOrder);
        }
      },
      onSwapCompleted: (event: SwapCompletedEvent) => {
        console.log('Swap completed:', event);
        if (currentSwap && event.data.swapId === currentSwap.id) {
          setCurrentSwap((prev) => prev ? { ...prev, status: SwapStatus.COMPLETED } : null);
          setIsSwapping(false);
        }
      },
      onSwapCancelled: (event: SwapCancelledEvent) => {
        console.log('Swap cancelled:', event);
        if (currentSwap && event.data.swapId === currentSwap.id) {
          setCurrentSwap((prev) => prev ? { ...prev, status: SwapStatus.CANCELLED } : null);
          setIsSwapping(false);
        }
      },
      onError: (error: SolverErrorEvent) => {
        console.error('Solver error:', error);
        setSwapError(error.error || 'Unknown error occurred');
        setIsSwapping(false);
      }
    });

    return () => {
      clearInterval(interval);
      solverService.disconnectWebSocket();
    };
  }, [currentSwap]);

  // Helper function to normalize decimal input (handle both comma and dot)
  const normalizeDecimalInput = (value: string): string => {
    // Replace comma with dot for consistent parsing
    return value.replace(/,/g, '.');
  };

  // Helper function to parse amount safely
  const parseAmount = (value: string): number => {
    const normalized = normalizeDecimalInput(value);
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handleFromAmountChange = (value: string) => {
    console.log('handleFromAmountChange', value);
    setFromAmount(value); // Keep original user input (with comma if they typed it)
    
    const numericValue = parseAmount(value);
    
    if (value && numericValue > 0 && tokenPrices.ETH && tokenPrices.NEAR) {
      const fromPrice = tokenPrices[fromToken as keyof TokenPrices];
      const toPrice = tokenPrices[toToken as keyof TokenPrices];
      
      if (fromPrice && toPrice) {
        // Calculate output amount based on real prices
        const usdValue = numericValue * fromPrice;
        const outputAmount = usdValue / toPrice;
        
        // Apply 1% tolerance (reduce output by 1%)
        const outputWithTolerance = outputAmount * 0.99;
        
        setToAmount(outputWithTolerance.toFixed(6));
      }
    } else {
      setToAmount("");
    }
  };

  // Get current balance for a token
  const getTokenBalance = (token: string): number => {
    if (token === "ETH") {
      return ethBalanceData ? parseFloat(ethBalanceData.formatted) : 0;
    } else {
      return parseFloat(nearBalance);
    }
  };

  const handlePercentage = (percentage: number) => {
    const currentBalance = getTokenBalance(fromToken);
    const amount = ((currentBalance * percentage) / 100).toString();
    handleFromAmountChange(amount);
  };

  const handleSwapTokens = () => {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);

    // Clear amounts when swapping
    setFromAmount("");
    setToAmount("");
  };

  async function handleNearConnectWallet() {
    if (!nearSelector) {
      console.error("NEAR selector not initialized");
      return;
    }

    const modal = setupModal(nearSelector, {
      contractId: "test.testnet",
    });

    modal.show();
  }

  async function handleETHConnectWallet() {
    open();
  }

  // Execute swap with backend
  async function handleSwapExecution() {
    if (!fromAmount || !toAmount || !ethAddress || !nearAddress) {
      setSwapError("Missing required information for swap");
      return;
    }

    setIsSwapping(true);
    setSwapError(null);

    try {
      // Map token symbols to chain addresses  
      const sourceChain = fromToken === "ETH" ? "base-sepolia" : "near";
      const destinationChain = toToken === "ETH" ? "base-sepolia" : "near";
      
      // For demo, using simplified token addresses - in production these would be actual contract addresses
      const sourceTokenAddress = fromToken === "ETH" ? "0x0000000000000000000000000000000000000000" : "wrap.testnet";
      const destinationTokenAddress = toToken === "ETH" ? "0x0000000000000000000000000000000000000000" : "wrap.testnet";

      const swapRequest: SwapRequest = {
        sourceChain,
        destinationChain,
        sourceToken: sourceTokenAddress,
        destinationToken: destinationTokenAddress,
        amount: fromAmount,
        destinationAmount: toAmount,
        userAddress: fromToken === "ETH" ? ethAddress : nearAddress,
        recipientAddress: toToken === "ETH" ? ethAddress : nearAddress,
        slippageTolerance: 1.0
      };

      console.log('Executing swap:', swapRequest);

      const result = await solverService.executeSwap(swapRequest);
      console.log('Swap result:', result);

      // Get the swap details
      const swapOrder = await solverService.getSwapStatus(result.swapId);
      setCurrentSwap(swapOrder);

      // Subscribe to updates for this swap
      solverService.subscribeToSwap(result.swapId);

    } catch (error) {
      console.error('Swap execution failed:', error);
      setSwapError(error instanceof Error ? error.message : 'Swap execution failed');
      setIsSwapping(false);
    }
  }

  // Cancel current swap
  async function handleCancelSwap() {
    if (!currentSwap) return;

    try {
      await solverService.cancelSwap(currentSwap.id);
      setCurrentSwap(null);
      setIsSwapping(false);
    } catch (error) {
      console.error('Failed to cancel swap:', error);
      setSwapError(error instanceof Error ? error.message : 'Failed to cancel swap');
    }
  }

  const getTokenIcon = (token: string) => {
    return token === "ETH"
      ? "https://assets.coingecko.com/coins/images/279/standard/ethereum.png"
      : "https://assets.coingecko.com/coins/images/10365/standard/near.jpg";
  };

  const getTokenPrice = (token: string) => {
    return tokenPrices[token as keyof TokenPrices] || 0;
  };

  const getUSDValue = (amount: string, token: string) => {
    const price = getTokenPrice(token);
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || !price) return 0;
    return amountNum * price;
  };

  const formatUSDValue = (value: number) => {
    return value > 0 ? `$${Number(value).toFixed(2)}` : '$0.00';
  };

  // Get swap status display info
  const getSwapStatusInfo = (status: SwapStatus) => {
    switch (status) {
      case SwapStatus.CREATED:
        return { text: "Created", icon: Clock, color: "text-blue-400" };
      case SwapStatus.FIRST_LEG_PENDING:
        return { text: "First leg pending", icon: Loader, color: "text-yellow-400" };
      case SwapStatus.FIRST_LEG_COMPLETED:
        return { text: "First leg completed", icon: CheckCircle, color: "text-green-400" };
      case SwapStatus.SECOND_LEG_PENDING:
        return { text: "Second leg pending", icon: Loader, color: "text-yellow-400" };
      case SwapStatus.SECOND_LEG_COMPLETED:
        return { text: "Second leg completed", icon: CheckCircle, color: "text-green-400" };
      case SwapStatus.COMPLETING:
        return { text: "Completing", icon: Loader, color: "text-blue-400" };
      case SwapStatus.COMPLETED:
        return { text: "Completed", icon: CheckCircle, color: "text-green-400" };
      case SwapStatus.CANCELLING:
        return { text: "Cancelling", icon: Loader, color: "text-orange-400" };
      case SwapStatus.CANCELLED:
        return { text: "Cancelled", icon: AlertCircle, color: "text-orange-400" };
      case SwapStatus.FAILED:
        return { text: "Failed", icon: AlertCircle, color: "text-red-400" };
      default:
        return { text: "Unknown", icon: AlertCircle, color: "text-gray-400" };
    }
  };

  return (
    <div
      className={` font-sans min-h-screen bg-gray-950 text-white flex flex-col items-center w-full`}
    >
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm w-full">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/">
              <h1
                className={`${geistMono.className} text-xl font-bold text-white`}
              >
                NearFusion
              </h1>
              <p className="text-sm text-gray-400">Ethereum ↔ NEAR Swap</p>
            </Link>
          </div>
        </div>
      </header>
      <div className="w-full max-w-md mt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Swap</h1>
          
        </div>

        {/* Swap Widget */}
        <div className="bg-gray-900 rounded-2xl p-6 space-y-1">
          {/* From Token */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <input
                type="text"
                value={fromAmount}
                onChange={(e) => handleFromAmountChange(e.target.value)}
                placeholder="0.0"
                className="text-4xl font-light bg-transparent border-none outline-none text-white placeholder-gray-400 w-full"
                // Allow decimal input with both comma and dot
                pattern="[0-9]*[.,]?[0-9]*"
              />
              <div className="min-w-fit flex items-center gap-2 bg-gray-700 rounded-xl px-3 py-2">
                <Image
                  src={getTokenIcon(fromToken)}
                  alt={fromToken}
                  width={20}
                  height={20}
                  className="rounded-full"
                />
                <span className="font-semibold">{fromToken}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-gray-400 text-sm">
                {formatUSDValue(getUSDValue(fromAmount, fromToken))}
              </div>
              <div className="text-gray-400 text-sm">
                Balance: {getTokenBalance(fromToken).toFixed(6)} {fromToken}
              </div>
            </div>
            <div className="flex items-center justify-end mt-1">
              <div className="text-gray-500 text-xs">
                1 {fromToken} = {formatUSDValue(getTokenPrice(fromToken))}
              </div>
            </div>
          </div>

          {/* Percentage Buttons and Swap Button */}
          <div className="flex items-center justify-center gap-2 py-2">
            <button
              onClick={() => handlePercentage(10)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all cursor-pointer"
            >
              10%
            </button>
            <button
              onClick={() => handlePercentage(25)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all cursor-pointer"
            >
              25%
            </button>

            {/* Swap Direction Button */}
            <button
              onClick={handleSwapTokens}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-all cursor-pointer"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            <button
              onClick={() => handlePercentage(50)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all cursor-pointer"
            >
              50%
            </button>
            <button
              onClick={() => handlePercentage(100)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all cursor-pointer"
            >
              MAX
            </button>
          </div>

          {/* To Token */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-4xl font-light">{Number(Number(toAmount).toFixed(6)) || "0.0"}</div>
              <div className="min-w-fit flex items-center gap-2 bg-gray-700 rounded-xl px-3 py-2">
                <Image
                  src={getTokenIcon(toToken)}
                  alt={toToken}
                  width={20}
                  height={20}
                  className="rounded-full"
                />
                <span className="font-semibold">{toToken}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-gray-400 text-sm">
                {formatUSDValue(getUSDValue(toAmount, toToken))}
              </div>
              <div className="text-gray-400 text-sm">
                Balance: {getTokenBalance(toToken).toFixed(6)} {toToken}
              </div>
            </div>
            <div className="flex items-center justify-end mt-1">
              <div className="text-gray-500 text-xs">
                1 {toToken} = {formatUSDValue(getTokenPrice(toToken))}
              </div>
            </div>
          </div>
          
          {/* Price Info */}
          {fromAmount && toAmount && (
            <div className="bg-gray-800 rounded-xl p-3 mt-2">
              <div className="text-sm text-gray-300">
                <div className="flex justify-between">
                  <span>Exchange Rate:</span>
                  <span>1 {fromToken} = {((parseFloat(toAmount) / parseFloat(fromAmount)) || 0).toFixed(6)} {toToken}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Price Impact:</span>
                  <span className="text-green-400">~1% tolerance applied</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {swapError && (
          <div className="bg-red-900/50 border border-red-500 rounded-xl p-4 mt-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div className="text-red-300 text-sm">{swapError}</div>
            <button
              onClick={() => setSwapError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        )}

        {/* Current Swap Status */}
        {currentSwap && (
          <div className="bg-gray-800 rounded-xl p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Current Swap</h3>
              {currentSwap.status !== SwapStatus.COMPLETED && 
               currentSwap.status !== SwapStatus.CANCELLED && 
               currentSwap.status !== SwapStatus.FAILED && (
                <button
                  onClick={handleCancelSwap}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Swap ID:</span>
                <span className="font-mono text-xs">{currentSwap.id.slice(0, 8)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount:</span>
                <span>{currentSwap.amount} {fromToken} → {currentSwap.destinationAmount} {toToken}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Status:</span>
                <div className="flex items-center gap-2">
                  {(() => {
                    const statusInfo = getSwapStatusInfo(currentSwap.status);
                    const IconComponent = statusInfo.icon;
                    return (
                      <>
                        <IconComponent className={`w-4 h-4 ${statusInfo.color} ${statusInfo.icon === Loader ? 'animate-spin' : ''}`} />
                        <span className={statusInfo.color}>{statusInfo.text}</span>
                      </>
                    );
                  })()}
                </div>
              </div>
              {currentSwap.error && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Error:</span>
                  <span className="text-red-400 text-xs">{currentSwap.error}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Swap Button */}
        {isETHConnected && isNEARConnected ? (
          <button 
            onClick={handleSwapExecution}
            disabled={isSwapping || !fromAmount || !toAmount}
            className={`w-full mt-6 font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
              isSwapping || !fromAmount || !toAmount
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
            }`}
          >
            {isSwapping ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Swapping...
              </>
            ) : (
              'Swap'
            )}
          </button>
        ) : isETHConnected ? (
          <button
            onClick={handleNearConnectWallet}
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition-all cursor-pointer"
          >
            {" "}
            Connect NEAR Wallet{" "}
          </button>
        ) : (
          <button
            onClick={handleETHConnectWallet}
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition-all cursor-pointer"
          >
            {" "}
            Connect ETH Wallet{" "}
          </button>
        )}
      </div>
    </div>
  );
}
