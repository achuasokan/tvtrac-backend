import { Router } from "express";
import { container } from "../../../di/container.js";
import { TYPES } from "../../../di/types.js";
import { FeedbackController } from "../controllers/feedback.controller.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";
import { feedbackRateLimiter } from "../../../middlewares/rate-limiter.middleware.js";

const feedbackRouter = Router();
const feedbackController = container.get<FeedbackController>(TYPES.FeedbackController);

/**
 * POST /api/feedback
 * Protected: Authenticated users only.
 * Protected with Redis rate limiter (5 req / 15 min).
 */
feedbackRouter.post(
  "/",
  authenticate,
  feedbackRateLimiter,
  (req, res, next) => feedbackController.createFeedback(req, res, next)
);

export default feedbackRouter;
