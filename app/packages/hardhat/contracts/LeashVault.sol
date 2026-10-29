// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title LeashVault
/// @notice Holds a token for an AI agent. The agent can only call pay(); every rule is enforced here,
///         so a jailbroken or hacked agent can never move more than the owner allowed.
contract LeashVault is Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant WINDOW = 24 hours;

    IERC20 public immutable token;
    address public agent;

    uint256 public perPaymentLimit;
    uint256 public dailyLimit;
    bool public allowlistEnabled;
    bool public paused;
    mapping(address => bool) public allowed;

    uint256 public windowStart;
    uint256 public spentInWindow;

    event Paid(address indexed to, uint256 amount, string memo);
    event Rejected(address indexed to, uint256 amount, string reason);
    event AgentChanged(address indexed agent);
    event LimitsChanged(uint256 perPaymentLimit, uint256 dailyLimit);
    event AllowlistEnabled(bool enabled);
    event AllowlistUpdated(address indexed account, bool allowed);
    event PausedSet(bool paused);
    event Withdrawn(address indexed to, uint256 amount);

    error NotAgent();
    error InvalidAddress();

    constructor(
        IERC20 token_,
        address owner_,
        address agent_,
        uint256 perPaymentLimit_,
        uint256 dailyLimit_,
        bool allowlistEnabled_
    ) Ownable(owner_) {
        if (address(token_) == address(0) || agent_ == address(0)) revert InvalidAddress();
        // Owner and agent must be different keys, otherwise a stolen agent key could rewrite the rules.
        if (agent_ == owner_) revert InvalidAddress();
        token = token_;
        agent = agent_;
        perPaymentLimit = perPaymentLimit_;
        dailyLimit = dailyLimit_;
        allowlistEnabled = allowlistEnabled_;
    }

    // ---------------------------------------------------------------------
    // Agent
    // ---------------------------------------------------------------------

    /// @notice The only thing the agent can do. Returns false (and logs why) instead of reverting on a rule break.
    function pay(address to, uint256 amount, string calldata memo) external returns (bool) {
        // Wrong caller is not a policy question, it's an unauthorized call, so it reverts.
        if (msg.sender != agent) revert NotAgent();

        // Policy failures return false instead of reverting: a revert would erase the event,
        // and we want every blocked attempt recorded on-chain as evidence.
        if (paused) return _reject(to, amount, "PAUSED");
        if (to == address(0) || to == address(this)) return _reject(to, amount, "INVALID_RECIPIENT");
        if (amount == 0) return _reject(to, amount, "ZERO_AMOUNT");
        if (allowlistEnabled && !allowed[to]) return _reject(to, amount, "NOT_ALLOWLISTED");
        if (amount > perPaymentLimit) return _reject(to, amount, "OVER_PER_PAYMENT_LIMIT");

        // Window opens on the first payment after the previous one expired, and lasts 24h.
        // O(1) storage and gas, unlike a true sliding window which needs a list of past payments.
        bool expired = block.timestamp >= windowStart + WINDOW;
        uint256 spent = expired ? 0 : spentInWindow;
        if (spent + amount > dailyLimit) return _reject(to, amount, "OVER_DAILY_LIMIT");
        if (token.balanceOf(address(this)) < amount) return _reject(to, amount, "INSUFFICIENT_BALANCE");

        // Checks-effects-interactions: update accounting before the external token transfer.
        if (expired) windowStart = block.timestamp;
        spentInWindow = spent + amount;
        emit Paid(to, amount, memo);

        token.safeTransfer(to, amount);
        return true;
    }

    function _reject(address to, uint256 amount, string memory reason) private returns (bool) {
        emit Rejected(to, amount, reason);
        return false;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Amount spent in the current 24h window (0 if the window has expired).
    function spentToday() public view returns (uint256) {
        return block.timestamp >= windowStart + WINDOW ? 0 : spentInWindow;
    }

    function remainingToday() external view returns (uint256) {
        uint256 spent = spentToday();
        return spent >= dailyLimit ? 0 : dailyLimit - spent;
    }

    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    // ---------------------------------------------------------------------
    // Owner
    // ---------------------------------------------------------------------

    function setAgent(address agent_) external onlyOwner {
        if (agent_ == address(0) || agent_ == owner()) revert InvalidAddress();
        agent = agent_;
        emit AgentChanged(agent_);
    }

    function setLimits(uint256 perPaymentLimit_, uint256 dailyLimit_) external onlyOwner {
        perPaymentLimit = perPaymentLimit_;
        dailyLimit = dailyLimit_;
        emit LimitsChanged(perPaymentLimit_, dailyLimit_);
    }

    function setAllowlistEnabled(bool enabled) external onlyOwner {
        allowlistEnabled = enabled;
        emit AllowlistEnabled(enabled);
    }

    function setAllowed(address account, bool isAllowed) external onlyOwner {
        allowed[account] = isAllowed;
        emit AllowlistUpdated(account, isAllowed);
    }

    /// @notice Kill switch. Stops all agent payments until unpaused.
    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @notice Only the owner can take money out; the agent has no path to this.
    function withdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        emit Withdrawn(to, amount);
        token.safeTransfer(to, amount);
    }
}
