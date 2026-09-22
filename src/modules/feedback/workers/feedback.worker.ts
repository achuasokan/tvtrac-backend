import { Worker, Job } from "bullmq";
import { workerRedisClient } from "../../../config/redis.js";
import logger from "../../../shared/logger.js";
import { container } from "../../../di/container.js";
import { TYPES } from "../../../di/types.js";
import { IFeedbackRepository } from "../repositories/feedback.repository.interface.js";
import { TelegramNotificationService } from "../services/telegram.service.js";
import {
  FEEDBACK_NOTIFICATION_QUEUE_NAME,
  FeedbackNotificationJobData,
} from "../queues/feedback.queue.js";

/**
 * BullMQ Worker Processor for Feedback Notifications
 */
export async function processFeedbackNotification(job: Job<FeedbackNotificationJobData>): Promise<void> {
  const { feedbackId } = job.data;
  logger.info(`[FeedbackWorker] Processing notification job ${job.id} for feedbackId: ${feedbackId}`);

  const feedbackRepo = container.get<IFeedbackRepository>(TYPES.FeedbackRepository);
  const telegramService = container.get<TelegramNotificationService>(TYPES.TelegramService);

  const feedback = await feedbackRepo.findByIdWithUser(feedbackId);

  if (!feedback) {
    logger.error(`[FeedbackWorker] Feedback not found in database for ID: ${feedbackId}`);
    throw new Error(`Feedback document with ID ${feedbackId} not found`);
  }

  await telegramService.sendFeedbackNotification(feedback);
}

/**
 * Feedback Notification Worker Instance
 */
export const feedbackNotificationWorker = new Worker<FeedbackNotificationJobData, any, string>(
  FEEDBACK_NOTIFICATION_QUEUE_NAME,
  processFeedbackNotification,
  {
    connection: workerRedisClient,
    concurrency: 1,
    stalledInterval: 300000, // 5 minutes instead of default 30s
    drainDelay: 30, // Wait 30s when queue is empty before checking again
    lockDuration: 60000, // 60s lock duration
  }
);

feedbackNotificationWorker.on("completed", (job) => {
  logger.info(`[FeedbackWorker] Notification job ${job.id} completed successfully`);
});

feedbackNotificationWorker.on("failed", (job, err) => {
  logger.error(`[FeedbackWorker] Notification job ${job?.id} failed (attempt ${job?.attemptsMade}):`, {
    error: err.message,
  });
});
