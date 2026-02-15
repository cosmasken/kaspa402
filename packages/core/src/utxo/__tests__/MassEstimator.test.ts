import { describe, it, expect, beforeEach } from 'vitest';
import { MassEstimator } from '../MassEstimator.js';
import { UTXOManagerConfig, EnrichedUTXO } from '../../types.js';

describe('MassEstimator', () => {
    let estimator: MassEstimator;
    let config: UTXOManagerConfig;

    beforeEach(() => {
        config = {
            minUtxoAgeBlocks: 2,
            maxInputsPerTx: 5,
            consolidationThreshold: 10,
            massLimitBuffer: 0.9,
            maxMassBytes: 100000,
            cacheExpiryMs: 10000
        };
        estimator = new MassEstimator(config);
    });

    describe('estimateMass', () => {
        it('should calculate mass for single input, two outputs', () => {
            const result = estimator.estimateMass(1, 2);

            expect(result.estimatedMass).toBe(400); // 200 + 100 + 100
            expect(result.breakdown.inputsMass).toBe(200);
            expect(result.breakdown.outputsMass).toBe(100);
            expect(result.breakdown.overheadMass).toBe(100);
            expect(result.isWithinLimit).toBe(true);
            expect(result.utilizationPercent).toBeCloseTo(0.4, 1);
        });

        it('should calculate mass for multiple inputs', () => {
            const result = estimator.estimateMass(5, 2);

            expect(result.estimatedMass).toBe(1200); // 1000 + 100 + 100
            expect(result.breakdown.inputsMass).toBe(1000);
            expect(result.isWithinLimit).toBe(true);
        });

        it('should detect when mass exceeds limit', () => {
            // 450 inputs would be 90,000 + 100 + 100 = 90,200 bytes
            // With 0.9 buffer, limit is 90,000, so this should fail
            const result = estimator.estimateMass(450, 2);

            expect(result.estimatedMass).toBeGreaterThan(90000);
            expect(result.isWithinLimit).toBe(false);
        });

        it('should calculate utilization percentage correctly', () => {
            const result = estimator.estimateMass(100, 2);

            // 20,000 + 100 + 100 = 20,200 bytes
            // 20,200 / 100,000 = 20.2%
            expect(result.utilizationPercent).toBeCloseTo(20.2, 1);
        });

        it('should respect mass limit buffer', () => {
            const result = estimator.estimateMass(449, 2);

            // 89,800 + 100 + 100 = 90,000 bytes (exactly at 90% limit)
            expect(result.estimatedMass).toBe(90000);
            expect(result.isWithinLimit).toBe(true);

            const overLimit = estimator.estimateMass(450, 2);
            expect(overLimit.isWithinLimit).toBe(false);
        });
    });

    describe('estimateUTXOMass', () => {
        it('should return consistent mass per UTXO', () => {
            const utxo: EnrichedUTXO = {
                outpoint: {
                    transactionId: 'abc123',
                    index: 0
                },
                utxoEntry: {
                    amount: '100000000',
                    scriptPublicKey: {
                        version: 0,
                        scriptPublicKey: '76a914...'
                    },
                    blockDaaScore: '1000',
                    isCoinbase: false
                },
                metadata: {
                    fetchedAt: Date.now(),
                    ageInBlocks: 5,
                    isFresh: false,
                    estimatedMassContribution: 0
                }
            };

            const mass = estimator.estimateUTXOMass(utxo);
            expect(mass).toBe(200);
        });
    });

    describe('calculateMaxInputs', () => {
        it('should calculate max inputs for 2 outputs', () => {
            const maxInputs = estimator.calculateMaxInputs(2);

            // Available: 90,000 - 100 - 100 = 89,800
            // Max inputs: 89,800 / 200 = 449
            // But capped at config.maxInputsPerTx = 5
            expect(maxInputs).toBe(5);
        });

        it('should respect configured max inputs', () => {
            const maxInputs = estimator.calculateMaxInputs(1);
            expect(maxInputs).toBeLessThanOrEqual(config.maxInputsPerTx);
        });

        it('should account for output mass', () => {
            const maxWith1Output = estimator.calculateMaxInputs(1);
            const maxWith10Outputs = estimator.calculateMaxInputs(10);

            // More outputs means less room for inputs
            expect(maxWith10Outputs).toBeLessThanOrEqual(maxWith1Output);
        });
    });

    describe('isWithinMassLimit', () => {
        it('should return true for small transactions', () => {
            expect(estimator.isWithinMassLimit(1, 2)).toBe(true);
            expect(estimator.isWithinMassLimit(5, 2)).toBe(true);
        });

        it('should return false for oversized transactions', () => {
            expect(estimator.isWithinMassLimit(500, 2)).toBe(false);
        });
    });

    describe('getSummary', () => {
        it('should format summary for valid transaction', () => {
            const estimate = estimator.estimateMass(1, 2);
            const summary = estimator.getSummary(estimate);

            expect(summary).toContain('✓');
            expect(summary).toContain('400');
            expect(summary).toContain('100000');
            expect(summary).toContain('0.4%');
        });

        it('should format summary for invalid transaction', () => {
            const estimate = estimator.estimateMass(500, 2);
            const summary = estimator.getSummary(estimate);

            expect(summary).toContain('✗');
        });
    });

    describe('edge cases', () => {
        it('should handle zero inputs', () => {
            const result = estimator.estimateMass(0, 1);
            expect(result.estimatedMass).toBe(150); // 0 + 50 + 100
            expect(result.isWithinLimit).toBe(true);
        });

        it('should handle zero outputs', () => {
            const result = estimator.estimateMass(1, 0);
            expect(result.estimatedMass).toBe(300); // 200 + 0 + 100
            expect(result.isWithinLimit).toBe(true);
        });

        it('should handle custom mass limit buffer', () => {
            const strictConfig = { ...config, massLimitBuffer: 0.5 };
            const strictEstimator = new MassEstimator(strictConfig);

            const result = strictEstimator.estimateMass(250, 2);
            // 50,000 + 100 + 100 = 50,200 bytes
            // With 0.5 buffer, limit is 50,000
            expect(result.isWithinLimit).toBe(false);
        });
    });
});
