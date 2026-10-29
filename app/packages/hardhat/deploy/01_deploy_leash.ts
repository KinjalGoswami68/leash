import { getAddress } from "ethers";
import { deployScript, artifacts } from "../rocketh/deploy.js";

const USDC = 10n ** 6n; // MockUSDC has 6 decimals

// Hardhat #2, #3: well-known public test addresses used as "approved vendors" when VENDOR_ADDRESSES is unset.
const DEFAULT_VENDORS = ["0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", "0x90F79bf6EB2c4f870365E785982E1f101E93b906"];

/**
 * Deploys MockUSDC and the main LeashVault used by the dashboard and agent.
 * Arena vaults (L1/L2/L3) are in 02_deploy_arena.ts.
 *
 * Base Sepolia: set AGENT_ADDRESS in packages/hardhat/.env to the public address of the agent's throwaway key.
 * Only the address is needed here; the agent's private key never touches the deploy.
 */
export default deployScript(
  async env => {
    // agent = Hardhat #1 locally, AGENT_ADDRESS on baseSepolia (see rocketh/config.ts).
    const { deployer } = env.namedAccounts;
    if (!env.namedAccounts.agent) throw new Error("AGENT_ADDRESS is not set in packages/hardhat/.env");
    const agent = getAddress(env.namedAccounts.agent) as `0x${string}`;
    // Owner and agent must differ, otherwise a stolen agent key could change the rules.
    if (agent.toLowerCase() === deployer.toLowerCase()) throw new Error("AGENT_ADDRESS must differ from the deployer");

    const vendors = (process.env.VENDOR_ADDRESSES || DEFAULT_VENDORS.join(","))
      .split(",")
      .map(a => a.trim())
      .filter(Boolean)
      .map(a => getAddress(a) as `0x${string}`);

    const usdc = await env.deploy("MockUSDC", {
      account: deployer,
      artifact: artifacts.MockUSDC,
      args: [],
    });

    const vault = await env.deploy("LeashVault", {
      account: deployer,
      artifact: artifacts.LeashVault,
      // token, owner, agent, perPaymentLimit, dailyLimit, allowlistEnabled
      args: [usdc.address, deployer, agent, 10n * USDC, 50n * USDC, true],
    });

    // Fund the vault so the agent has something to spend (MockUSDC: testnet-only, no real value).
    await env.execute(usdc, { account: deployer, functionName: "mint", args: [vault.address, 1000n * USDC] });

    for (const vendor of vendors) {
      await env.execute(vault, { account: deployer, functionName: "setAllowed", args: [vendor, true] });
    }

    console.log("LeashVault:", vault.address, "| MockUSDC:", usdc.address, "| agent:", agent);
    console.log("Allowlisted vendors:", vendors.join(", "));
  },
  {
    tags: ["Leash"],
  },
);
