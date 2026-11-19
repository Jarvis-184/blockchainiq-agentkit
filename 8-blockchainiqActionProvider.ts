import { ActionProvider, EvmWalletProvider, Network, CreateAction } from "@coinbase/agentkit";
import { z } from "zod";

const API_BASE = "https://www.blockchainiq.co/api/x402/v1";
const BASE_CHAIN_ID = 8453;
const BASE_NETWORK_ID = "eip155:8453";

const EmptySchema = z.object({}).strict();

interface X402Accept {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string };
}

interface X402PaymentRequired {
  x402Version: number;
  resource: unknown;
  accepts: X402Accept[];
}

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64encode(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

/**
 * AgentKit action provider for the Blockchain IQ x402 API.
 *
 * Exposes the Crypto Market Brief ($0.01 USDC on Base per call) as a single
 * AgentKit action. On an HTTP 402 the provider builds an EIP-3009
 * TransferWithAuthorization for exactly the quoted price, signs it with the
 * agent's wallet provider, and retries with the x402 payment header. The
 * facilitator submits the on-chain transaction, so the agent wallet needs
 * USDC on Base but no ETH for gas.
 */
class BlockchainIQActionProvider extends ActionProvider<EvmWalletProvider> {
  constructor() {
    super("blockchainiq", []);
  }

  @CreateAction({
    name: "get_crypto_market_brief",
    description:
      "Get the Blockchain IQ crypto market brief: BTC, ETH, SOL and XRP prices with 24h/7d/30d moves, " +
      "scheduled macro and crypto events in the next 48 hours, and short risk flags. " +
      "Costs $0.01 USDC on Base per call, paid automatically via x402 with the agent wallet. " +
      "Takes no parameters.",
    schema: EmptySchema,
  })
  async getCryptoMarketBrief(walletProvider: EvmWalletProvider): Promise<string> {
    const url = `${API_BASE}/brief`;

    const unpaid = await fetch(url);
    if (unpaid.ok) {
      return await unpaid.text();
    }
    if (unpaid.status !== 402) {
      return `Blockchain IQ brief request failed with HTTP ${unpaid.status}: ${await unpaid.text()}`;
    }

    const requiredHeader = unpaid.headers.get("payment-required");
    if (!requiredHeader) {
      return "Blockchain IQ returned 402 without a payment-required header.";
    }
    const required: X402PaymentRequired = JSON.parse(Buffer.from(requiredHeader, "base64").toString("utf-8"));
    const accept = required.accepts.find((a) => a.scheme === "exact" && a.network === BASE_NETWORK_ID);
    if (!accept) {
      return "Blockchain IQ did not offer a Base USDC payment option.";
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const from = (await walletProvider.getAddress()) as `0x${string}`;
    const authorization = {
      from,
      to: accept.payTo as `0x${string}`,
      value: accept.amount,
      validAfter: String(nowSec - 60),
      validBefore: String(nowSec + Math.min(accept.maxTimeoutSeconds ?? 300, 300) - 60),
      nonce: randomNonce(),
    };

    const typedData = {
      domain: {
        name: accept.extra?.name ?? "USD Coin",
        version: accept.extra?.version ?? "2",
        chainId: BASE_CHAIN_ID,
        verifyingContract: accept.asset as `0x${string}`,
      },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization" as const,
      message: authorization,
    };

    const signature = await walletProvider.signTypedData(typedData);

    const paymentPayload = {
      x402Version: required.x402Version,
      resource: required.resource,
      accepted: accept,
      payload: { signature, authorization },
    };

    const paid = await fetch(url, {
      headers: { "payment-signature": b64encode(JSON.stringify(paymentPayload)) },
    });
    if (!paid.ok) {
      return `Blockchain IQ payment was rejected with HTTP ${paid.status}: ${await paid.text()}`;
    }

    const settlementHeader = paid.headers.get("payment-response");
    let settlementTx = "";
    if (settlementHeader) {
      try {
        settlementTx = JSON.parse(Buffer.from(settlementHeader, "base64").toString("utf-8")).transaction ?? "";
      } catch {
        settlementTx = "";
      }
    }

    const brief = await paid.text();
    return JSON.stringify({ brief: JSON.parse(brief), settlementTransaction: settlementTx });
  }

  supportsNetwork = (network: Network): boolean =>
    network.protocolFamily === "evm" && (!network.chainId || network.chainId === String(BASE_CHAIN_ID));
}

export const blockchainIQActionProvider = () => new BlockchainIQActionProvider();
