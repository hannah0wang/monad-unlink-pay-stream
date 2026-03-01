// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PayrollManager
/// @notice Employer USDC escrow. Executor calls executePay() on the scheduler's
///         behalf; executor then handles all Unlink private routing off-chain.
///
/// Privacy: no Unlink addresses, no employee PII stored on-chain.
///   On-chain: employeeId, employer address, rate, period, lastPaidAt.
///   Off-chain (executor DB): unlink addresses, bucket splits, mnemonic.
contract PayrollManager {
    using SafeERC20 for IERC20;

    /// @notice Token used for all payroll (set at deploy time, immutable).
    address public immutable USDC;

    struct Employee {
        address  employer;
        uint256  ratePerPeriod;   // token units (6 dec) per period
        uint256  periodSeconds;   // 3600 | 86400 | 604800 | 1209600
        uint256  lastPaidAt;      // unix timestamp of last executePay
        bool     active;
    }

    mapping(uint256 => Employee) public employees;
    mapping(address => uint256)  public payrollBalance; // employer → deposited tokens
    uint256 public nextEmployeeId;
    address public executor; // only address allowed to call executePay()

    event EmployeeRegistered(uint256 indexed id, address indexed employer, uint256 ratePerPeriod, uint256 periodSeconds);
    event PayrollFunded(address indexed employer, uint256 amount);
    event PayExecuted(uint256 indexed employeeId, uint256 amount);

    constructor(address _usdc, address _executor) {
        USDC     = _usdc;
        executor = _executor;
    }

    // ─── Employer actions ─────────────────────────────────────────────────────

    /// @notice Employer deposits tokens into the contract to cover future payroll.
    function fundPayroll(uint256 amount) external {
        IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        payrollBalance[msg.sender] += amount;
        emit PayrollFunded(msg.sender, amount);
    }

    /// @notice Register an employee. Returns the assigned employeeId.
    ///         No Unlink address stored on-chain — keep that in the executor DB.
    function registerEmployee(
        uint256 ratePerPeriod,
        uint256 periodSeconds
    ) external returns (uint256 id) {
        id = nextEmployeeId++;
        employees[id] = Employee({
            employer:      msg.sender,
            ratePerPeriod: ratePerPeriod,
            periodSeconds: periodSeconds,
            lastPaidAt:    0,
            active:        true
        });
        emit EmployeeRegistered(id, msg.sender, ratePerPeriod, periodSeconds);
    }

    /// @notice Employer deactivates an employee (stops future cycles).
    function deactivateEmployee(uint256 employeeId) external {
        require(employees[employeeId].employer == msg.sender, "not employer");
        employees[employeeId].active = false;
    }

    /// @notice Employer withdraws unused payroll balance.
    function withdrawPayroll(uint256 amount) external {
        require(payrollBalance[msg.sender] >= amount, "insufficient balance");
        payrollBalance[msg.sender] -= amount;
        IERC20(USDC).safeTransfer(msg.sender, amount);
    }

    // ─── Executor action ──────────────────────────────────────────────────────

    /// @notice Called by the executor when a pay period is due.
    ///         Transfers ratePerPeriod tokens to executor; executor handles
    ///         Unlink deposit + private bucket routing off-chain.
    function executePay(uint256 employeeId) external returns (uint256 amount) {
        require(msg.sender == executor, "only executor");

        Employee storage emp = employees[employeeId];
        require(emp.active, "inactive");
        require(block.timestamp >= emp.lastPaidAt + emp.periodSeconds, "not due yet");

        amount = emp.ratePerPeriod;
        require(payrollBalance[emp.employer] >= amount, "insufficient funds");

        emp.lastPaidAt = block.timestamp;
        payrollBalance[emp.employer] -= amount;

        IERC20(USDC).safeTransfer(executor, amount);
        emit PayExecuted(employeeId, amount);
    }
}
