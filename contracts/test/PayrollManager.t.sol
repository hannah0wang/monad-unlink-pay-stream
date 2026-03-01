// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PayrollManager} from "../src/PayrollManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal ERC-20 mock used in place of USDCm during tests.
contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: balance");
        require(allowance[from][msg.sender] >= amount, "ERC20: allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PayrollManagerTest is Test {
    PayrollManager payroll;
    MockERC20      token;

    address employer = address(0xA1);
    address executor = address(0xA2);
    address other    = address(0xA3);

    uint256 constant RATE   = 100e6;   // 100 tokens per period
    uint256 constant PERIOD = 86_400;  // daily

    function setUp() public {
        token   = new MockERC20();
        payroll = new PayrollManager(address(token), executor);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _fund(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.prank(who);
        token.approve(address(payroll), amount);
    }

    function _register() internal returns (uint256 id) {
        vm.prank(employer);
        id = payroll.registerEmployee(RATE, PERIOD);
    }

    // ─── Tests ────────────────────────────────────────────────────────────────

    function test_fundPayroll() public {
        _fund(employer, 1000e6);
        vm.prank(employer);
        payroll.fundPayroll(1000e6);

        assertEq(payroll.payrollBalance(employer), 1000e6);
        assertEq(token.balanceOf(address(payroll)), 1000e6);
    }

    function test_registerEmployee() public {
        uint256 id = _register();
        assertEq(id, 0);
        assertEq(payroll.nextEmployeeId(), 1);

        (address emp, uint256 rate, uint256 period, uint256 lastPaid, bool active) =
            payroll.employees(id);

        assertEq(emp,     employer);
        assertEq(rate,    RATE);
        assertEq(period,  PERIOD);
        assertEq(lastPaid, 0);
        assertTrue(active);
    }

    function test_executePay() public {
        uint256 id = _register();

        _fund(employer, RATE * 3);
        vm.prank(employer);
        payroll.fundPayroll(RATE * 3);

        vm.warp(block.timestamp + PERIOD + 1);

        uint256 before = token.balanceOf(executor);
        vm.prank(executor);
        uint256 paid = payroll.executePay(id);

        assertEq(paid, RATE);
        assertEq(token.balanceOf(executor), before + RATE);
        assertEq(payroll.payrollBalance(employer), RATE * 2);
    }

    function test_executePay_notDue() public {
        uint256 id = _register();
        _fund(employer, RATE);
        vm.prank(employer);
        payroll.fundPayroll(RATE);

        vm.warp(PERIOD - 1); // just before due

        vm.prank(executor);
        vm.expectRevert("not due yet");
        payroll.executePay(id);
    }

    function test_executePay_insufficientFunds() public {
        uint256 id = _register();
        _fund(employer, 50e6); // only 50, rate is 100
        vm.prank(employer);
        payroll.fundPayroll(50e6);

        vm.warp(block.timestamp + PERIOD + 1);

        vm.prank(executor);
        vm.expectRevert("insufficient funds");
        payroll.executePay(id);
    }

    function test_executePay_onlyExecutor() public {
        uint256 id = _register();
        _fund(employer, RATE);
        vm.prank(employer);
        payroll.fundPayroll(RATE);

        vm.warp(block.timestamp + PERIOD + 1);

        vm.prank(other);
        vm.expectRevert("only executor");
        payroll.executePay(id);
    }

    function test_withdrawPayroll() public {
        _fund(employer, 500e6);
        vm.startPrank(employer);
        payroll.fundPayroll(500e6);
        payroll.withdrawPayroll(500e6);
        vm.stopPrank();

        assertEq(payroll.payrollBalance(employer), 0);
        assertEq(token.balanceOf(employer), 500e6);
    }

    function test_deactivateEmployee() public {
        uint256 id = _register();
        _fund(employer, RATE);
        vm.prank(employer);
        payroll.fundPayroll(RATE);

        vm.prank(employer);
        payroll.deactivateEmployee(id);

        vm.warp(block.timestamp + PERIOD + 1);

        vm.prank(executor);
        vm.expectRevert("inactive");
        payroll.executePay(id);
    }
}
