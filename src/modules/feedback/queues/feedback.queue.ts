import { Queue } from "bullmq";
import { queueRedisClient } from "../../../config/redis.js";
import logger from "../../../shared/logger.js";

export const FEEDBACK_NOTIFICATION_QUEUE_NAME = "feedback-notifications";

export interface FeedbackNotificationJobData {
  feedbackId: string;
}

/**
 * Dedicated BullMQ queue for dispatching feedback notifications asynchronously
 */
export const feedbackNotificationQueue = new Queue<FeedbackNotificationJobData, any, string>(
  FEEDBACK_NOTIFICATION_QUEUE_NAME,
  {
    connection: queueRedisClient,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: {
        age: 86400, // keep completed jobs for 24h
        count: 500,
      },
      removeOnFail: {
        age: 86400 * 3, // keep failed jobs for 3 days
        count: 500,
      },
    },
  }
);

feedbackNotificationQueue.on("error", (err) => {
  logger.error("[BullMQ Queue] Error on feedback-notifications queue:", { error: err.message });
});
