import { createClient, RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';
import { createPool, Pool } from 'generic-pool';
import { logger } from '../utils/index.js';

export type RedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

const factory = {
    create: async (): Promise<RedisClient> => {
        const client = createClient({
            url: `redis://${process.env.REDIS_HOST}`
        });
        await client.connect();
        return client;
    },
    destroy: async (client: RedisClient): Promise<void> => {
        await client.quit();
    },
};

const redisPool: Pool<RedisClient> = createPool(factory, {
    max: process.env.REDIS_POOL_MAX ? parseInt(process.env.REDIS_POOL_MAX) : 10,
    min: process.env.REDIS_POOL_MIN ? parseInt(process.env.REDIS_POOL_MIN) : 2,
    idleTimeoutMillis: process.env.REDIS_POOL_IDLE_TIMEOUT ? parseInt(process.env.REDIS_POOL_IDLE_TIMEOUT) : 30000,
});

redisPool.on('factoryCreateError', (error) => {
    logger.error('Error creating Redis client:', error);
});
redisPool.on('factoryDestroyError', (error) => {
    logger.error('Error destroying Redis client:', error);
});

export default redisPool;