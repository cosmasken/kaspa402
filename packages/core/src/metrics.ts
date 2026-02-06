/**
 * Metrics collection for monitoring
 */

export interface Metrics {
    paymentsTotal: number;
    paymentsSuccessful: number;
    paymentsFailed: number;
    totalAmountKas: number;
    averageConfirmationTimeMs: number;
    activePayments: number;
}

export class MetricsCollector {
    private metrics: Metrics = {
        paymentsTotal: 0,
        paymentsSuccessful: 0,
        paymentsFailed: 0,
        totalAmountKas: 0,
        averageConfirmationTimeMs: 0,
        activePayments: 0
    };

    private confirmationTimes: number[] = [];
    private maxConfirmationSamples = 100;

    recordPaymentStarted(): void {
        this.metrics.paymentsTotal++;
        this.metrics.activePayments++;
    }

    recordPaymentSuccess(amountKas: number, confirmationTimeMs: number): void {
        this.metrics.paymentsSuccessful++;
        this.metrics.activePayments--;
        this.metrics.totalAmountKas += amountKas;

        // Track confirmation times
        this.confirmationTimes.push(confirmationTimeMs);
        if (this.confirmationTimes.length > this.maxConfirmationSamples) {
            this.confirmationTimes.shift();
        }

        // Calculate average
        const sum = this.confirmationTimes.reduce((a, b) => a + b, 0);
        this.metrics.averageConfirmationTimeMs = sum / this.confirmationTimes.length;
    }

    recordPaymentFailure(): void {
        this.metrics.paymentsFailed++;
        this.metrics.activePayments--;
    }

    getMetrics(): Metrics {
        return { ...this.metrics };
    }

    getSuccessRate(): number {
        if (this.metrics.paymentsTotal === 0) return 0;
        return this.metrics.paymentsSuccessful / this.metrics.paymentsTotal;
    }

    reset(): void {
        this.metrics = {
            paymentsTotal: 0,
            paymentsSuccessful: 0,
            paymentsFailed: 0,
            totalAmountKas: 0,
            averageConfirmationTimeMs: 0,
            activePayments: 0
        };
        this.confirmationTimes = [];
    }

    /**
     * Export metrics in Prometheus format
     */
    toPrometheus(): string {
        return `
# HELP kaspa_payments_total Total number of payments
# TYPE kaspa_payments_total counter
kaspa_payments_total ${this.metrics.paymentsTotal}

# HELP kaspa_payments_successful Successful payments
# TYPE kaspa_payments_successful counter
kaspa_payments_successful ${this.metrics.paymentsSuccessful}

# HELP kaspa_payments_failed Failed payments
# TYPE kaspa_payments_failed counter
kaspa_payments_failed ${this.metrics.paymentsFailed}

# HELP kaspa_payment_amount_total Total amount in KAS
# TYPE kaspa_payment_amount_total counter
kaspa_payment_amount_total ${this.metrics.totalAmountKas}

# HELP kaspa_confirmation_time_avg Average confirmation time in ms
# TYPE kaspa_confirmation_time_avg gauge
kaspa_confirmation_time_avg ${this.metrics.averageConfirmationTimeMs}

# HELP kaspa_active_payments Currently active payments
# TYPE kaspa_active_payments gauge
kaspa_active_payments ${this.metrics.activePayments}
`.trim();
    }
}

// Global metrics instance
export const globalMetrics = new MetricsCollector();
