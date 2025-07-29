import Image from "next/image";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  return (
    <div
      className={`${geistSans.className} ${geistMono.className} font-sans min-h-screen bg-gray-950 text-white flex flex-col justify-between`}
    >
      {/* Header */}
      <header className="border-b border-gray-800 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/">
              <h1 className="text-xl font-bold">NearFusion</h1>
              <p className="text-sm text-gray-400">Ethereum ↔ NEAR Swap</p>
            </Link>
          </div>
          <Link
            href="/swap"
            className="btn-primary px-4 py-3 rounded-xl font-semibold text-[15px] hover:scale-105 transition-all"
          >
            Launch App
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center justify-center  px-8 py-20 text-center">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Hero Section */}
          <div className="space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-green-400 via-white to-red-500 bg-clip-text text-transparent">
              NearFusion
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mx-auto">
              The seamless Swap between Ethereum and NEAR Protocol. Swap tokens
              across chains with confidence and security.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center mt-12">
            <Link
              href="/swap"
              className="btn-primary px-8 py-4 rounded-xl font-semibold text-lg hover:scale-105 transition-all"
            >
              Launch Swap App
            </Link>
          </div>
          <div className="grid md:grid-cols-2 gap-8 mt-16">
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6 text-center">
              <div className="text-4xl mb-4">🔒</div>
              <h3 className="text-xl font-semibold mb-2">Secure Swap</h3>
              <p className="text-gray-400">
                Hash time-locked contracts ensure your funds are always
                protected
              </p>
            </div>
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6 text-center">
              <div className="text-4xl mb-4">💎</div>
              <h3 className="text-xl font-semibold mb-2">Best Rates</h3>
              <p className="text-gray-400">
                Powered by 1inch protocol aggregation for optimal swap rates
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-800 py-6 mt-20">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-400">
          <p>&copy; 2025 NearFusion. Built for Unite DeFi Hackathon.</p>
        </div>
      </footer>
    </div>
  );
}
