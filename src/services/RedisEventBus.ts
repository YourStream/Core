import { createClient } from 'redis';
import { logger } from '../utils/index.js';
import redisPool, { RedisClient } from './RedisPool.js';

export type BusEvent = {
    type: string;
    payload: Record<string, any>;
};

export type BusEventHandler = (event: BusEvent, id: string, jobId: string) => Promise<void>;

export interface BusOptions {
    streamKey: string;
    group: string;
    statusKey: string;
    consumeCount?: number;
    blockTimeout?: number;
};

export class RedisEventBus {
    private streamKey: string;
    private group: string;
    private statusKey: string;
    private consumeCount: number;
    private blockTimeout: number;
    constructor(private options: BusOptions) {
        this.streamKey = options.streamKey;
        this.group = options.group;
        this.statusKey = options.statusKey;
        this.consumeCount = options.consumeCount || 10;
        this.blockTimeout = options.blockTimeout || 5000;

        if (!this.streamKey || !this.group || !this.statusKey) {
            throw new Error('streamKey, group, and statusKey are required');
        }
        if (this.consumeCount <= 0) {
            throw new Error('consumeCount must be a positive number');
        }
        if (this.blockTimeout <= 0) {
            throw new Error('blockTimeout must be a positive number');
        }
        this.init();
    }

    private async init() {
        try {
            const client = await redisPool.acquire();
            client.xGroupCreate(this.streamKey, this.group, '$', { MKSTREAM: true });
            client.hSet(this.statusKey, 'status', 'ready');
            logger.info(`Redis EventBus "${this.streamKey}" initialized with group "${this.group}"`);
        } catch (error) {
            logger.error(`Error initializing Redis EventBus: ${error}`);
            throw error;
        }
    }

    async publish(event: BusEvent) {
        const client = await redisPool.acquire();
        const jobId = `${new Date().getTime()}-${Math.random()}`;

        client.hSet(this.statusKey, jobId, 'pending');
        client.xAdd(this.streamKey, '*', {
            type: event.type,
            payload: JSON.stringify(event.payload),
            jobId,
        });

        return jobId;
    }

    async consume(consumer: string, handler: BusEventHandler) {
        let client = await redisPool.acquire();
        const response = await client.xReadGroup(
            this.group,
            consumer,
            [{ key: this.streamKey, id: '>' }],
            { COUNT: this.consumeCount, BLOCK: this.blockTimeout }
        );

        if (!response) return;

        for (const stream of response) {
            for (const { id, message } of stream.messages) {
                const event: BusEvent = {
                    type: message.type,
                    payload: JSON.parse(message.payload),
                };

                const jobId = message.jobId;

                try {
                    await client.hSet(this.statusKey, jobId, 'in_progress');
                    await handler(event, id, jobId);
                    client = await redisPool.acquire();
                    await client.hSet(this.statusKey, jobId, 'processed');
                } catch (error) {
                    logger.error(`Error processing event: ${error}`);
                    client = await redisPool.acquire();
                    await client.hSet(this.statusKey, jobId, 'failed');
                }
                client = await redisPool.acquire();
                await client.xAck(this.streamKey, this.group, id);
            }
        }
    }

    async waitForCompletion(jobId: string, delayMs: number = 500): Promise<void> {
        if (!jobId) {
            throw new Error('Job ID is required');
        }
        if (typeof delayMs !== 'number' || delayMs <= 0) {
            throw new Error('Delay must be a positive number');
        }
        return new Promise<void>((resolve, reject) => {
            let lastTimeout: NodeJS.Timeout | null = null;
            const checkStatus = async () => {
                let client = await redisPool.acquire();
                const status = await client.hGet(this.statusKey, jobId);
                if (status === 'processed') {
                    resolve();
                } else if (status == 'failed') {
                    reject(new Error(`Job ${jobId} failed`));
                } else {
                    if (lastTimeout) {
                        clearTimeout(lastTimeout);
                    }
                    lastTimeout = setTimeout(checkStatus, delayMs);
                }
            };

            checkStatus();
        });
    }
}