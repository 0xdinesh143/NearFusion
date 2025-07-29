// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { AddressLib, Address } from "./libraries/AddressLib.sol";
import { Timelocks, TimelocksLib } from "./libraries/TimelocksLib.sol";

import { IBaseEscrow } from "./interfaces/IBaseEscrow.sol";
import { BaseEscrow } from "./BaseEscrow.sol";
import { Escrow } from "./Escrow.sol";

/**
 * @title Near Destination Escrow for Near→EVM atomic swaps
 * @notice Escrow contract for Near→EVM swaps - holds ERC20/ETH, releases on secret reveal
 * @dev Used when Near is the source and EVM tokens are the destination
 * @custom:security-contact security@atomicswap.io
 */
contract NearEscrowDst is Escrow {
    using SafeERC20 for IERC20;
    using AddressLib for Address;
    using TimelocksLib for Timelocks;

    /// @notice Near transaction hash for verification (optional)
    mapping(bytes32 => string) public NearTxHashes;

    /// @notice Near addresses for verification (optional)
    mapping(bytes32 => string) public NearAddresses;

    event NearTxHashRecorded(bytes32 indexed hashlock, string NearTxHash);
    event NearAddressRecorded(bytes32 indexed hashlock, string NearAddress);

    constructor(uint32 rescueDelay, IERC20 accessToken) BaseEscrow(rescueDelay, accessToken) {}

    // Allow contract to receive ETH
    receive() external payable {}

    /**
     * @notice Private withdrawal by maker using secret
     * @dev Maker reveals secret to claim EVM tokens after providing Near
     * @param secret The secret that matches the hashlock
     * @param immutables The escrow immutables
     */
    function withdraw(bytes32 secret, Immutables calldata immutables)
        external
        override
        onlyValidImmutables(immutables)
        onlyValidSecret(secret, immutables)
        onlyAfter(immutables.timelocks.get(TimelocksLib.Stage.DstWithdrawal))
        onlyBefore(immutables.timelocks.get(TimelocksLib.Stage.DstCancellation))
    {
        // Allow both maker and taker to withdraw in private period
        if (msg.sender != immutables.maker.get() && msg.sender != immutables.taker.get()) {
            revert InvalidCaller();
        }

        _withdraw(secret, immutables);
    }

    /**
     * @notice Public withdrawal by anyone with access token
     * @dev Anyone with access token can trigger withdrawal in public period
     * @param secret The secret that matches the hashlock
     * @param immutables The escrow immutables
     */
    function publicWithdraw(bytes32 secret, Immutables calldata immutables)
        external
        onlyAccessTokenHolder()
        onlyValidImmutables(immutables)
        onlyValidSecret(secret, immutables)
        onlyAfter(immutables.timelocks.get(TimelocksLib.Stage.DstPublicWithdrawal))
        onlyBefore(immutables.timelocks.get(TimelocksLib.Stage.DstCancellation))
    {
        _withdraw(secret, immutables);
    }

    /**
     * @notice Cancels escrow and returns funds to taker
     * @dev Can only be called after cancellation period starts
     * @param immutables The escrow immutables
     */
    function cancel(Immutables calldata immutables)
        external
        override
        onlyTaker(immutables)
        onlyValidImmutables(immutables)
        onlyAfter(immutables.timelocks.get(TimelocksLib.Stage.DstCancellation))
    {
        // Return tokens to taker
        _uniTransfer(immutables.token.get(), immutables.taker.get(), immutables.amount);
        // Return safety deposit to taker
        _ethTransfer(immutables.taker.get(), immutables.safetyDeposit);
        
        emit EscrowCancelled();
    }

    /**
     * @notice Records Near transaction hash for verification
     * @dev Optional function to link Near transaction to escrow
     * @param hashlock The escrow hashlock
     * @param NearTxHash The Near transaction hash
     * @param immutables The escrow immutables
     */
    function recordNearTx(
        bytes32 hashlock,
        string calldata NearTxHash,
        Immutables calldata immutables
    )
        external
        onlyValidImmutables(immutables)
    {
        // Only maker or taker can record Near tx
        if (msg.sender != immutables.maker.get() && msg.sender != immutables.taker.get()) {
            revert InvalidCaller();
        }

        NearTxHashes[hashlock] = NearTxHash;
        emit NearTxHashRecorded(hashlock, NearTxHash);
    }

    /**
     * @notice Records Near address for verification
     * @dev Optional function to link Near address to escrow
     * @param hashlock The escrow hashlock
     * @param NearAddress The Near address
     * @param immutables The escrow immutables
     */
    function recordNearAddress(
        bytes32 hashlock,
        string calldata NearAddress,
        Immutables calldata immutables
    )
        external
        onlyValidImmutables(immutables)
    {
        // Only maker or taker can record Near address
        if (msg.sender != immutables.maker.get() && msg.sender != immutables.taker.get()) {
            revert InvalidCaller();
        }

        NearAddresses[hashlock] = NearAddress;
        emit NearAddressRecorded(hashlock, NearAddress);
    }

    /**
     * @notice Gets recorded Near transaction hash
     * @param hashlock The escrow hashlock
     * @return The Near transaction hash
     */
    function getNearTxHash(bytes32 hashlock) external view returns (string memory) {
        return NearTxHashes[hashlock];
    }

    /**
     * @notice Gets recorded Near address
     * @param hashlock The escrow hashlock
     * @return The Near address
     */
    function getNearAddress(bytes32 hashlock) external view returns (string memory) {
        return NearAddresses[hashlock];
    }

    /**
     * @dev Internal withdrawal logic
     * @param secret The secret that unlocks the escrow
     * @param immutables The escrow immutables
     */
    function _withdraw(bytes32 secret, Immutables calldata immutables) internal {
        // Transfer tokens to maker
        _uniTransfer(immutables.token.get(), immutables.maker.get(), immutables.amount);
        
        // Return safety deposit to taker
        _ethTransfer(immutables.taker.get(), immutables.safetyDeposit);
        
        emit EscrowWithdrawal(secret);
    }
} 