/**
 * Validator Service Agent
 * Validates data with outcome-based pricing (only charges on success)
 */

import { ServiceAgent, ServiceAgentConfig } from '@kaspa-agent-pay/service-agent';
import dotenv from 'dotenv';

dotenv.config();

interface ValidationRule {
    field: string;
    type: 'required' | 'email' | 'url' | 'number' | 'string' | 'minLength' | 'maxLength' | 'pattern';
    value?: any;
    message?: string;
}

interface ValidatorInput {
    data: any;
    schema: 'email' | 'url' | 'custom';
    rules?: ValidationRule[];
}

interface ValidationError {
    field: string;
    message: string;
    type: string;
}

interface ValidatorOutput {
    valid: boolean;
    success: boolean;
    data?: any; // Add data property for chain support
    errors?: ValidationError[];
}

class ValidatorAgent extends ServiceAgent {
    constructor(config: ServiceAgentConfig) {
        super(config);
    }

    protected validateInput(input: any): boolean {
        if (!input || typeof input !== 'object') {
            return false;
        }

        const { data, schema } = input as ValidatorInput;

        if (data === undefined || data === null) {
            return false;
        }

        if (!schema || !['email', 'url', 'custom'].includes(schema)) {
            return false;
        }

        if (schema === 'custom' && (!input.rules || !Array.isArray(input.rules))) {
            return false;
        }

        return true;
    }

    protected async processRequest(input: ValidatorInput): Promise<ValidatorOutput> {
        const errors: ValidationError[] = [];

        switch (input.schema) {
            case 'email':
                this.validateEmail(input.data, errors);
                break;

            case 'url':
                this.validateUrl(input.data, errors);
                break;

            case 'custom':
                if (input.rules) {
                    this.validateCustom(input.data, input.rules, errors);
                }
                break;
        }

        const valid = errors.length === 0;

        return {
            valid,
            success: valid, // For outcome-based pricing
            data: input.data, // Return data to preserve the chain
            errors: errors.length > 0 ? errors : undefined
        };
    }

    private validateEmail(data: any, errors: ValidationError[]): void {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (typeof data === 'string') {
            if (!emailRegex.test(data)) {
                errors.push({
                    field: 'email',
                    message: 'Invalid email format',
                    type: 'email'
                });
            }
        } else if (typeof data === 'object' && data !== null) {
            // Validate email field in object
            if (data.email && !emailRegex.test(data.email)) {
                errors.push({
                    field: 'email',
                    message: 'Invalid email format',
                    type: 'email'
                });
            }
        } else {
            errors.push({
                field: 'email',
                message: 'Email must be a string',
                type: 'email'
            });
        }
    }

    private validateUrl(data: any, errors: ValidationError[]): void {
        try {
            if (typeof data === 'string') {
                new URL(data);
            } else if (typeof data === 'object' && data !== null && data.url) {
                new URL(data.url);
            } else {
                errors.push({
                    field: 'url',
                    message: 'URL must be a string',
                    type: 'url'
                });
            }
        } catch (e) {
            errors.push({
                field: 'url',
                message: 'Invalid URL format',
                type: 'url'
            });
        }
    }

    private validateCustom(data: any, rules: ValidationRule[], errors: ValidationError[]): void {
        for (const rule of rules) {
            const value = this.getFieldValue(data, rule.field);

            switch (rule.type) {
                case 'required':
                    if (value === undefined || value === null || value === '') {
                        errors.push({
                            field: rule.field,
                            message: rule.message || `${rule.field} is required`,
                            type: 'required'
                        });
                    }
                    break;

                case 'email':
                    if (value && typeof value === 'string') {
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRegex.test(value)) {
                            errors.push({
                                field: rule.field,
                                message: rule.message || `${rule.field} must be a valid email`,
                                type: 'email'
                            });
                        }
                    }
                    break;

                case 'url':
                    if (value && typeof value === 'string') {
                        try {
                            new URL(value);
                        } catch (e) {
                            errors.push({
                                field: rule.field,
                                message: rule.message || `${rule.field} must be a valid URL`,
                                type: 'url'
                            });
                        }
                    }
                    break;

                case 'number':
                    if (value !== undefined && typeof value !== 'number') {
                        errors.push({
                            field: rule.field,
                            message: rule.message || `${rule.field} must be a number`,
                            type: 'number'
                        });
                    }
                    break;

                case 'string':
                    if (value !== undefined && typeof value !== 'string') {
                        errors.push({
                            field: rule.field,
                            message: rule.message || `${rule.field} must be a string`,
                            type: 'string'
                        });
                    }
                    break;

                case 'minLength':
                    if (value && typeof value === 'string' && rule.value !== undefined) {
                        if (value.length < rule.value) {
                            errors.push({
                                field: rule.field,
                                message: rule.message || `${rule.field} must be at least ${rule.value} characters`,
                                type: 'minLength'
                            });
                        }
                    }
                    break;

                case 'maxLength':
                    if (value && typeof value === 'string' && rule.value !== undefined) {
                        if (value.length > rule.value) {
                            errors.push({
                                field: rule.field,
                                message: rule.message || `${rule.field} must be at most ${rule.value} characters`,
                                type: 'maxLength'
                            });
                        }
                    }
                    break;

                case 'pattern':
                    if (value && typeof value === 'string' && rule.value) {
                        const regex = new RegExp(rule.value);
                        if (!regex.test(value)) {
                            errors.push({
                                field: rule.field,
                                message: rule.message || `${rule.field} does not match required pattern`,
                                type: 'pattern'
                            });
                        }
                    }
                    break;
            }
        }
    }

    private getFieldValue(data: any, field: string): any {
        if (typeof data !== 'object' || data === null) {
            return undefined;
        }

        // Support nested fields with dot notation
        const parts = field.split('.');
        let value = data;

        for (const part of parts) {
            if (value && typeof value === 'object') {
                value = value[part];
            } else {
                return undefined;
            }
        }

        return value;
    }
}

// Start the service
const config: ServiceAgentConfig = {
    name: 'Validator',
    description: 'Validates data against schemas and rules',
    capabilities: ['data-validation'],
    pricing: {
        type: 'outcome-based',
        baseAmount: process.env.PRICE_KAS || '5.0'
    },
    port: parseInt(process.env.PORT || '3002'),
    registryUrl: process.env.REGISTRY_URL || 'http://localhost:5000',
    walletPath: process.env.WALLET_PATH || './wallets/validator.json',
    privateKeyWif: process.env.PRIVATE_KEY_WIF,
    network: (process.env.KASPA_NETWORK as any) || 'testnet',
    rpcUrl: process.env.KASPA_RPC_URL || 'https://api-tn10.kaspa.org'
};

const agent = new ValidatorAgent(config);

// Handle graceful shutdown
process.on('SIGINT', async () => {
    await agent.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await agent.stop();
    process.exit(0);
});

// Start the agent
agent.start().catch(error => {
    console.error('Failed to start Validator agent:', error);
    process.exit(1);
});
