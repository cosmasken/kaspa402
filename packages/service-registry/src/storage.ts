/**
 * Service Storage
 * In-memory storage with file-based persistence for service registry
 */

import { ServiceMetadata } from './types.js';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

export class ServiceStorage {
    private services: Map<string, ServiceMetadata> = new Map();
    private persistencePath: string;

    constructor(persistencePath: string = './registry-data.json') {
        this.persistencePath = persistencePath;
    }

    /**
     * Initialize storage by loading persisted data
     */
    async initialize(): Promise<void> {
        if (existsSync(this.persistencePath)) {
            try {
                const data = await readFile(this.persistencePath, 'utf-8');
                const services: ServiceMetadata[] = JSON.parse(data);

                for (const service of services) {
                    this.services.set(service.id, service);
                }

                console.log(`Loaded ${services.length} services from ${this.persistencePath}`);
            } catch (error) {
                console.error('Failed to load persisted services:', error);
            }
        }
    }

    /**
     * Add a new service to the registry
     */
    async addService(service: ServiceMetadata): Promise<void> {
        this.services.set(service.id, service);
        await this.persist();
    }

    /**
     * Remove a service from the registry
     */
    async removeService(serviceId: string): Promise<boolean> {
        const deleted = this.services.delete(serviceId);
        if (deleted) {
            await this.persist();
        }
        return deleted;
    }

    /**
     * Get a specific service by ID
     */
    getService(serviceId: string): ServiceMetadata | undefined {
        return this.services.get(serviceId);
    }

    /**
     * Get all services
     */
    getAllServices(): ServiceMetadata[] {
        return Array.from(this.services.values());
    }

    /**
     * Search services by capability
     */
    searchByCapability(capability: string): ServiceMetadata[] {
        return this.getAllServices().filter(service =>
            service.capabilities.includes(capability)
        );
    }

    /**
     * Search services with filters
     */
    searchServices(filters: {
        capability?: string;
        minSuccessRate?: number;
        status?: string;
    }): ServiceMetadata[] {
        let results = this.getAllServices();

        if (filters.capability) {
            results = results.filter(service =>
                service.capabilities.includes(filters.capability!)
            );
        }

        if (filters.minSuccessRate !== undefined) {
            results = results.filter(service =>
                service.metrics.successRate >= filters.minSuccessRate!
            );
        }

        if (filters.status) {
            results = results.filter(service =>
                service.status === filters.status
            );
        }

        return results;
    }

    /**
     * Update service metrics
     */
    async updateServiceMetrics(
        serviceId: string,
        success: boolean,
        responseTimeMs: number
    ): Promise<ServiceMetadata | undefined> {
        const service = this.services.get(serviceId);
        if (!service) {
            return undefined;
        }

        // Update metrics
        service.metrics.totalRequests++;
        if (success) {
            service.metrics.successfulRequests++;
        } else {
            service.metrics.failedRequests++;
        }

        // Update average response time (running average)
        const totalTime = service.metrics.averageResponseTimeMs * (service.metrics.totalRequests - 1);
        service.metrics.averageResponseTimeMs = (totalTime + responseTimeMs) / service.metrics.totalRequests;

        // Update success rate
        service.metrics.successRate = service.metrics.successfulRequests / service.metrics.totalRequests;

        // Update last heartbeat
        service.lastHeartbeat = new Date().toISOString();

        await this.persist();
        return service;
    }

    /**
     * Update service status
     */
    async updateServiceStatus(
        serviceId: string,
        status: 'active' | 'inactive' | 'degraded'
    ): Promise<boolean> {
        const service = this.services.get(serviceId);
        if (!service) {
            return false;
        }

        service.status = status;
        service.lastHeartbeat = new Date().toISOString();
        await this.persist();
        return true;
    }

    /**
     * Persist services to file
     */
    private async persist(): Promise<void> {
        try {
            const services = this.getAllServices();
            await writeFile(
                this.persistencePath,
                JSON.stringify(services, null, 2),
                'utf-8'
            );
        } catch (error) {
            console.error('Failed to persist services:', error);
        }
    }

    /**
     * Get service count
     */
    getServiceCount(): number {
        return this.services.size;
    }

    /**
     * Clear all services (for testing)
     */
    async clear(): Promise<void> {
        this.services.clear();
        await this.persist();
    }
}
