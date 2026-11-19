/**
 * Minimal example: an AgentKit agent that can buy the Blockchain IQ
 * Crypto Market Brief ($0.01 USDC on Base per call) on demand.
 *
 * Setup:
 *   npm install
 *   cp .env.example .env   # fill in your CDP keys
 *   npm run example
 */
import { AgentKit, CdpV2EvmWalletProvider } from "@coinbase/agentkit";
import { blockchainIQActionProvider } from "./src";

async function main() {
  const walletProvider = await CdpV2EvmWalletProvider.configureWithWallet({
    apiKeyId: process.env.CDP_API_KEY_ID!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    networkId: "base-mainnet",
  });

  const agentKit = await AgentKit.from({
    walletProvider,
    actionProviders: [blockchainIQActionProvider()],
  });

  const actions = agentKit.getActions();
  const brief = actions.find((a) => a.name === "blockchainiq_get_crypto_market_brief");
  if (!brief) throw new Error("action not registered");

  const result = await brief.invoke({});
  console.log(result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
