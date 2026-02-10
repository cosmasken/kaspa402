#!/usr/bin/env node

import { Command } from 'commander';
import { AgentClient } from '@kaspa-agent-pay/agent-client';
import { KaspaRPC, globalMetrics, sompiToKas } from '@kaspa-agent-pay/core';
import chalk from 'chalk';
import ora from 'ora';
import 'dotenv/config';

const program = new Command();

program
    .name('kaspa-pay')
    .description('CLI tool for Kaspa Agent Pay')
    .version('0.1.0');

// Test payment command
program
    .command('test-payment')
    .description('Test a payment to a service')
    .option('-u, --url <url>', 'Service URL', 'http://localhost:3000/api/expensive-compute')
    .option('-k, --key <wif>', 'Private key (WIF format)', process.env.PRIVATE_KEY_WIF)
    .option('-n, --network <network>', 'Network (mainnet/testnet)', 'testnet')
    .option('-r, --rpc <url>', 'RPC URL', process.env.KASPA_RPC_URL || 'https://api-tn10.kaspa.org')
    .action(async (options) => {
        if (!options.key) {
            console.error(chalk.red('✗ Private key required. Use --key or set PRIVATE_KEY_WIF'));
            process.exit(1);
        }

        const spinner = ora('Initializing agent client...').start();

        try {
            const agent = await AgentClient.init({
                privateKeyWif: options.key,
                network: options.network,
                rpcUrl: options.rpc
            });

            spinner.text = 'Making request to service...';

            const response = await agent.paidRequest(options.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: 'CLI test',
                    data: [1, 2, 3, 4, 5]
                })
            });

            const result = await response.json();

            spinner.succeed(chalk.green('✓ Payment successful!'));
            console.log(chalk.cyan('\nResult:'));
            console.log(JSON.stringify(result, null, 2));
        } catch (error) {
            spinner.fail(chalk.red('✗ Payment failed'));
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
            process.exit(1);
        }
    });

// Check balance command
program
    .command('balance')
    .description('Check address balance')
    .option('-a, --address <address>', 'Kaspa address')
    .option('-k, --key <wif>', 'Private key (WIF format)', process.env.PRIVATE_KEY_WIF)
    .option('-r, --rpc <url>', 'RPC URL', process.env.KASPA_RPC_URL || 'https://api-tn10.kaspa.org')
    .action(async (options) => {
        const spinner = ora('Fetching balance...').start();

        try {
            const rpc = new KaspaRPC(options.rpc);

            let address = options.address;
            if (!address && options.key) {
                // Derive address from private key
                const { decodeWIF, getPublicKey, publicKeyToAddress } = await import('@kaspa-agent-pay/core');
                const privateKey = decodeWIF(options.key);
                const publicKey = getPublicKey(privateKey);
                address = publicKeyToAddress(publicKey, 'testnet');
            }

            if (!address) {
                spinner.fail(chalk.red('✗ Address or private key required'));
                process.exit(1);
            }

            const utxos = await rpc.getUtxosByAddress(address);

            let totalSompi = 0n;
            for (const utxo of utxos) {
                totalSompi += BigInt(utxo.amount);
            }

            spinner.succeed(chalk.green('✓ Balance fetched'));
            console.log(chalk.cyan('\nAddress:'), address);
            console.log(chalk.cyan('UTXOs:'), utxos.length);
            console.log(chalk.cyan('Balance:'), chalk.bold(sompiToKas(totalSompi)), 'KAS');
        } catch (error) {
            spinner.fail(chalk.red('✗ Failed to fetch balance'));
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
            process.exit(1);
        }
    });

// Verify transaction command
program
    .command('verify')
    .description('Verify a transaction')
    .requiredOption('-t, --txid <txid>', 'Transaction ID')
    .option('-r, --rpc <url>', 'RPC URL', process.env.KASPA_RPC_URL || 'https://api-tn10.kaspa.org')
    .action(async (options) => {
        const spinner = ora('Verifying transaction...').start();

        try {
            const rpc = new KaspaRPC(options.rpc);
            const tx = await rpc.getTransaction(options.txid);

            if (!tx) {
                spinner.fail(chalk.red('✗ Transaction not found'));
                process.exit(1);
            }

            spinner.succeed(chalk.green('✓ Transaction found'));
            console.log(chalk.cyan('\nTransaction ID:'), tx.txid);
            console.log(chalk.cyan('Accepted:'), tx.is_accepted ? chalk.green('Yes') : chalk.yellow('No'));
            console.log(chalk.cyan('Inputs:'), tx.inputs.length);
            console.log(chalk.cyan('Outputs:'), tx.outputs.length);

            console.log(chalk.cyan('\nOutputs:'));
            tx.outputs.forEach((output, i) => {
                console.log(`  ${i + 1}. ${sompiToKas(BigInt(output.amount))} KAS → ${output.scriptPublicKey.script}`);
            });
        } catch (error) {
            spinner.fail(chalk.red('✗ Verification failed'));
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
            process.exit(1);
        }
    });

// Metrics command
program
    .command('metrics')
    .description('Show payment metrics')
    .action(() => {
        const metrics = globalMetrics.getMetrics();

        console.log(chalk.cyan.bold('\n📊 Payment Metrics\n'));
        console.log(chalk.cyan('Total Payments:'), metrics.paymentsTotal);
        console.log(chalk.green('Successful:'), metrics.paymentsSuccessful);
        console.log(chalk.red('Failed:'), metrics.paymentsFailed);
        console.log(chalk.cyan('Success Rate:'), `${(globalMetrics.getSuccessRate() * 100).toFixed(2)}%`);
        console.log(chalk.cyan('Total Amount:'), `${metrics.totalAmountKas.toFixed(8)} KAS`);
        console.log(chalk.cyan('Avg Confirmation Time:'), `${metrics.averageConfirmationTimeMs.toFixed(0)}ms`);
        console.log(chalk.cyan('Active Payments:'), metrics.activePayments);
    });

program.parse();
