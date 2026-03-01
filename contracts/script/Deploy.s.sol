// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PayrollManager} from "../src/PayrollManager.sol";

/// @notice Deploy PayrollManager to Monad testnet.
///
///         Required env vars:
///           PRIVATE_KEY        — deployer / employer private key
///           EXECUTOR_ADDRESS   — executor service EOA
///           USDC_ADDRESS       — token address (USDCm: 0xc4fB617E4E4CfbdEb07216dFF62B4E46a2D6FdF6)
///
///         Run:
///           forge script script/Deploy.s.sol \
///             --rpc-url $MONAD_RPC_URL \
///             --broadcast
contract Deploy is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("PRIVATE_KEY");
        address deployer     = vm.addr(deployerKey);
        address executorAddr = vm.envAddress("EXECUTOR_ADDRESS");
        address usdcAddr     = vm.envAddress("USDC_ADDRESS");

        console.log("Deploying from:", deployer);
        console.log("Executor:      ", executorAddr);
        console.log("Token (USDC):  ", usdcAddr);

        vm.startBroadcast(deployerKey);
        PayrollManager payroll = new PayrollManager(usdcAddr, executorAddr);
        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("PAYROLL_MANAGER_ADDRESS=%s", address(payroll));
        console.log("USDC_ADDRESS=%s", usdcAddr);
        console.log("EXECUTOR_ADDRESS=%s", executorAddr);
        console.log("\nNext: copy these into executor/.env and app/.env.local");
    }
}
