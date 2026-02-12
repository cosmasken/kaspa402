/**
 * Progress indicators and spinners
 */

import ora, { Ora } from 'ora';
import chalk from 'chalk';

/**
 * Create a spinner for async operations
 */
export function createSpinner(text: string): Ora {
    return ora({
        text,
        color: 'cyan',
        spinner: 'dots'
    });
}

/**
 * Progress tracker for multi-step operations
 */
export class StepProgress {
    private current: number = 0;
    private total: number;
    private steps: Map<number, string> = new Map();

    constructor(total: number) {
        this.total = total;
    }

    start(step: number, description: string): void {
        this.current = step;
        this.steps.set(step, description);
    }

    complete(step: number): void {
        if (this.steps.has(step)) {
            this.steps.set(step, this.steps.get(step)! + ' ✓');
        }
    }

    getCurrentStep(): number {
        return this.current;
    }

    getTotal(): number {
        return this.total;
    }

    getProgress(): string {
        return `[${this.current}/${this.total}]`;
    }
}

/**
 * Service call tracker with spinner
 */
export class ServiceCallTracker {
    private spinner: Ora | null = null;
    private serviceName: string = '';
    private startTime: number = 0;

    start(serviceName: string): void {
        this.serviceName = serviceName;
        this.startTime = Date.now();
        this.spinner = createSpinner(`Calling ${serviceName}...`);
        this.spinner.start();
    }

    updatePayment(amount: string): void {
        if (this.spinner) {
            this.spinner.text = `Calling ${this.serviceName} (sending ${amount})...`;
        }
    }

    updateConfirmation(): void {
        if (this.spinner) {
            this.spinner.text = `Calling ${this.serviceName} (confirming payment)...`;
        }
    }

    updateRetry(attempt: number, maxAttempts: number): void {
        if (this.spinner) {
            this.spinner.text = `Calling ${this.serviceName} (attempt ${attempt}/${maxAttempts})...`;
        }
    }

    succeed(cost?: string, duration?: number): void {
        if (this.spinner) {
            const elapsed = duration || (Date.now() - this.startTime);
            const time = (elapsed / 1000).toFixed(1);
            const costStr = cost ? `, ${cost}` : '';
            this.spinner.succeed(`${this.serviceName} ${chalk.dim(`(${time}s${costStr})`)}`);
            this.spinner = null;
        }
    }

    fail(error: string): void {
        if (this.spinner) {
            this.spinner.fail(`${this.serviceName} failed: ${error}`);
            this.spinner = null;
        }
    }

    warn(message: string): void {
        if (this.spinner) {
            this.spinner.warn(`${this.serviceName}: ${message}`);
            this.spinner = null;
        }
    }

    stop(): void {
        if (this.spinner) {
            this.spinner.stop();
            this.spinner = null;
        }
    }
}
