/**
 * Tests for ServiceStorage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ServiceStorage } from './storage.js';
import { ServiceMetadata } from './types.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_STORAGE_PATH = './test-registry-data.json';

describe('ServiceStorage', () => {
    let storage: ServiceStorage;

    beforeEach(async () => {
        // Clean up test file if it exists
        if (existsSync(TEST_STORAGE_PATH)) {
            unlinkSync(TEST_STORAGE_PATH);
        }
        storage = new ServiceStorage(TEST_STORAGE_PATH);
        await storage.initialize();
    });

    afterEach(() => {
        // Clean up test file
        if (existsSync(TEST_STORAGE_PATH)) {
            unlinkSync(TEST_STORAGE_PATH);
        }
    });

    const createTestService = (id: string, capability: string): ServiceMetadata => ({
        id,
        name: `Test Service ${id}`,
        description: 'Test service',
        endpoint: `http://localhost:3000/${id}`,
        capabilities: [capability],
        pricing: {
            type: 'fixed',
            baseAmount: '0.001'
        },
        status: 'active',
        registeredAt: new Date().toISOString(),
        metrics: {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTimeMs: 0,
            successRate: 0
        }
    });

    it('should add and retrieve a service', async () => {
        const service = createTestService('test1', 'data-processing');
        await storage.addService(service);

        const retrieved = storage.getService('test1');
        expect(retrieved).toBeDefined();
        expect(retrieved?.name).toBe('Test Service test1');
    });

    it('should get all services', async () => {
        await storage.addService(createTestService('test1', 'data-processing'));
        await storage.addService(createTestService('test2', 'data-validation'));

        const services = storage.getAllServices();
        expect(services).toHaveLength(2);
    });

    it('should search by capability', async () => {
        await storage.addService(createTestService('test1', 'data-processing'));
        await storage.addService(createTestService('test2', 'data-validation'));
        await storage.addService(createTestService('test3', 'data-processing'));

        const results = storage.searchByCapability('data-processing');
        expect(results).toHaveLength(2);
        expect(results.every(s => s.capabilities.includes('data-processing'))).toBe(true);
    });

    it('should remove a service', async () => {
        const service = createTestService('test1', 'data-processing');
        await storage.addService(service);

        const removed = await storage.removeService('test1');
        expect(removed).toBe(true);

        const retrieved = storage.getService('test1');
        expect(retrieved).toBeUndefined();
    });

    it('should update service metrics', async () => {
        const service = createTestService('test1', 'data-processing');
        await storage.addService(service);

        await storage.updateServiceMetrics('test1', true, 100);
        await storage.updateServiceMetrics('test1', true, 200);
        await storage.updateServiceMetrics('test1', false, 150);

        const updated = storage.getService('test1');
        expect(updated?.metrics.totalRequests).toBe(3);
        expect(updated?.metrics.successfulRequests).toBe(2);
        expect(updated?.metrics.failedRequests).toBe(1);
        expect(updated?.metrics.successRate).toBeCloseTo(2 / 3);
        expect(updated?.metrics.averageResponseTimeMs).toBeCloseTo(150);
    });

    it('should filter by minimum success rate', async () => {
        const service1 = createTestService('test1', 'data-processing');
        const service2 = createTestService('test2', 'data-processing');

        await storage.addService(service1);
        await storage.addService(service2);

        // Service 1: 90% success rate
        await storage.updateServiceMetrics('test1', true, 100);
        await storage.updateServiceMetrics('test1', true, 100);
        await storage.updateServiceMetrics('test1', true, 100);
        await storage.updateServiceMetrics('test1', true, 100);
        await storage.updateServiceMetrics('test1', true, 100);
        await storage.updateServiceMetrics('test1', true, 100);
        await storage.updateServiceMetrics('test1', true, 100);
        await storage.updateServiceMetrics('test1', true, 100);
        await storage.updateServiceMetrics('test1', true, 100);
        await storage.updateServiceMetrics('test1', false, 100);

        // Service 2: 50% success rate
        await storage.updateServiceMetrics('test2', true, 100);
        await storage.updateServiceMetrics('test2', false, 100);

        const results = storage.searchServices({ minSuccessRate: 0.8 });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('test1');
    });

    it('should persist and reload services', async () => {
        const service = createTestService('test1', 'data-processing');
        await storage.addService(service);

        // Create new storage instance with same path
        const storage2 = new ServiceStorage(TEST_STORAGE_PATH);
        await storage2.initialize();

        const retrieved = storage2.getService('test1');
        expect(retrieved).toBeDefined();
        expect(retrieved?.name).toBe('Test Service test1');
    });
});
