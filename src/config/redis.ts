import { Redis, RedisOptions } from "ioredis";
import { env } from "./env.js";
import logger from "../shared/logger.js";

/**
 * Shared Redis connection options for BullMQ
 * BullMQ strictly requires maxRetriesPerRequest to be null.
 */
export const redisConnectionOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

/**
 * Helper to create isolated Redis connections for Queue, Worker, and general caching
 * BullMQ Workers require dedicated connections because of blocking queue pop operations.
 */
export const createRedisConnection = (name = "default"): Redis => {
  const client = new Redis(env.REDIS_URL, {
    ...redisConnectionOptions,
  });

  client.on("connect", () => {
    logger.info(`[Redis:${name}] Connected successfully`);
  });

  client.on("error", (err) => {
    logger.error(`[Redis:${name}] Connection error: ${err.message}`);
  });

  return client;
};

/**
 * Dedicated Redis instances
 */
export const redisClient = createRedisConnection("main");
export const queueRedisClient = createRedisConnection("queue");
export const workerRedisClient = createRedisConnection("worker");
