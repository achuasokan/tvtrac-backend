import 'reflect-metadata'
import { env } from './config/env.js'
import logger from './shared/logger.js'

import http from 'http'
import connectDB from './config/database.js'

import app from './app.js'
import { tvTimeImportWorker } from './modules/imports/workers/import.worker.js'
import { tvTimeImportQueue } from './modules/imports/queues/import.queue.js'
import { feedbackNotificationWorker } from './modules/feedback/workers/feedback.worker.js'
import { feedbackNotificationQueue } from './modules/feedback/queues/feedback.queue.js'
import { redisClient, queueRedisClient, workerRedisClient } from './config/redis.js'

const startserver = async () => {
    try {
        await connectDB();

        const httpServer = http.createServer(app)
        
        httpServer.listen(env.PORT, () => {
            logger.info(`server running on http://localhost:${env.PORT}`)
            logger.info(`[BullMQ] tvtime-imports worker initialized with concurrency: ${env.IMPORT_WORKER_CONCURRENCY}`)
            logger.info(`[BullMQ] feedback-notifications worker initialized`)
        })

        const gracefulShutdown = async (signal: string) => {
            logger.info(`Received ${signal}, starting graceful shutdown...`);
            try {
                await Promise.allSettled([
                    tvTimeImportWorker.close(),
                    tvTimeImportQueue.close(),
                    feedbackNotificationWorker.close(),
                    feedbackNotificationQueue.close(),
                ]);
                await Promise.allSettled([
                    redisClient.quit(),
                    queueRedisClient.quit(),
                    workerRedisClient.quit(),
                ]);
                httpServer.close(() => {
                    logger.info("HTTP server closed.");
                    process.exit(0);
                });
            } catch (err: any) {
                logger.error("Error during graceful shutdown:", { error: err.message });
                process.exit(1);
            }
        };

        process.on("SIGINT", () => gracefulShutdown("SIGINT"));
        process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
        
    } catch (error) {
        logger.error(`Error starting server:`, { error })
        process.exit(1)
    }
}

startserver()