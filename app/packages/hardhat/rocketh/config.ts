// Load .env here too so AGENT_ADDRESS is available however this config gets imported.
import "dotenv/config";
import type { UserConfig } from "rocketh/types";
import { privateKey } from "@rocketh/signer";
import * as deployExtension from "@rocketh/deploy";
import * as readExecuteExtension from "@rocketh/read-execute";

export const config = {
  accounts: {
    deployer: {
      default: 0,
    },
    // Hardhat account 1 locally. On Base Sepolia the provider only holds the deployer key, so the agent is given
    // as a plain address (AGENT_ADDRESS); its private key lives only in the agent backend.
    agent: {
      default: 1,
      ...(process.env.AGENT_ADDRESS ? { baseSepolia: process.env.AGENT_ADDRESS as `0x${string}` } : {}),
    },
  },
  data: {},
  signerProtocols: {
    privateKey,
  },
} as const satisfies UserConfig;

const extensions = {
  ...readExecuteExtension,
  ...deployExtension,
};
export { extensions };

// Type exports for use in deploy.ts and environment.ts
type Extensions = typeof extensions;
type Accounts = typeof config.accounts;
type Data = typeof config.data;
export type { Extensions, Accounts, Data };
