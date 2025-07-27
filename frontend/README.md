# CrossFusion Frontend

A beautiful cross-chain swap interface for bridging tokens between Ethereum and NEAR Protocol.

## 🎨 Design Features

- **Dark theme** with 1inch-inspired colors (dark blacks, dark reds)
- **NEAR green accents** for primary actions and highlights
- **Modern glass-morphism** cards with backdrop blur effects
- **Gradient borders** and hover animations
- **Responsive design** that works on all devices

## 🔧 Tech Stack

- **Next.js 15** with TypeScript
- **Tailwind CSS 4** for styling
- **Wagmi/Viem** for Ethereum wallet connections
- **NEAR Wallet Selector** for NEAR wallet integrations
- **Lucide React** for icons
- **RainbowKit** for enhanced wallet UX

## 🚀 Features

### Landing Page (`/`)

- Hero section with gradient branding
- Feature highlights (fast, secure, best rates)
- Project stats and call-to-action buttons
- Responsive layout with modern design

### Swap Page (`/swap`)

- **Dual wallet connections** - Ethereum and NEAR
- **Bidirectional swapping** - ETH ↔ NEAR tokens
- **Token selector** with balance display
- **Real-time rate calculation** (mocked for demo)
- **Transaction settings** with slippage tolerance
- **Swap direction toggle** with smooth animations
- **Transaction details** showing fees and timing
- **Safety warnings** for cross-chain operations

## 🎯 UI Components

- **TokenSelector**: Dropdown with token icons, names, and balances
- **WalletConnection**: Chain-specific wallet connection cards
- **SwapWidget**: Main interface for token swapping
- **GradientButton**: Primary buttons with NEAR green gradients
- **Card**: Glass-morphism container with hover effects

## 🎨 Color Scheme

```css
/* 1inch Brand Colors */
--primary: #dc2626 (Dark red)
--secondary: #1f1f1f (Dark gray)
--background: #0a0a0a (Almost black)

/* NEAR Brand Colors */
--near-green: #00d395
--near-green-hover: #00b882
--near-green-light: #00e6a3

/* Card Colors */
--card-bg: #1a1a1a (Dark card background)
--border: #2a2a2a (Subtle borders)
```

## 🔗 Navigation

- **Home** (`/`) - Landing page with project overview
- **Swap** (`/swap`) - Main swap interface

## 📱 Responsive Features

- Mobile-first design
- Collapsible settings panel
- Stacked layout on smaller screens
- Touch-friendly interaction areas

## 🔮 Mock Data

Currently uses mock data for:

- Token lists (ETH, USDC, USDT, DAI, NEAR, USN, REF, AURORA)
- Wallet connections (demo addresses)
- Exchange rates (150 ETH:NEAR ratio)
- Transaction fees and timing

## 🚀 Getting Started

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` to see the landing page and `http://localhost:3000/swap` for the swap interface.

## 🏆 Built for Unite DeFi Hackathon

This interface is designed for the 1inch & ETHGlobal Unite DeFi hackathon, specifically for **Track 1: Cross-chain Swap (Fusion+) Extension to NEAR**.

### Hackathon Requirements Met:

- ✅ Bidirectional swaps (ETH ↔ NEAR)
- ✅ Modern, professional UI
- ✅ Wallet connection support
- ✅ Mock swap functionality demonstration
- ✅ Cross-chain Swap warnings and UX

## 🔧 Next Steps

For production implementation:

1. Integrate real NEAR and Ethereum wallet connections
2. Connect to actual HTLC smart contracts
3. Implement real token price feeds
4. Add transaction history and status tracking
5. Add more token support and liquidity sources
