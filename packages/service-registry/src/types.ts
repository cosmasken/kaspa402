/**
 * Service Registry Types and Interfaces
 * Defines the data structures for service metadata, pricing models, and metrics
 */

export interface ServiceMetadata {
    id: string;
    name: string;
    description: string;
    endpoint: string;
    capabilities: string[];
    pricing: PricingModel;
    metrics: ServiceMetrics;
    status: 'active' | 'inactive' | 'degraded';
    walletAddress?: string;
    healthCheckEndpoint?: string;
    registeredAt: string;
    lastHeartbeat?: string;
}

export interface PricingTier {
    name: string;
    amount: string; // KAS
    features: string[];
}

export interface PricingModel {
    type: 'fixed' | 'usage-based' | 'outcome-based' | 'tiered';
    baseAmount?: string; // KAS
    tiers?: PricingTier[];
    usageMetric?: string; // e.g., 'per_mb', 'per_second', 'per_kb'
    usageRate?: string; // KAS per unit
}

export interface ServiceMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTimeMs: number;
    successRate: number;
}

// API Request/Response Types

export interface RegisterServiceRequest {
    name: string;
    description: string;
    endpoint: string;
    capabilities: string[];
    pricing: PricingModel;
    walletAddress?: string;
    healthCheckEndpoint?: string;
}

export interface RegisterServiceResponse {
    success: boolean;
    serviceId: string;
    message: string;
}

export interface ServiceListResponse {
    success: boolean;
    services: ServiceMetadata[];
    count: number;
}

export interface ServiceDetailsResponse {
    success: boolean;
    service?: ServiceMetadata;
    error?: string;
}

export interface SearchServicesQuery {
    capability?: string;
    minSuccessRate?: number;
    maxCost?: string;
}

export interface DeregisterServiceResponse {
    success: boolean;
    message: string;
}

export interface UpdateMetricsRequest {
    success: boolean;
    responseTimeMs: number;
}

export interface UpdateMetricsResponse {
    success: boolean;
    metrics: ServiceMetrics;
}

export interface ErrorResponse {
    success: false;
    error: string;
    details?: string;
}
