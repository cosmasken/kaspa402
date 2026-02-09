/**
 * Service Registry HTTP API Server
 * Provides REST API for service registration, discovery, and management
 */

import Fastify from 'fastify';
import { ServiceStorage } from './storage.js';
import {
    ServiceMetadata,
    RegisterServiceRequest,
    RegisterServiceResponse,
    ServiceListResponse,
    ServiceDetailsResponse,
    SearchServicesQuery,
    DeregisterServiceResponse,
    UpdateMetricsRequest,
    UpdateMetricsResponse,
    ErrorResponse
} from './types.js';
import { randomBytes } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.REGISTRY_PORT || '5000');
const HOST = process.env.REGISTRY_HOST || '0.0.0.0';
const STORAGE_PATH = process.env.REGISTRY_STORAGE_PATH || './registry-data.json';

const fastify = Fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info'
    }
});

const storage = new ServiceStorage(STORAGE_PATH);

/**
 * Generate a unique service ID
 */
function generateServiceId(): string {
    return `svc_${randomBytes(16).toString('hex')}`;
}

/**
 * POST /registry/services - Register a new service
 */
fastify.post<{
    Body: RegisterServiceRequest;
    Reply: RegisterServiceResponse | ErrorResponse;
}>('/registry/services', async (request, reply) => {
    try {
        const { name, description, endpoint, capabilities, pricing, walletAddress, healthCheckEndpoint } = request.body;

        // Validate required fields
        if (!name || !description || !endpoint || !capabilities || !pricing) {
            return reply.code(400).send({
                success: false,
                error: 'Missing required fields',
                details: 'name, description, endpoint, capabilities, and pricing are required'
            });
        }

        // Validate capabilities array
        if (!Array.isArray(capabilities) || capabilities.length === 0) {
            return reply.code(400).send({
                success: false,
                error: 'Invalid capabilities',
                details: 'capabilities must be a non-empty array'
            });
        }

        // Validate endpoint format
        try {
            new URL(endpoint);
        } catch (error) {
            return reply.code(400).send({
                success: false,
                error: 'Invalid endpoint',
                details: 'endpoint must be a valid URL'
            });
        }

        // Validate pricing model
        if (!pricing.type || !['fixed', 'usage-based', 'outcome-based', 'tiered'].includes(pricing.type)) {
            return reply.code(400).send({
                success: false,
                error: 'Invalid pricing model',
                details: 'pricing.type must be one of: fixed, usage-based, outcome-based, tiered'
            });
        }

        // Check for duplicate service names/endpoints to update instead of creating new
        const existingServices = storage.getAllServices();
        const existingService = existingServices.find(s => s.name === name && s.endpoint === endpoint);

        if (existingService) {
            fastify.log.info(`Updating existing service: ${name} (${existingService.id})`);
            
            // Update metadata while preserving metrics and ID
            const updatedService: ServiceMetadata = {
                ...existingService,
                description,
                capabilities,
                pricing,
                walletAddress,
                healthCheckEndpoint,
                status: 'active',
                lastHeartbeat: new Date().toISOString()
            };

            await storage.addService(updatedService); // storage.addService uses Map.set with id, which effectively updates

            return reply.send({
                success: true,
                serviceId: existingService.id,
                message: 'Service updated successfully'
            });
        }

        // Create new service metadata if not found
        const serviceId = generateServiceId();
        const service: ServiceMetadata = {
            id: serviceId,
            name,
            description,
            endpoint,
            capabilities,
            pricing,
            walletAddress,
            healthCheckEndpoint,
            status: 'active',
            registeredAt: new Date().toISOString(),
            lastHeartbeat: new Date().toISOString(),
            metrics: {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                averageResponseTimeMs: 0,
                successRate: 0
            }
        };

        await storage.addService(service);

        fastify.log.info(`Service registered: ${name} (${serviceId})`);

        return reply.code(201).send({
            success: true,
            serviceId,
            message: 'Service registered successfully'
        });
    } catch (error) {
        fastify.log.error({ err: error }, 'Error registering service');
        return reply.code(500).send({
            success: false,
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /registry/services - List all services
 */
fastify.get<{
    Reply: ServiceListResponse;
}>('/registry/services', async (request, reply) => {
    try {
        const services = storage.getAllServices();

        return reply.send({
            success: true,
            services,
            count: services.length
        });
    } catch (error) {
        fastify.log.error({ err: error }, 'Error listing services');
        return reply.code(500).send({
            success: false,
            services: [],
            count: 0
        });
    }
});

/**
 * GET /registry/services/search - Search services by capability
 */
fastify.get<{
    Querystring: SearchServicesQuery;
    Reply: ServiceListResponse;
}>('/registry/services/search', async (request, reply) => {
    try {
        const { capability, minSuccessRate } = request.query;

        let services = storage.getAllServices();

        // Filter by capability
        if (capability) {
            services = storage.searchByCapability(capability);
        }

        // Filter by minimum success rate
        if (minSuccessRate !== undefined) {
            const minRate = parseFloat(minSuccessRate.toString());
            services = services.filter(s => s.metrics.successRate >= minRate);
        }

        return reply.send({
            success: true,
            services,
            count: services.length
        });
    } catch (error) {
        fastify.log.error({ err: error }, 'Error searching services');
        return reply.code(500).send({
            success: false,
            services: [],
            count: 0
        });
    }
});

/**
 * GET /registry/services/:id - Get service details
 */
fastify.get<{
    Params: { id: string };
    Reply: ServiceDetailsResponse;
}>('/registry/services/:id', async (request, reply) => {
    try {
        const { id } = request.params;
        const service = storage.getService(id);

        if (!service) {
            return reply.code(404).send({
                success: false,
                error: 'Service not found'
            });
        }

        return reply.send({
            success: true,
            service
        });
    } catch (error) {
        fastify.log.error({ err: error }, 'Error getting service details');
        return reply.code(500).send({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * DELETE /registry/services/:id - Deregister a service
 */
fastify.delete<{
    Params: { id: string };
    Reply: DeregisterServiceResponse | ErrorResponse;
}>('/registry/services/:id', async (request, reply) => {
    try {
        const { id } = request.params;
        const deleted = await storage.removeService(id);

        if (!deleted) {
            return reply.code(404).send({
                success: false,
                error: 'Service not found'
            });
        }

        fastify.log.info(`Service deregistered: ${id}`);

        return reply.send({
            success: true,
            message: 'Service deregistered successfully'
        });
    } catch (error) {
        fastify.log.error({ err: error }, 'Error deregistering service');
        return reply.code(500).send({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /registry/services/:id/metrics - Update service metrics
 */
fastify.post<{
    Params: { id: string };
    Body: UpdateMetricsRequest;
    Reply: UpdateMetricsResponse | ErrorResponse;
}>('/registry/services/:id/metrics', async (request, reply) => {
    try {
        const { id } = request.params;
        const { success, responseTimeMs } = request.body;

        if (typeof success !== 'boolean' || typeof responseTimeMs !== 'number') {
            return reply.code(400).send({
                success: false,
                error: 'Invalid request body',
                details: 'success (boolean) and responseTimeMs (number) are required'
            });
        }

        const service = await storage.updateServiceMetrics(id, success, responseTimeMs);

        if (!service) {
            return reply.code(404).send({
                success: false,
                error: 'Service not found'
            });
        }

        return reply.send({
            success: true,
            metrics: service.metrics
        });
    } catch (error) {
        fastify.log.error({ err: error }, 'Error updating metrics');
        return reply.code(500).send({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /health - Health check endpoint
 */
fastify.get('/health', async (request, reply) => {
    return reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: storage.getServiceCount()
    });
});

/**
 * Start the server
 */
async function start() {
    try {
        // Initialize storage
        await storage.initialize();

        // Start server
        await fastify.listen({ port: PORT, host: HOST });

        console.log('');
        console.log('='.repeat(60));
        console.log('Service Registry Started');
        console.log('='.repeat(60));
        console.log(`Server listening on http://${HOST}:${PORT}`);
        console.log(`Storage path: ${STORAGE_PATH}`);
        console.log(`Registered services: ${storage.getServiceCount()}`);
        console.log('='.repeat(60));
        console.log('');
    } catch (error) {
        fastify.log.error(error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await fastify.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    await fastify.close();
    process.exit(0);
});

// Start if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
    start();
}

// Export for testing
export { fastify, storage, start };
