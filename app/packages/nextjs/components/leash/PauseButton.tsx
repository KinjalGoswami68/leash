"use client";

import { useReducedMotion } from "motion/react";
import { useAccount } from "wagmi";
import { PauseIcon, PlayIcon } from "@heroicons/react/24/outline";
import { Magnetic } from "~~/components/motion-primitives/magnetic";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

/** Kill switch. Only rendered as a button for the owner wallet; the contract enforces onlyOwner regardless. */
export const PauseButton = ({ owner, paused }: { owner?: string; paused?: boolean }) => {
  const { address } = useAccount();
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "LeashVault" });
  const reduceMotion = useReducedMotion();

  const isOwner = Boolean(address && owner && address.toLowerCase() === owner.toLowerCase());
  if (!isOwner) return <span className="leash-label">Owner only</span>;

  const toggle = async () => {
    try {
      await writeContractAsync({ functionName: "setPaused", args: [!paused] });
    } catch (e) {
      // useTransactor already shows the error toast.
      console.error(e);
    }
  };

  const button = (
    <button className="leash-btn" onClick={toggle} disabled={isMining || paused === undefined}>
      {paused ? <PlayIcon className="h-5 w-5" /> : <PauseIcon className="h-5 w-5" />}
      {isMining ? "Confirming…" : paused ? "Resume agent" : "Pause agent"}
    </button>
  );

  // Magnetic pull is low (0.25) so the button never drifts far from where the owner is aiming to click.
  return reduceMotion ? (
    button
  ) : (
    <Magnetic intensity={0.25} range={90}>
      {button}
    </Magnetic>
  );
};
