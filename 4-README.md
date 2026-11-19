# Blockchain IQ x402 action provider for Coinbase AgentKit

An [AgentKit](https://github.com/coinbase/agentkit) action provider that lets any
AgentKit agent buy the [Blockchain IQ](https://www.blockchainiq.co) Crypto Market
Brief over the x402 payment standard: $0.01 USDC on Base per call, no account and
no API key.

## The action

`blockchainiq_get_crypto_market_brief` (no parameters) returns BTC, ETH, SOL and
XRP prices with 24h/7d/30d moves, scheduled macro and crypto events in the next
48 hours, and short risk flags - plus the on-chain settlement transaction hash of
the x402 payment.

When the API answers HTTP 402, the provider builds an EIP-3009
`TransferWithAuthorization` for exactly the quoted price, signs it with the
agent's wallet provider, and retries with the x402 `payment-signature` header.
The x402 facilitator submits the on-chain transaction, so the agent wallet needs
a little USDC on Base and no ETH for gas.

## Usage

```typescript
import { AgentKit, CdpV2EvmWalletProvider } from "@coinbase/agentkit";
import { blockchainIQActionProvider } from "blockchainiq-agentkit-action-provider";

const walletProvider = await CdpV2EvmWalletProvider.configureWithWallet({
  apiKeyId: process.env.CDP_API_KEY_ID!,
  apiKeySecret: process.env.CDP_API_KEY_SECRET!,
  networkId: "base-mainnet",
});

const agentKit = await AgentKit.from({
  walletProvider,
  actionProviders: [blockchainIQActionProvider()],
});
```

See `example.ts` for a runnable agent loop. Built for the Blockchain IQ x402
build bounty (AgentKit slot).

## Requirements

- Node 18+
- A Coinbase Developer Platform API key for the wallet provider (or any other
  AgentKit EVM wallet provider on Base)
- A small amount of USDC on Base in the agent wallet ($0.01 per call)

## License

MIT
