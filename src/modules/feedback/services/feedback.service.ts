import { injectable, inject } from "inversify";
import { TYPES } from "../../../di/types.js";
import { IFeedbackService } from "./feedback.service.interface.js";
import { IFeedbackRepository } from "../repositories/feedback.repository.interface.js";
import { TelegramNotificationService } from "./telegram.service.js";
import { CreateFeedbackDto } from "../dtos/feedback.dto.js";
import { IFeedback } from "../models/feedback.model.js";
import { feedbackNotificationQueue } from "../queues/feedback.queue.js";
import logger from "../../../shared/logger.js";

@injectable()
export class FeedbackService implements IFeedbackService {
  constructor(
    @inject(TYPES.FeedbackRepository) private feedbackRepository: IFeedbackRepository,
    @inject(TYPES.TelegramService) private telegramService: TelegramNotificationService
  ) {}

  public async createFeedback(data: CreateFeedbackDto, userId?: string | null): Promise<IFeedback> {
    // 1. Persist permanently to MongoDB (Source of Truth)
    const savedFeedback = await this.feedbackRepository.create(data, userId);
    logger.info(`[FeedbackService] Successfully saved feedback to MongoDB with ID: ${savedFeedback._id}`);

    // 2. Asynchronously enqueue lightweight notification job ONLY if Telegram is configured
    try {
      if (this.telegramService.isConfigured()) {
        const job = await feedbackNotificationQueue.add("send-feedback-notification", {
          feedbackId: savedFeedback._id.toString(),
        });
        logger.info(`[FeedbackService] Enqueued BullMQ notification job ${job.id} for feedback: ${savedFeedback._id}`);
      } else {
        logger.info("[FeedbackService] Telegram not configured; feedback saved without notification job.");
      }
    } catch (queueErr: any) {
      // BullMQ queue failure must NEVER rollback or fail the user's feedback submission
      logger.error("[FeedbackService] Failed to enqueue notification to BullMQ:", {
        error: queueErr.message,
      });
    }

    // 3. Return saved feedback to user immediately without waiting for Telegram
    return savedFeedback;
  }
}
