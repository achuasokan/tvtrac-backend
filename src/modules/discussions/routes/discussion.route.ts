import { Router } from "express";
import { container } from "../../../di/container.js";
import { TYPES } from "../../../di/types.js";
import { DiscussionController } from "../controllers/discussion.controller.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";
import { uploadDiscussionMedia } from "../../../shared/utils/cloudinary.js";

const discussionRouter = Router();
const discussionController = container.get<DiscussionController>(TYPES.DiscussionController);

// Discussion endpoints (Authenticated users only)
discussionRouter.get(
  "/tv/:tmdbId/season/:season/episode/:episode/summary",
  authenticate,
  discussionController.getSummary
);

discussionRouter.get(
  "/tv/:tmdbId/season/:season/episode/:episode/comments",
  authenticate,
  discussionController.getComments
);

// Media attachment endpoints
discussionRouter.post(
  "/upload-media",
  authenticate,
  uploadDiscussionMedia.single("media"),
  discussionController.uploadMedia
);

discussionRouter.post(
  "/attach-gif",
  authenticate,
  discussionController.attachGif
);

// Comment actions
discussionRouter.post(
  "/tv/:tmdbId/season/:season/episode/:episode/reaction",
  authenticate,
  discussionController.upsertReaction
);

discussionRouter.post(
  "/tv/:tmdbId/season/:season/episode/:episode/comments",
  authenticate,
  discussionController.createComment
);

discussionRouter.post(
  "/comments/:commentId/reveal",
  authenticate,
  discussionController.revealComment
);

discussionRouter.delete(
  "/comments/:commentId",
  authenticate,
  discussionController.deleteComment
);

discussionRouter.post(
  "/comments/:commentId/like",
  authenticate,
  discussionController.toggleLike
);

export default discussionRouter;
