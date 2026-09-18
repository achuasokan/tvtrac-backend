import { Queue } from "bullmq";
import { queueRedisClient } from "../../../config/redis.js";
import logger from "../../../shared/logger.js";

export const TVTIME_IMPORT_QUEUE_NAME = "tvtime-imports";

export interface TvTimeImportJobFileRef {
  publicId: string;
  url: string;
  originalName: string;
}

export interface TvTimeImportJobData {
  importId: string;
  userId: string;
  files: TvTimeImportJobFileRef[];
}

export interface TvTimeImportJobProgress {
  processed: number;
  total: number;
  imported: number;
  duplicates: number;
  unresolved: number;
  failed: number;
  currentStep: string;
  episodes?: {
    processed: number;
    total?: number;
    imported: number;
  };
  movies?: {
    processed: number;
    total?: number;
    imported: number;
  };
  lists?: {
    processed: number;
    total?: number;
    imported: number;
    duplicates: number;
    listsCount: number;
  };
}

/**
 * BullMQ Queue for TV Time imports
 */
export const tvTimeImportQueue = new Queue<TvTimeImportJobData, any, string>(
  TVTIME_IMPORT_QUEUE_NAME,
  {
    connection: queueRedisClient,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: {
        age: 86400, // keep completed jobs for 24h for audit/history
        count: 500,
      },
      removeOnFail: {
        age: 86400 * 3, // keep failed jobs for 3 days
        count: 500,
      },
    },
  }
);

tvTimeImportQueue.on("error", (err) => {
  logger.error("[BullMQ Queue] Error on tvtime-imports queue:", { error: err.message });
});
