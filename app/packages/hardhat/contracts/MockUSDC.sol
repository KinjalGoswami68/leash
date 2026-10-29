// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Testnet-only stand-in for USDC. Anyone can mint; it has no value.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    // 6 decimals to match real USDC, so amounts in the UI and agent read the same as mainnet USDC would.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // Open mint is deliberate: it lets judges and arena players fund vaults without a faucet.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
