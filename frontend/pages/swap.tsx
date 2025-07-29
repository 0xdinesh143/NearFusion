"use client";

import { useState, useEffect } from "react";
import { ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { Geist_Mono } from "next/font/google";
import Image from "next/image";
import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";

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
  const { open, close } = useAppKit();
  const { isConnected: isETHConnected } = useAccount();
  const [isNEARConnected, setIsNEARConnected] = useState(false);

  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromToken, setFromToken] = useState("ETH");
  const [toToken, setToToken] = useState("NEAR");
  const [tokenPrices, setTokenPrices] = useState<TokenPrices>({ ETH: 0, NEAR: 0 });

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

  // Fetch prices on component mount
  useEffect(() => {
    fetchTokenPrices();
    // Refresh prices every 30 seconds
    const interval = setInterval(fetchTokenPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value);
    if (value && !isNaN(parseFloat(value)) && tokenPrices.ETH && tokenPrices.NEAR) {
      const fromPrice = tokenPrices[fromToken as keyof TokenPrices];
      const toPrice = tokenPrices[toToken as keyof TokenPrices];
      
      if (fromPrice && toPrice) {
        // Calculate output amount based on real prices
        const usdValue = parseFloat(value) * fromPrice;
        const outputAmount = usdValue / toPrice;
        
        // Apply 1% tolerance (reduce output by 1%)
        const outputWithTolerance = outputAmount * 0.99;
        
        setToAmount(outputWithTolerance.toFixed(6));
      }
    } else {
      setToAmount("");
    }
  };

  const handlePercentage = (percentage: number) => {
    // Mock balance for demonstration
    const mockBalance = 10;
    const amount = ((mockBalance * percentage) / 100).toString();
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
    const selector = await setupWalletSelector({
      network: "testnet",
      modules: [setupMeteorWallet(), setupHereWallet(), setupMyNearWallet()],
    });

    const modal = setupModal(selector, {
      contractId: "test.testnet",
    });
    modal.show();
    setIsNEARConnected(true);
  }

  async function handleETHConnectWallet() {
    open();
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
              <div className="text-4xl font-light">{toAmount || "0.0"}</div>
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

        {isETHConnected && isNEARConnected ? (
          <button className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition-all cursor-pointer">
            {" "}
            Swap{" "}
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
