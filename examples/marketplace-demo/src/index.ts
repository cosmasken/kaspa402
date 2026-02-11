/**
 * AI Agent Marketplace Demo
 * Demonstrates autonomous agent-to-agent service discovery and payment
 */

import { AgentClient } from '@kaspa-agent-pay/agent-client';
import { OrchestratorAgent, SubTask } from './orchestrator.js';
import dotenv from 'dotenv';
import chalk from 'chalk';
import Table from 'cli-table3';
import { logger } from './ui/logger.js';
import { createSpinner } from './ui/progress.js';
import { formatKAS, formatDuration, formatAddress, createHeader, bullet } from './ui/formatters.js';

dotenv.config();

const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:5000';
const BUDGET_KAS = process.env.ORCHESTRATOR_BUDGET_KAS || '100';
const WALLET_PATH = process.env.ORCHESTRATOR_WALLET_PATH || './wallets/orchestrator.json';

async function main() {
    logger.blank();
    console.log(createHeader(
        'AI Agent Marketplace Demo',
        'Autonomous Agent-to-Agent Service Discovery & Payment'
    ));
    logger.blank();

    // Initialize agent client
    logger.step(1, 5, 'Initializing orchestrator agent');
    const agentClient = await AgentClient.init({
        network: (process.env.KASPA_NETWORK as any) || 'testnet',
        rpcUrl: process.env.KASPA_RPC_URL || 'https://api-tn10.kaspa.org',
        walletPersistPath: WALLET_PATH,
        privateKeyWif: process.env.PRIVATE_KEY_WIF
    });

    logger.success(`Wallet loaded: ${chalk.cyan(formatAddress(agentClient.agentAddress))}`);

    // Check balance
    const spinner = createSpinner('Checking wallet balance...');
    spinner.start();
    const balance = await agentClient.checkBalance();
    spinner.succeed(`Balance: ${chalk.green(formatKAS(balance.kas))}`);
    logger.blank();

    // Calculate required amount for demo
    const estimatedCost = 35; // Based on service chain costs: 10.0 + 5.0 + 20.0
    const recommendedAmount = 50; // Give some buffer
    const requiredAmount = parseFloat(balance.kas) < estimatedCost ? recommendedAmount : 0;

    if (requiredAmount > 0) {
        logger.separator('=');
        console.log(chalk.bold.yellow('💰 WALLET FUNDING REQUIRED'));
        logger.separator('=');
        logger.blank();
        logger.info('This demo will execute a 3-service chain with the following costs:');
        logger.blank();
        logger.info(bullet('Data Processor → 10.00000000 KAS (fixed pricing)'));
        logger.info('     Transforms and normalizes customer data');
        logger.blank();
        logger.info(bullet('Validator → 5.00000000 KAS (outcome-based)'));
        logger.info('     Validates email addresses and required fields');
        logger.info('     Note: Only charges if validation passes');
        logger.blank();
        logger.info(bullet('Analyzer → 20.00000000 KAS (tiered - basic)'));
        logger.info('     Generates statistical insights');
        logger.blank();
        logger.separator('-');
        logger.info(`  Estimated Total → ~${estimatedCost.toFixed(8)} KAS`);
        logger.separator('=');
        logger.blank();
        logger.info(`📍 Your Wallet Address:`);
        logger.info(`   ${agentClient.agentAddress}`);
        logger.blank();
        logger.info(`💵 Recommended Amount: ${recommendedAmount} KAS (includes buffer)`);
        logger.blank();
        logger.info('🌐 Get Testnet Funds:');
        logger.info('   https://faucet.kaspanet.io/');
        logger.blank();
        logger.info('⏱️  After funding, wait ~2 seconds for confirmation');
        logger.blank();
        logger.separator('=');
        logger.blank();

        await agentClient.waitForFunding(true);

        // Re-check balance after funding
        const newBalance = await agentClient.checkBalance();
        logger.blank();
        logger.success(`Wallet funded! New balance: ${formatKAS(newBalance.kas)}`);
        logger.blank();
    } else {
        logger.success(`Sufficient balance: ${formatKAS(balance.kas)} (estimated: ~${formatKAS(estimatedCost)})`);
        logger.blank();
    }

    logger.info(`Budget: ${chalk.cyan(formatKAS(BUDGET_KAS))}`);
    logger.blank();

    // Initialize orchestrator
    const orchestrator = new OrchestratorAgent({
        registryUrl: REGISTRY_URL,
        budget: BUDGET_KAS,
        agentClient
    });

    // Define the task
    logger.separator('=');
    console.log(chalk.bold('Customer Data Enrichment Pipeline'));
    logger.separator('=');
    logger.blank();
    logger.info('Processing 4 customer records through 3 services');
    logger.blank();

    const customerData = [
        { name: 'Alice Johnson', email: 'alice@example.com', purchases: 15, totalSpent: 1250.50 },
        { name: 'Bob Smith', email: 'bob@example.com', purchases: 8, totalSpent: 680.25 },
        { name: 'Carol White', email: 'carol@example.com', purchases: 22, totalSpent: 2100.75 },
        { name: 'David Brown', email: 'david@example.com', purchases: 5, totalSpent: 320.00 }
    ];

    // Only show input data in debug mode
    if (logger.isDebug()) {
        logger.info('Input Data:');
        console.log(JSON.stringify(customerData, null, 2));
        logger.blank();
    }

    // Define subtasks
    const subtasks: SubTask[] = [
        {
            id: 'task1',
            capability: 'data-processing',
            input: {
                operation: 'transform',
                data: customerData,
                config: { preserveCase: false }
            }
        },
        {
            id: 'task2',
            capability: 'data-validation',
            input: {
                data: null, // Will be replaced with previous output
                schema: 'custom',
                rules: [
                    { field: 'email', type: 'email' },
                    { field: 'name', type: 'required' },
                    { field: 'purchases', type: 'number' }
                ]
            },
            dependsOn: ['task1']
        },
        {
            id: 'task3',
            capability: 'data-analysis',
            input: {
                data: null, // Will be replaced with previous output
                analysisType: 'statistics',
                tier: 'basic'
            },
            dependsOn: ['task2']
        }
    ];

    try {
        // Discover services
        logger.step(2, 5, 'Discovering services');
        const capabilities = ['data-processing', 'data-validation', 'data-analysis'];

        for (const capability of capabilities) {
            const services = await orchestrator.discoverServices(capability);
            logger.success(`Found ${services.length} service(s) for ${capability}`);
        }
        logger.blank();

        // Plan service chain
        logger.step(3, 5, 'Planning service chain');
        const plan = await orchestrator.planServices(subtasks);

        logger.success(`Selected ${plan.services.length} services (estimated: ${formatKAS((Number(plan.totalCost) / 100_000_000).toFixed(8))})`);
        for (const service of plan.services) {
            const cost = orchestrator['estimateServiceCost'](
                { pricing: service.pricing } as any,
                service.input
            );
            logger.info(bullet(`${service.serviceName} → ${formatKAS(cost)}`));
        }
        logger.blank();

        // Check budget
        if (!orchestrator.checkBudget(plan)) {
            const totalCostKAS = (Number(plan.totalCost) / 100_000_000).toFixed(8);
            throw new Error(`Task exceeds budget! Required: ${totalCostKAS} KAS, Available: ${BUDGET_KAS} KAS`);
        }

        // Execute service chain
        logger.step(4, 5, 'Executing service chain');
        const startTime = Date.now();
        const results = await orchestrator.executeServiceChain(plan);
        const executionTime = Date.now() - startTime;

        logger.blank();
        logger.step(5, 5, 'Task completed');
        logger.blank();

        // Display results in a table
        logger.separator('=');
        console.log(chalk.bold('Results Summary'));
        logger.separator('=');
        logger.blank();

        const table = new Table({
            head: [
                chalk.cyan('Service'),
                chalk.cyan('Status'),
                chalk.cyan('Time'),
                chalk.cyan('Cost')
            ],
            colWidths: [20, 10, 15, 15]
        });

        let totalCost = 0;
        for (const result of results) {
            const status = result.success ? chalk.green('✓') : chalk.red('✗');
            const time = formatDuration(result.responseTimeMs);
            const cost = formatKAS(result.cost || '0');
            
            table.push([
                result.serviceName,
                status,
                time,
                cost
            ]);

            totalCost += parseFloat(result.cost || '0');
        }

        console.log(table.toString());
        logger.blank();

        logger.separator('-');
        logger.info(`Total Cost: ${chalk.green(formatKAS(totalCost.toFixed(8)))}`);
        logger.info(`Execution Time: ${chalk.cyan(formatDuration(executionTime))}`);
        logger.info(`Remaining Budget: ${chalk.green(formatKAS(orchestrator.getRemainingBudget(totalCost.toFixed(8))))}`);
        logger.separator('-');
        logger.blank();

        logger.success('Demo completed successfully!');
        logger.blank();

        // Transaction details section
        logger.separator('=');
        console.log(chalk.bold('Payment Transactions'));
        logger.separator('=');
        logger.blank();

        const paidServices = results.filter(r => r.txid);
        if (paidServices.length > 0) {
            logger.info('Verify these transactions on the Kaspa blockchain:');
            logger.blank();

            for (const result of paidServices) {
                logger.info(chalk.bold(`${result.serviceName}:`));
                logger.info(`  Amount: ${chalk.green(formatKAS(result.cost || '0'))}`);
                logger.info(`  To: ${chalk.cyan(formatAddress(result.recipientAddress || 'unknown'))}`);
                logger.info(`  TX: ${chalk.yellow(result.txid || 'unknown')}`);
                logger.info(`  🔍 https://explorer-tn10.kaspa.org/txs/${result.txid}`);
                logger.blank();
            }
        } else {
            logger.info('No payments were made (all services failed or used outcome-based pricing).');
            logger.blank();
        }

        logger.separator('=');
        logger.blank();

        // What you just tested section
        logger.separator('=');
        console.log(chalk.bold('What You Just Tested'));
        logger.separator('=');
        logger.blank();

        logger.success('Autonomous Service Discovery');
        logger.success('HTTP 402 Payment Protocol');
        logger.success('Service Composition');
        logger.success('Multiple Pricing Models');
        logger.blank();

        logger.info(`💰 Orchestrator: ${chalk.cyan(formatAddress(agentClient.agentAddress))}`);
        logger.info(`   🔍 https://explorer-tn10.kaspa.org/addresses/${agentClient.agentAddress}?page=1`);
        logger.blank();

        logger.info('🔍 View transactions: https://explorer-tn10.kaspa.org/');
        logger.info('📊 Service metrics: curl http://localhost:5000/registry/services | jq');
        logger.blank();

        logger.separator('=');
        logger.blank();

    } catch (error) {
        logger.blank();
        logger.separator('=');
        logger.error('Error executing task:');
        console.error(error);
        logger.separator('=');
        logger.blank();
        process.exit(1);
    }
}

// Run the demo
main().catch(error => {
    logger.error('Fatal error:');
    console.error(error);
    process.exit(1);
});
