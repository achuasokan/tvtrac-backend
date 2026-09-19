import { Request, Response, NextFunction } from "express";
import { injectable, inject } from "inversify";
import { TYPES } from "../../../di/types.js";
import { IFeedbackService } from "../services/feedback.service.interface.js";
import { createFeedbackSchema } from "../dtos/feedback.dto.js";
import { sendResponse } from "../../../shared/utils/responseHelper.js";
import { HTTP_STATUS } from "../../../shared/constants/http-status.js";

@injectable()
export class FeedbackController {
  constructor(
    @inject(TYPES.FeedbackService) private feedbackService: IFeedbackService
  ) {}

  public createFeedback = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Validate payload with Zod schema (ZodError automatically caught by errorHandler)
      const validatedData = createFeedbackSchema.parse(req.body);

      // Securely derive userId from authenticated token context only, NEVER from client body
      const userId = req.user?.userId || null;

      const feedback = await this.feedbackService.createFeedback(validatedData, userId);

      sendResponse(
        res,
        HTTP_STATUS.CREATED,
        "Thank you for your feedback!",
        {
          id: feedback._id,
          status: feedback.status,
          createdAt: feedback.createdAt,
        }
      );
    } catch (error) {
      next(error);
    }
  };
}
