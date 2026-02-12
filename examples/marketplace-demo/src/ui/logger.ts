/**
 * Centralized logging utility with levels and formatting
 */

import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error';

class Logger {
    private level: LogLevel;
    private levelPriority: Record<LogLevel, number> = {
        debug: 0,
        info: 1,
        success: 1,
        warn: 2,
        error: 3
    };

    constructor() {
        const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
        this.level = this.levelPriority[envLevel] !== undefined ? envLevel : 'info';
    }

    private shouldLog(level: LogLevel): boolean {
        return this.levelPriority[level] >= this.levelPriority[this.level];
    }

    debug(message: string, ...args: any[]): void {
        if (this.shouldLog('debug')) {
            console.log(chalk.dim(`[DEBUG] ${message}`), ...args);
        }
    }

    info(message: string, ...args: any[]): void {
        if (this.shouldLog('info')) {
            console.log(message, ...args);
        }
    }

    success(message: string, ...args: any[]): void {
        if (this.shouldLog('success')) {
            console.log(chalk.green(`✓ ${message}`), ...args);
        }
    }

    warn(message: string, ...args: any[]): void {
        if (this.shouldLog('warn')) {
            console.log(chalk.yellow(`⚠ ${message}`), ...args);
        }
    }

    error(message: string, ...args: any[]): void {
        if (this.shouldLog('error')) {
            console.error(chalk.red(`✗ ${message}`), ...args);
        }
    }

    // Specialized loggers
    step(current: number, total: number, message: string): void {
        if (this.shouldLog('info')) {
            console.log(chalk.cyan(`[${current}/${total}]`) + ` ${message}`);
        }
    }

    section(title: string): void {
        if (this.shouldLog('info')) {
            console.log('');
            console.log(chalk.bold(title));
        }
    }

    separator(char: string = '=', length: number = 70): void {
        if (this.shouldLog('info')) {
            console.log(char.repeat(length));
        }
    }

    blank(): void {
        if (this.shouldLog('info')) {
            console.log('');
        }
    }

    getLevel(): LogLevel {
        return this.level;
    }

    isDebug(): boolean {
        return this.level === 'debug';
    }
}

// Singleton instance
export const logger = new Logger();
