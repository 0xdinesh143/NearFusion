'use client';

import { useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import { Geist_Mono } from "next/font/google";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function SwapPage() {
  // Mock wallet state for now
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [fromToken, setFromToken] = useState('ETH');
  const [toToken, setToToken] = useState('NEAR');

  // Mock exchange rate
  const exchangeRate = 0.15; // 1 ETH = 0.15 NEAR (example)

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value);
    if (value && !isNaN(parseFloat(value))) {
      const calculated = (parseFloat(value) * exchangeRate).toFixed(6);
      setToAmount(calculated);
    } else {
      setToAmount('');
    }
  };

  const handlePercentage = (percentage: number) => {
    // Mock balance for demonstration
    const mockBalance = 10;
    const amount = (mockBalance * percentage / 100).toString();
    handleFromAmountChange(amount);
  };

  const handleSwapTokens = () => {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);
    
    // Clear amounts when swapping
    setFromAmount('');
    setToAmount('');
  };

  const handleConnectWallet = () => {
    // Mock wallet connection
    setIsConnected(true);
    setAddress('0x742d...8a3c');
  };

  const getTokenIcon = (token: string) => {
    return token === 'ETH' ? '⟠' : '🔺';
  };

  return (
    <div className={` font-sans min-h-screen bg-gray-950 text-white flex flex-col items-center w-full`}>
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm w-full">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/">
              <h1 className={`${geistMono.className} text-xl font-bold text-white`}>CrossFusion</h1>
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
              <div className="flex items-center gap-2 bg-gray-700 rounded-xl px-3 py-2">
                <span className="text-xl">{getTokenIcon(fromToken)}</span>
                <span className="font-semibold">{fromToken}</span>
              </div>
            </div>
            <div className="text-gray-400 text-sm">$0.00</div>
          </div>

          {/* Percentage Buttons and Swap Button */}
          <div className="flex items-center justify-center gap-2 py-2">
            <button 
              onClick={() => handlePercentage(10)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all"
            >
              10%
            </button>
            <button 
              onClick={() => handlePercentage(25)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all"
            >
              25%
            </button>
            
            {/* Swap Direction Button */}
            <button
              onClick={handleSwapTokens}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-all"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
            
            <button 
              onClick={() => handlePercentage(50)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all"
            >
              50%
            </button>
            <button 
              onClick={() => handlePercentage(100)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all"
            >
              MAX
            </button>
          </div>

          {/* To Token */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-4xl font-light">
                {toAmount || '0.0'}
              </div>
              <div className="flex items-center gap-2 bg-gray-700 rounded-xl px-3 py-2">
                <span className="text-xl">{getTokenIcon(toToken)}</span>
                <span className="font-semibold">{toToken}</span>
              </div>
            </div>
            <div className="text-gray-400 text-sm">$0.00</div>
          </div>
        </div>

        {/* Connect Wallet Button */}
        <button 
          onClick={handleConnectWallet} 
          className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition-all"
        >
          {isConnected ? `Connected: ${address}` : 'Connect Wallet'}
        </button>
      </div>
    </div>
  );
} 