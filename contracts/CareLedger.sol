// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Append-only commitments. No patient identifiers or medical data belong on-chain.
contract CareLedger {
    address public immutable operator;
    mapping(bytes32 => bytes32) public commitments;
    uint256 public eventCount;
    event Anchored(bytes32 indexed eventId, bytes32 digest, uint256 indexed sequence);
    error Unauthorized();
    error InvalidCommitment();
    error AlreadyAnchored();
    constructor() { operator = msg.sender; }
    function anchor(bytes32 eventId, bytes32 digest) external {
        if (msg.sender != operator) revert Unauthorized();
        if (eventId == bytes32(0) || digest == bytes32(0)) revert InvalidCommitment();
        if (commitments[eventId] != bytes32(0)) revert AlreadyAnchored();
        commitments[eventId] = digest;
        emit Anchored(eventId, digest, ++eventCount);
    }
}
