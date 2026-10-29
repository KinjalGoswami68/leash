import { expect } from "chai";
import { network } from "hardhat";
import { loadAndExecuteDeploymentsFromFiles } from "../rocketh/environment.js";

const { provider, networkHelpers, ethers } = await network.create();
const { time } = networkHelpers;

const USDC = 10n ** 6n;
const PER_PAYMENT = 10n * USDC;
const DAILY = 50n * USDC;
const DAY = 24 * 60 * 60;

async function deployFixture() {
  const [owner, agent, vendorA, vendorB, stranger] = await ethers.getSigners();
  const usdc = await ethers.deployContract("MockUSDC");
  const vault = await ethers.deployContract("LeashVault", [
    await usdc.getAddress(),
    owner.address,
    agent.address,
    PER_PAYMENT,
    DAILY,
    true,
  ]);
  await usdc.mint(await vault.getAddress(), 1000n * USDC);
  await vault.setAllowed(vendorA.address, true);
  await vault.setAllowed(vendorB.address, true);
  return { usdc, vault, owner, agent, vendorA, vendorB, stranger };
}

describe("LeashVault", function () {
  describe("deploy script", function () {
    it("deploys a funded vault with the agent and allowlist set", async function () {
      const env = await loadAndExecuteDeploymentsFromFiles({ provider });
      const { address } = env.get("LeashVault");
      const vault = await ethers.getContractAt("LeashVault", address);
      const [owner, agent] = await ethers.getSigners();
      expect(await vault.owner()).to.equal(owner.address);
      expect(await vault.agent()).to.equal(agent.address);
      expect(await vault.balance()).to.equal(1000n * USDC);
      expect(await vault.allowed("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")).to.equal(true);
    });

    it("arena: the same jailbroken 500 USDC payment succeeds on L1 and is blocked on L2 and L3", async function () {
      const env = await loadAndExecuteDeploymentsFromFiles({ provider });
      const [, agent, , , , player] = await ethers.getSigners();
      const expected = [
        ["ArenaL1", null],
        ["ArenaL2", "OVER_PER_PAYMENT_LIMIT"],
        ["ArenaL3", "NOT_ALLOWLISTED"],
      ] as const;
      for (const [name, reason] of expected) {
        const vault = await ethers.getContractAt("LeashVault", env.get(name).address);
        expect(await vault.agent()).to.equal(agent.address);
        expect(await vault.balance()).to.equal(1000n * USDC);
        const tx = vault.connect(agent).pay(player.address, 500n * USDC, "jailbreak");
        if (reason) await expect(tx).to.emit(vault, "Rejected").withArgs(player.address, 500n * USDC, reason);
        else await expect(tx).to.emit(vault, "Paid").withArgs(player.address, 500n * USDC, "jailbreak");
      }
    });
  });

  describe("constructor", function () {
    it("rejects owner == agent", async function () {
      const [owner] = await ethers.getSigners();
      const usdc = await ethers.deployContract("MockUSDC");
      const factory = await ethers.getContractFactory("LeashVault");
      await expect(
        factory.deploy(await usdc.getAddress(), owner.address, owner.address, 1, 1, false),
      ).to.be.revertedWithCustomError(factory, "InvalidAddress");
    });
  });

  describe("access control", function () {
    it("reverts when anyone but the agent calls pay", async function () {
      const { vault, owner, stranger, vendorA } = await networkHelpers.loadFixture(deployFixture);
      await expect(vault.connect(stranger).pay(vendorA.address, USDC, "x")).to.be.revertedWithCustomError(
        vault,
        "NotAgent",
      );
      // Even the owner cannot use the agent path.
      await expect(vault.connect(owner).pay(vendorA.address, USDC, "x")).to.be.revertedWithCustomError(
        vault,
        "NotAgent",
      );
    });

    it("agent cannot change rules, pause, or withdraw", async function () {
      const { vault, agent } = await networkHelpers.loadFixture(deployFixture);
      const a = vault.connect(agent);
      await expect(a.setLimits(1, 1)).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      await expect(a.setAllowed(agent.address, true)).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount",
      );
      await expect(a.setAllowlistEnabled(false)).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      await expect(a.setPaused(false)).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      await expect(a.setAgent(agent.address)).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      await expect(a.withdraw(agent.address, 1)).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      await expect(a.transferOwnership(agent.address)).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount",
      );
    });

    it("owner can withdraw", async function () {
      const { vault, usdc, owner } = await networkHelpers.loadFixture(deployFixture);
      await expect(vault.withdraw(owner.address, 100n * USDC))
        .to.emit(vault, "Withdrawn")
        .withArgs(owner.address, 100n * USDC);
      expect(await usdc.balanceOf(owner.address)).to.equal(100n * USDC);
    });

    it("owner can rotate the agent key, old key is locked out", async function () {
      const { vault, agent, stranger, vendorA } = await networkHelpers.loadFixture(deployFixture);
      await vault.setAgent(stranger.address);
      await expect(vault.connect(agent).pay(vendorA.address, USDC, "x")).to.be.revertedWithCustomError(
        vault,
        "NotAgent",
      );
      await expect(vault.connect(stranger).pay(vendorA.address, USDC, "x")).to.emit(vault, "Paid");
    });
  });

  describe("pay rules", function () {
    it("pays an allowlisted recipient within limits", async function () {
      const { vault, usdc, agent, vendorA } = await networkHelpers.loadFixture(deployFixture);
      const v = vault.connect(agent);
      expect(await v.pay.staticCall(vendorA.address, 5n * USDC, "coffee")).to.equal(true);
      await expect(v.pay(vendorA.address, 5n * USDC, "coffee"))
        .to.emit(vault, "Paid")
        .withArgs(vendorA.address, 5n * USDC, "coffee");
      expect(await usdc.balanceOf(vendorA.address)).to.equal(5n * USDC);
      expect(await vault.spentToday()).to.equal(5n * USDC);
      expect(await vault.remainingToday()).to.equal(DAILY - 5n * USDC);
    });

    async function expectRejected(
      vault: Awaited<ReturnType<typeof deployFixture>>["vault"],
      agent: Awaited<ReturnType<typeof deployFixture>>["agent"],
      to: string,
      amount: bigint,
      reason: string,
    ) {
      const v = vault.connect(agent);
      expect(await v.pay.staticCall(to, amount, "m")).to.equal(false);
      await expect(v.pay(to, amount, "m")).to.emit(vault, "Rejected").withArgs(to, amount, reason);
    }

    it("rejects a recipient not on the allowlist", async function () {
      const { vault, usdc, agent, stranger } = await networkHelpers.loadFixture(deployFixture);
      await expectRejected(vault, agent, stranger.address, USDC, "NOT_ALLOWLISTED");
      expect(await usdc.balanceOf(stranger.address)).to.equal(0n);
    });

    it("allows any recipient when the allowlist is disabled", async function () {
      const { vault, agent, stranger } = await networkHelpers.loadFixture(deployFixture);
      await vault.setAllowlistEnabled(false);
      await expect(vault.connect(agent).pay(stranger.address, USDC, "m")).to.emit(vault, "Paid");
    });

    it("rejects over the per-payment cap, accepts exactly the cap", async function () {
      const { vault, agent, vendorA } = await networkHelpers.loadFixture(deployFixture);
      await expectRejected(vault, agent, vendorA.address, PER_PAYMENT + 1n, "OVER_PER_PAYMENT_LIMIT");
      await expect(vault.connect(agent).pay(vendorA.address, PER_PAYMENT, "m")).to.emit(vault, "Paid");
    });

    it("rejects once the daily cap would be exceeded", async function () {
      const { vault, agent, vendorA } = await networkHelpers.loadFixture(deployFixture);
      for (let i = 0; i < 5; i++) await vault.connect(agent).pay(vendorA.address, PER_PAYMENT, "m");
      expect(await vault.spentToday()).to.equal(DAILY);
      await expectRejected(vault, agent, vendorA.address, 1n, "OVER_DAILY_LIMIT");
    });

    it("rejects everything while paused, resumes after unpause", async function () {
      const { vault, agent, vendorA } = await networkHelpers.loadFixture(deployFixture);
      await expect(vault.setPaused(true)).to.emit(vault, "PausedSet").withArgs(true);
      await expectRejected(vault, agent, vendorA.address, USDC, "PAUSED");
      await vault.setPaused(false);
      await expect(vault.connect(agent).pay(vendorA.address, USDC, "m")).to.emit(vault, "Paid");
    });

    it("rejects zero amount and invalid recipients", async function () {
      const { vault, agent, vendorA } = await networkHelpers.loadFixture(deployFixture);
      await expectRejected(vault, agent, vendorA.address, 0n, "ZERO_AMOUNT");
      await expectRejected(vault, agent, ethers.ZeroAddress, USDC, "INVALID_RECIPIENT");
      await expectRejected(vault, agent, await vault.getAddress(), USDC, "INVALID_RECIPIENT");
    });

    it("rejects when the vault balance is too low", async function () {
      const { vault, owner, agent, vendorA } = await networkHelpers.loadFixture(deployFixture);
      await vault.withdraw(owner.address, await vault.balance());
      await expectRejected(vault, agent, vendorA.address, USDC, "INSUFFICIENT_BALANCE");
    });

    it("a rejected payment does not count toward the daily cap", async function () {
      const { vault, agent, vendorA, stranger } = await networkHelpers.loadFixture(deployFixture);
      await vault.connect(agent).pay(stranger.address, PER_PAYMENT, "m");
      await vault.connect(agent).pay(vendorA.address, PER_PAYMENT + 1n, "m");
      expect(await vault.spentToday()).to.equal(0n);
    });
  });

  describe("daily reset (time travel)", function () {
    it("resets 24h after the window opened, not before", async function () {
      const { vault, agent, vendorA } = await networkHelpers.loadFixture(deployFixture);
      const v = vault.connect(agent);
      for (let i = 0; i < 5; i++) await v.pay(vendorA.address, PER_PAYMENT, "m");
      const start = await vault.windowStart();

      // One second before the window closes: still blocked.
      await time.increaseTo(start + BigInt(DAY) - 2n); // next tx mines at +1
      await expect(v.pay(vendorA.address, USDC, "m")).to.emit(vault, "Rejected");

      // Window has closed: allowance is back.
      await time.increase(1);
      expect(await vault.spentToday()).to.equal(0n);
      await expect(v.pay(vendorA.address, PER_PAYMENT, "m")).to.emit(vault, "Paid");
      expect(await vault.spentToday()).to.equal(PER_PAYMENT);
      expect(await vault.windowStart()).to.be.greaterThan(start);
    });

    it("works across many days with hardhat_mine", async function () {
      const { vault, agent, vendorA } = await networkHelpers.loadFixture(deployFixture);
      const v = vault.connect(agent);
      for (let day = 0; day < 3; day++) {
        for (let i = 0; i < 5; i++) await v.pay(vendorA.address, PER_PAYMENT, "m");
        await expect(v.pay(vendorA.address, 1n, "m")).to.emit(vault, "Rejected");
        // Mine 2 blocks spaced a full day apart.
        await provider.request({ method: "hardhat_mine", params: ["0x2", `0x${DAY.toString(16)}`] });
      }
    });
  });

  describe("impersonation", function () {
    it("an impersonated external agent key obeys the same rules", async function () {
      const { vault, vendorA, stranger } = await networkHelpers.loadFixture(deployFixture);
      // An address with no Hardhat signer, as if the agent key lived only in the Python backend.
      const agentAddr = "0x000000000000000000000000000000000000a6e7";
      await vault.setAgent(agentAddr);
      await networkHelpers.impersonateAccount(agentAddr);
      await networkHelpers.setBalance(agentAddr, 10n ** 18n);
      const agent = await ethers.getSigner(agentAddr);

      await expect(vault.connect(agent).pay(vendorA.address, USDC, "ok")).to.emit(vault, "Paid");
      await expect(vault.connect(agent).pay(stranger.address, USDC, "attack"))
        .to.emit(vault, "Rejected")
        .withArgs(stranger.address, USDC, "NOT_ALLOWLISTED");
      // A hacked agent trying to drain: still capped.
      await expect(vault.connect(agent).pay(vendorA.address, 1000n * USDC, "drain"))
        .to.emit(vault, "Rejected")
        .withArgs(vendorA.address, 1000n * USDC, "OVER_PER_PAYMENT_LIMIT");
      await expect(vault.connect(agent).withdraw(agentAddr, USDC)).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount",
      );
      await networkHelpers.stopImpersonatingAccount(agentAddr);
    });
  });

  describe("randomized", function () {
    // Seeded PRNG so a failure can be reproduced exactly from the printed seed.
    function mulberry32(seed: number) {
      return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    it("2,000 random pay() calls never push spentToday over dailyLimit", async function () {
      this.timeout(10 * 60 * 1000);
      const { vault, usdc, agent, vendorA, vendorB, stranger, owner } = await networkHelpers.loadFixture(deployFixture);
      const seed = Number(process.env.SEED ?? Date.now() % 2 ** 31);
      console.log(`      seed=${seed}`);
      const rand = mulberry32(seed);
      const recipients = [vendorA.address, vendorB.address, stranger.address, owner.address, ethers.ZeroAddress];
      const allowed = new Set([vendorA.address, vendorB.address]);
      const v = vault.connect(agent);
      const startBalance = await vault.balance();
      let paidTotal = 0n;
      let paidCount = 0;

      for (let i = 0; i < 2000; i++) {
        const to = recipients[Math.floor(rand() * recipients.length)];
        // Mostly small amounts, sometimes far over the per-payment cap.
        const amount = BigInt(Math.floor(rand() * Number(3n * PER_PAYMENT)));
        const r = rand();
        if (r < 0.03) await time.increase(Math.floor(rand() * 2 * DAY));
        else if (r < 0.04) await vault.connect(owner).setPaused(!(await vault.paused()));

        const tx = await v.pay(to, amount, `r${i}`);
        const receipt = await tx.wait();
        const paid = receipt!.logs.some(l => vault.interface.parseLog(l)?.name === "Paid");
        if (paid) {
          paidTotal += amount;
          paidCount++;
          expect(allowed.has(to), `paid non-allowlisted ${to}`).to.equal(true);
          expect(amount <= PER_PAYMENT, `paid over cap ${amount}`).to.equal(true);
        }

        expect((await vault.spentToday()) <= DAILY, `spentToday > dailyLimit at call ${i}`).to.equal(true);
        expect((await vault.spentInWindow()) <= DAILY, `spentInWindow > dailyLimit at call ${i}`).to.equal(true);
      }

      // Money conservation: every token that left the vault is accounted for by a Paid event.
      expect(await vault.balance()).to.equal(startBalance - paidTotal);
      expect((await usdc.balanceOf(vendorA.address)) + (await usdc.balanceOf(vendorB.address))).to.equal(paidTotal);
      console.log(`      paid ${paidCount}/2000, total ${paidTotal / USDC} USDC`);
    });
  });
});
