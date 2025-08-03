import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther, keccak256, encodePacked } from "viem";

describe("NearEscrow", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployEscrowFixture() {
    const [owner, maker, taker, treasury] = await hre.viem.getWalletClients();

    // Deploy a mock ERC20 token for testing
    const mockToken = await hre.viem.deployContract("MockERC20", [
      "Test Token",
      "TEST",
      parseEther("1000000") // 1M tokens
    ]);

    // Mint tokens to maker for testing
    await mockToken.write.mint([maker.account.address, parseEther("10000")]);

    const rescueDelaySrc = 86400; // 1 day
    const rescueDelayDst = 86400; // 1 day
    const creationFee = parseEther("0.001"); // 0.001 ETH
    
    const nearConfig = {
      minConfirmations: 5n,
      dustThreshold: 1000n,
      maxAmount: parseEther("100000")
    };

    // Deploy NearEscrowFactory
    const factory = await hre.viem.deployContract("NearEscrowFactory", [
      mockToken.address,
      owner.account.address,
      rescueDelaySrc,
      rescueDelayDst,
      creationFee,
      treasury.account.address,
      nearConfig
    ]);

    // Get implementation addresses
    const srcImplementation = await factory.read.Near_ESCROW_SRC_IMPLEMENTATION();
    const dstImplementation = await factory.read.Near_ESCROW_DST_IMPLEMENTATION();

    const publicClient = await hre.viem.getPublicClient();

    // Sample immutables for testing
    const currentTime = await time.latest();
    const secret = keccak256(encodePacked(["string"], ["test-secret"]));
    const hashlock = keccak256(encodePacked(["bytes32"], [secret]));
    
    const timelocks = BigInt(currentTime + 3600) << 224n | // deployedAt (1 hour from now)
                     3600n << 168n |                      // withdrawal (1 hour)
                     7200n << 112n |                      // publicWithdrawal (2 hours)
                     10800n << 56n;                       // cancellation (3 hours)

    const sampleImmutables = {
      orderHash: keccak256(encodePacked(["string"], ["test-order"])),
      hashlock,
      maker: BigInt(maker.account.address),
      taker: BigInt(taker.account.address),
      token: 0n, // ETH
      amount: parseEther("1"),
      safetyDeposit: parseEther("0.1"),
      timelocks
    };

    return {
      factory,
      mockToken,
      srcImplementation,
      dstImplementation,
      owner,
      maker,
      taker,
      treasury,
      publicClient,
      sampleImmutables,
      secret,
      hashlock,
      creationFee
    };
  }

  describe("Factory Deployment", function () {
    it("Should deploy NearEscrowFactory correctly", async function () {
      const { factory, owner, treasury, mockToken } = await loadFixture(deployEscrowFixture);

      expect(await factory.read.owner()).to.equal(getAddress(owner.account.address));
      expect(await factory.read.treasury()).to.equal(getAddress(treasury.account.address));
      expect(await factory.read.ACCESS_TOKEN()).to.equal(getAddress(mockToken.address));
    });

    it("Should have valid implementation addresses", async function () {
      const { srcImplementation, dstImplementation } = await loadFixture(deployEscrowFixture);

      expect(srcImplementation).to.not.equal("0x0000000000000000000000000000000000000000");
      expect(dstImplementation).to.not.equal("0x0000000000000000000000000000000000000000");
    });

    it("Should set creation fee correctly", async function () {
      const { factory, creationFee } = await loadFixture(deployEscrowFixture);

      expect(await factory.read.creationFee()).to.equal(creationFee);
    });
  });

  describe("Escrow Source (EVM→Near)", function () {
    it("Should create source escrow with ETH", async function () {
      const { factory, sampleImmutables, creationFee, maker } = await loadFixture(deployEscrowFixture);

      const totalRequired = sampleImmutables.amount + sampleImmutables.safetyDeposit + creationFee;

      await expect(
        factory.write.createSrcEscrow([sampleImmutables], {
          value: totalRequired,
          account: maker.account
        })
      ).to.not.be.rejected;
    });

    it("Should revert if insufficient ETH sent", async function () {
      const { factory, sampleImmutables, maker } = await loadFixture(deployEscrowFixture);

      const insufficientAmount = parseEther("0.5"); // Less than required

      await expect(
        factory.write.createSrcEscrow([sampleImmutables], {
          value: insufficientAmount,
          account: maker.account
        })
      ).to.be.rejected;
    });
  });

  describe("Escrow Destination (Near→EVM)", function () {
    it("Should create destination escrow with ETH", async function () {
      const { factory, sampleImmutables, creationFee, maker } = await loadFixture(deployEscrowFixture);

      const totalRequired = sampleImmutables.amount + sampleImmutables.safetyDeposit + creationFee;

      await expect(
        factory.write.createDstEscrow([sampleImmutables], {
          value: totalRequired,
          account: maker.account
        })
      ).to.not.be.rejected;
    });

    it("Should create destination escrow with ERC20 tokens", async function () {
      const { factory, sampleImmutables, mockToken, creationFee, maker } = await loadFixture(deployEscrowFixture);

      // Update immutables to use ERC20 token
      const tokenImmutables = {
        ...sampleImmutables,
        token: BigInt(mockToken.address)
      };

      // Approve tokens first
      await mockToken.write.approve([factory.address, sampleImmutables.amount], {
        account: maker.account
      });

      const totalRequired = sampleImmutables.safetyDeposit + creationFee;

      await expect(
        factory.write.createDstEscrow([tokenImmutables], {
          value: totalRequired,
          account: maker.account
        })
      ).to.not.be.rejected;
    });
  });

  describe("Access Control", function () {
    it("Should only allow owner to update creation fee", async function () {
      const { factory, owner, maker } = await loadFixture(deployEscrowFixture);

      const newFee = parseEther("0.002");

      // Should work for owner
      await expect(
        factory.write.setCreationFee([newFee], { account: owner.account })
      ).to.not.be.rejected;

      // Should revert for non-owner
      await expect(
        factory.write.setCreationFee([newFee], { account: maker.account })
      ).to.be.rejected;
    });

    it("Should only allow owner to update treasury", async function () {
      const { factory, owner, maker, taker } = await loadFixture(deployEscrowFixture);

      // Should work for owner
      await expect(
        factory.write.setTreasury([taker.account.address], { account: owner.account })
      ).to.not.be.rejected;

      // Should revert for non-owner
      await expect(
        factory.write.setTreasury([taker.account.address], { account: maker.account })
      ).to.be.rejected;
    });
  });
});
