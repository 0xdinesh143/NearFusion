"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowUpDown, Loader, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Geist_Mono } from "next/font/google";
import Image from "next/image";
import { setupWalletSelector, WalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { useAppKit } from "@reown/appkit/react";
import { useAccount, useBalance, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { 
  solverService, 
  SwapOrder, 
  SwapStatus, 
  SwapRequest, 
  SwapUpdateEvent, 
  SolverErrorEvent 
} from "../lib/solverService";
import { showToast } from "../lib/toast";
import { EVM_FACTORY_ADDRESS, NEAR_FACTORY_ADDRESS } from "../constants";

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

  // Transfer state
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferHash, setTransferHash] = useState<string | null>(null);

  // ETH transfer hooks
  const { sendTransaction, data: txHash, isPending: isTxPending } = useSendTransaction();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  console.log('txHash', txHash);

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

  // ETH Transfer Function
  const executeETHTransfer = async (amount: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      let resolved = false;
      
      const handleTxHash = (hash: string) => {
        if (!resolved) {
          resolved = true;
          console.log('txHash received:', hash);
          showToast('⏳ Transfer Pending', 'ETH transfer submitted, waiting for confirmation...', 'info');
          setTransferHash(hash);
          resolve(hash);
        }
      };

      const handleError = (error: Error) => {
        if (!resolved) {
          resolved = true;
          console.error('ETH transfer failed:', error);
          setIsTransferring(false);
          reject(error);
        }
      };

      try {
        setIsTransferring(true);
        showToast('💸 Initiating ETH Transfer', 'Transferring ETH to escrow factory...', 'info');

        // Store the resolve function to be called when txHash updates
        (window as any).pendingETHTransferResolve = handleTxHash;
        (window as any).pendingETHTransferReject = handleError;

        // Trigger the transaction
        sendTransaction({
          to: EVM_FACTORY_ADDRESS as `0x${string}`,
          value: parseEther(amount),
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          handleError(new Error('Transaction hash timeout'));
        }, 30000);

      } catch (error) {
        handleError(new Error(error instanceof Error ? error.message : 'ETH transfer failed'));
      }
    });
  };

  // NEAR Transfer Function
  const executeNEARTransfer = async (amount: string): Promise<string> => {
    try {
      if (!nearSelector || !nearAddress) {
        throw new Error('NEAR wallet not connected');
      }

      setIsTransferring(true);
      showToast('💸 Initiating NEAR Transfer', 'Transferring NEAR to escrow factory...', 'info');

      const wallet = await nearSelector.wallet();
      const amountInYocto = (parseFloat(amount) * 1e24).toString();

      const result = await wallet.signAndSendTransaction({
        signerId: nearAddress,
        receiverId: NEAR_FACTORY_ADDRESS,
        actions: [
          {
            type: 'Transfer',
            params: {
              deposit: amountInYocto,
            },
          },
        ],
      });

      showToast('✅ NEAR Transfer Complete', 'NEAR transfer completed successfully', 'success');
      setTransferHash(result.transaction.hash);
      
      return result.transaction.hash;
    } catch (error) {
      console.error('NEAR transfer failed:', error);
      setIsTransferring(false);
      throw new Error(error instanceof Error ? error.message : 'NEAR transfer failed');
    }
  };

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

  // Handle ETH transaction hash availability
  useEffect(() => {
    if (txHash && (window as any).pendingETHTransferResolve) {
      (window as any).pendingETHTransferResolve(txHash);
      delete (window as any).pendingETHTransferResolve;
      delete (window as any).pendingETHTransferReject;
    }
  }, [txHash]);

  // Fetch prices on component mount and setup WebSocket
  useEffect(() => {
    fetchTokenPrices();
    // Refresh prices every 30 seconds
    const interval = setInterval(fetchTokenPrices, 30000);

    // Setup WebSocket for real-time swap updates
    solverService.connectWebSocket({
      onSwapUpdate: (event: SwapUpdateEvent) => {
        console.log('🎉 Swap Update', event);
          // Show toast notifications for different stages
          const swap = event.data as SwapOrder;
          switch (swap.status) {
            case SwapStatus.CREATED:
              showToast('🚀 Swap Initiated', 'Cross-chain swap has been initiated', 'info');
              break;
            case SwapStatus.FIRST_LEG_PENDING:
              showToast('⏳ Processing Source', 'Creating source escrow...', 'info');
              break;
            case SwapStatus.FIRST_LEG_COMPLETED:
              showToast('✅ Source Complete', 'Source escrow created successfully', 'success');
              break;
            case SwapStatus.SECOND_LEG_PENDING:
              showToast('⏳ Processing Destination', 'Creating destination escrow...', 'info');
              break;
            case SwapStatus.SECOND_LEG_COMPLETED:
              showToast('✅ Destination Complete', 'Destination escrow created successfully', 'success');
              break;
            case SwapStatus.COMPLETING:
              showToast('🔄 Finalizing Swap', 'Revealing secret and completing transfer...', 'info');
              break;
            case SwapStatus.COMPLETED:
              showToast('🎉 Swap Completed', 'Cross-chain swap completed successfully!', 'success');
              break;
            case SwapStatus.FAILED:
              showToast('❌ Swap Failed', swap.error || 'Swap failed unexpectedly', 'error');
              break;
          }
        
      },
      onSwapCompleted: () => {
        showToast('🎉 Swap Completed', 'Cross-chain swap completed successfully!', 'success');
          setIsSwapping(false);
          // Refresh balances after successful swap
          fetchNearBalance();
        
      },
      onSwapCancelled: () => {
         showToast('❌ Swap Cancelled', 'Your swap has been cancelled', 'error');
          setIsSwapping(false);
        
      },
      onError: (error: SolverErrorEvent) => {
        console.error('🚨 Solver error:', error);
        showToast('🚨 System Error', error.error || 'An unexpected error occurred', 'error');
        setSwapError(error.error || 'Unknown error occurred');
        setIsSwapping(false);
      },
      onSwapInitiated: () => {
        showToast('🚀 Swap Initiated', 'Cross-chain swap has been initiated successfully!', 'info');
      }
    });

    return () => {
      clearInterval(interval);
      solverService.disconnectWebSocket();
    };
  }, [ fetchNearBalance]);

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
      // Step 1: Execute the required transfer based on source token
      let transferTxHash: string;

      if (fromToken === "ETH") {
        // Transfer ETH to escrow factory
        transferTxHash = await executeETHTransfer(fromAmount);
        
        
      } else {
        // Transfer NEAR to escrow factory
        transferTxHash = await executeNEARTransfer(fromAmount);
      }

      // Step 2: Wait a moment for transfer to be processed
      showToast('🔄 Processing Transfer', 'Transfer completed, proceeding with swap...', 'info');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 3: Proceed with solver service
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
        slippageTolerance: 1.0,
        // Include the transfer transaction hash for reference
        transferTxHash
      };

      showToast('🚀 Starting Cross-Chain Swap', 'Initiating cross-chain swap with solver...', 'info');

      const result = await solverService.executeSwap(swapRequest);

      // Subscribe to updates for this swap
      solverService.subscribeToSwap(result.swapId);

      // Reset transfer state
      setIsTransferring(false);
      setTransferHash(null);

    } catch (error) {
      console.error('Swap execution failed:', error);
      setSwapError(error instanceof Error ? error.message : 'Swap execution failed');
      setIsSwapping(false);
      setIsTransferring(false);
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

        {/* Swap Button */}
        {isETHConnected && isNEARConnected ? (
          <button 
            onClick={handleSwapExecution}
            disabled={isSwapping || isTransferring || isTxPending || isTxLoading || !fromAmount || !toAmount}
            className={`w-full mt-6 font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
              isSwapping || isTransferring || isTxPending || isTxLoading || !fromAmount || !toAmount
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
            }`}
          >
            {isSwapping || isTransferring || isTxPending || isTxLoading ? (
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
