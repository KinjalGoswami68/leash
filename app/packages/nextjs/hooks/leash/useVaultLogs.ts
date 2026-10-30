import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Address, PublicClient, createPublicClient, fallback, http, parseEventLogs } from "viem";
import { baseSepolia, hardhat } from "viem/chains";
import { usePublicClient } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import scaffoldConfig from "~~/scaffold.config";
import { ContractAbi, contracts } from "~~/utils/scaffold-eth/contract";

type VaultAbi = ContractAbi<"LeashVault">;
export type VaultLog = ReturnType<typeof parseEventLogs<VaultAbi>>[number];
type VaultLogsData = { logs: VaultLog[]; toBlock: bigint };

// Free RPCs for log history, in order. sepolia.base.org (wagmi's default) caps eth_getLogs at 200 blocks, which would
// mean ~1,500 requests per page load; publicnode and Tenderly accept 50k-block ranges, send CORS *, and need no key.
// Comma-separated NEXT_PUBLIC_LOGS_RPC_URLS replaces the list if one of them goes away.
const LOGS_RPCS: Record<number, string[]> = {
  [baseSepolia.id]: process.env.NEXT_PUBLIC_LOGS_RPC_URLS?.split(",").map(u => u.trim()) || [
    "https://base-sepolia-rpc.publicnode.com",
    "https://base-sepolia.gateway.tenderly.co",
    "https://sepolia.base.org",
  ],
};
const CHUNK = 10_000n; // ~5.5h of Base blocks: ~30 requests for the whole history, well inside both RPCs' limits.
const MIN_CHUNK = 200n; // a failing chunk is halved down to this, so even the 200-block RPC eventually answers.
const PARALLEL = 3;
const POLL_MS = Math.max(scaffoldConfig.pollingInterval, 4000);

const logClients = new Map<number, PublicClient>();
const logClientFor = (chainId: number, fallbackClient?: PublicClient) => {
  const urls = LOGS_RPCS[chainId];
  if (!urls) return fallbackClient; // local Hardhat: wagmi's own client has no range limit
  if (!logClients.has(chainId)) {
    const chain = chainId === baseSepolia.id ? baseSepolia : hardhat;
    // fallback(): an RPC error or timeout moves on to the next URL before our own retry loop kicks in.
    logClients.set(
      chainId,
      createPublicClient({
        chain,
        transport: fallback(urls.map(u => http(u, { retryCount: 1, timeout: 15_000 }))),
      }) as PublicClient,
    );
  }
  return logClients.get(chainId);
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One range: 3 tries with backoff across all RPCs, then split in half (covers RPCs with a smaller range cap). */
const getRange = async (client: PublicClient, address: Address[], from: bigint, to: bigint): Promise<any[]> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.getLogs({ address, fromBlock: from, toBlock: to });
    } catch (e) {
      if (attempt === 2 && to - from + 1n <= MIN_CHUNK) throw e;
      if (attempt < 2) await sleep(500 * 2 ** attempt);
    }
  }
  const mid = from + (to - from) / 2n;
  return [...(await getRange(client, address, from, mid)), ...(await getRange(client, address, mid + 1n, to))];
};

const fetchLogs = async (client: PublicClient, address: Address[], from: bigint, to: bigint) => {
  const ranges: [bigint, bigint][] = [];
  for (let b = from; b <= to; b += CHUNK) ranges.push([b, b + CHUNK - 1n < to ? b + CHUNK - 1n : to]);
  const out: any[][] = new Array(ranges.length);
  let next = 0;
  // A few chunks in flight at once: fast enough, without tripping the free RPCs' per-IP rate limits.
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, ranges.length) }, async () => {
      while (next < ranges.length) {
        const i = next++;
        out[i] = await getRange(client, address, ...ranges[i]);
      }
    }),
  );
  return out.flat();
};

/**
 * Every Leash event (Paid, Rejected, AllowlistUpdated, ...) of one or more vaults, newest first.
 * Replaces SE-2's useScaffoldEventHistory for production: one eth_getLogs per chunk for all events and all vaults,
 * history read from the earliest deployment block, then polled. Components asking for the same vaults share one
 * react-query cache entry, so the dashboard's feed and rules panel cost one history load, not two.
 */
export const useVaultLogs = (names: string[]) => {
  const { targetNetwork } = useTargetNetwork();
  const queryClient = useQueryClient();
  const wagmiClient = usePublicClient({ chainId: targetNetwork.id }) as PublicClient | undefined;
  const client = logClientFor(targetNetwork.id, wagmiClient);

  const deployed = names.map(n => contracts?.[targetNetwork.id]?.[n]).filter(Boolean);
  const address = deployed.map(c => c!.address);
  const fromBlock = deployed.reduce(
    (min, c) => {
      const b = BigInt(c!.deployedOnBlock ?? 0);
      return min === undefined || b < min ? b : min;
    },
    undefined as bigint | undefined,
  );
  const abi = contracts?.[targetNetwork.id]?.LeashVault?.abi as VaultAbi | undefined;
  const queryKey = ["leashVaultLogs", targetNetwork.id, address.join(",")];

  const query = useQuery({
    queryKey,
    enabled: Boolean(client && abi && address.length && fromBlock !== undefined),
    // Incremental: the first run loads the full history, every later poll only the blocks since the last one.
    queryFn: async (): Promise<VaultLogsData> => {
      const prev = queryClient.getQueryData<VaultLogsData>(queryKey);
      const head = await client!.getBlockNumber();
      const start = prev ? prev.toBlock + 1n : fromBlock!;
      if (start > head) return prev ?? { logs: [], toBlock: head };
      const fresh = parseEventLogs({ abi: abi!, logs: await fetchLogs(client!, address, start, head) }).reverse();
      return { logs: fresh.length ? [...fresh, ...(prev?.logs ?? [])] : (prev?.logs ?? []), toBlock: head };
    },
    refetchInterval: POLL_MS,
    staleTime: POLL_MS,
    retry: 3,
    retryDelay: n => 1000 * 2 ** n,
  });

  return { logs: query.data?.logs ?? [], isLoading: query.isPending, error: query.error };
};
