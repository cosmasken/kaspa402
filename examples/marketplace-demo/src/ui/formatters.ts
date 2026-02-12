/**
 * Formatting utilities for consistent output
 */

import chalk from 'chalk';
import boxen from 'boxen';

/**
 * Format KAS amount with 8 decimal places
 */
export function formatKAS(amount: string | number): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `${num.toFixed(8)} KAS`;
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Truncate Kaspa address for display
 */
export function formatAddress(address: string, prefixLen: number = 20, suffixLen: number = 6): string {
    if (address.length <= prefixLen + suffixLen + 3) {
        return address;
    }
    return `${address.substring(0, prefixLen)}...${address.substring(address.length - suffixLen)}`;
}

/**
 * Format transaction ID for display
 */
export function formatTxId(txid: string, prefixLen: number = 8, suffixLen: number = 4): string {
    if (txid.length <= prefixLen + suffixLen + 3) {
        return txid;
    }
    return `${txid.substring(0, prefixLen)}...${txid.substring(txid.length - suffixLen)}`;
}

/**
 * Format status with color
 */
export function formatStatus(success: boolean): string {
    return success ? chalk.green('✓') : chalk.red('✗');
}

/**
 * Create a bordered box for important information
 */
export function createBox(title: string, content: string, options?: Record<string, any>): string {
    return boxen(content, {
        title,
        titleAlignment: 'center',
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: 'double',
        borderColor: 'cyan',
        ...options
    });
}

/**
 * Create a simple header
 */
export function createHeader(title: string, subtitle?: string): string {
    const separator = '═'.repeat(70);
    let header = `╔${separator}╗\n`;
    header += `║${title.padStart((70 + title.length) / 2).padEnd(70)}║\n`;
    if (subtitle) {
        header += `║${subtitle.padStart((70 + subtitle.length) / 2).padEnd(70)}║\n`;
    }
    header += `╚${separator}╝`;
    return header;
}

/**
 * Format a bullet list item
 */
export function bullet(text: string, symbol: string = '•'): string {
    return `  ${symbol} ${text}`;
}

/**
 * Format a key-value pair
 */
export function keyValue(key: string, value: string, keyWidth: number = 20): string {
    return `  ${key.padEnd(keyWidth)}: ${value}`;
}
