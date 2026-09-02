import { inject, injectable } from "inversify";
import { Request, Response } from "express";
import { TYPES } from "../../../di/types.js";
import { IDiscussionService } from "../services/discussion.service.interface.js";
import { sendResponse } from "../../../shared/utils/responseHelper.js";
import { HTTP_STATUS } from "../../../shared/constants/http-status.js";

@injectable()
export class DiscussionController {
  constructor(@inject(TYPES.DiscussionService) private discussionService: IDiscussionService) {}

  public getSummary = async (req: Request, res: Response) => {
    try {
      const { tmdbId, season, episode } = req.params;
      const userId = (req as any).user?.userId as string;

      if (!tmdbId || season === undefined || episode === undefined) {
        return sendResponse(res, HTTP_STATUS.BAD_REQUEST, "Missing tmdbId, season, or episode parameter");
      }

      const summary = await this.discussionService.getEpisodeSummary(
        String(tmdbId),
        Number(season),
        Number(episode),
        userId
      );

      return sendResponse(res, HTTP_STATUS.OK, "Episode summary fetched successfully", summary);
    } catch (error: any) {
      console.error("[DiscussionController] getSummary error:", error);
      return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error.message || "Failed to fetch episode summary");
    }
  };

  public getComments = async (req: Request, res: Response) => {
    try {
      const { tmdbId, season, episode } = req.params;
      const userId = (req as any).user?.userId as string;

      if (!tmdbId || season === undefined || episode === undefined) {
        return sendResponse(res, HTTP_STATUS.BAD_REQUEST, "Missing tmdbId, season, or episode parameter");
      }

      const sort = req.query.sort === "newest" ? "newest" : "top";
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const hideSpoilers = req.query.hideSpoilers === "true";
      const reveal = req.query.reveal === "true";

      const data = await this.discussionService.getComments(
        String(tmdbId),
        Number(season),
        Number(episode),
        { sort, cursor, limit, hideSpoilers, reveal },
        userId
      );

      return sendResponse(res, HTTP_STATUS.OK, "Comments fetched successfully", data);
    } catch (error: any) {
      console.error("[DiscussionController] getComments error:", error);
      return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error.message || "Failed to fetch comments");
    }
  };

  public upsertReaction = async (req: Request, res: Response) => {
    try {
      const { tmdbId, season, episode } = req.params;
      const userId = (req as any).user?.userId as string;

      if (!userId) {
        return sendResponse(res, HTTP_STATUS.UNAUTHORIZED, "Authentication required");
      }

      const { emotion, characterId, rating } = req.body;

      const reaction = await this.discussionService.upsertReaction(
        userId,
        String(tmdbId),
        Number(season),
        Number(episode),
        { emotion, characterId, rating }
      );

      return sendResponse(res, HTTP_STATUS.OK, "Reaction updated successfully", reaction);
    } catch (error: any) {
      console.error("[DiscussionController] upsertReaction error:", error);
      const isValidationError = error.message.includes("Rating") ||
        error.message.includes("emotion") ||
        error.message.includes("character");
      return sendResponse(
        res,
        isValidationError ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.INTERNAL_SERVER_ERROR,
        error.message || "Failed to update reaction"
      );
    }
  };

  public createComment = async (req: Request, res: Response) => {
    try {
      const { tmdbId, season, episode } = req.params;
      const userId = (req as any).user?.userId as string;

      if (!userId) {
        return sendResponse(res, HTTP_STATUS.UNAUTHORIZED, "Authentication required");
      }

      const { content, isSpoiler } = req.body;

      if (!content || !content.trim()) {
        return sendResponse(res, HTTP_STATUS.BAD_REQUEST, "Comment content is required");
      }

      const comment = await this.discussionService.createComment(
        userId,
        String(tmdbId),
        Number(season),
        Number(episode),
        { content, isSpoiler: Boolean(isSpoiler) }
      );

      return sendResponse(res, HTTP_STATUS.CREATED, "Comment created successfully", comment);
    } catch (error: any) {
      console.error("[DiscussionController] createComment error:", error);
      return sendResponse(res, HTTP_STATUS.BAD_REQUEST, error.message || "Failed to create comment");
    }
  };

  public deleteComment = async (req: Request, res: Response) => {
    try {
      const { commentId } = req.params;
      const userId = (req as any).user?.userId as string;

      if (!userId) {
        return sendResponse(res, HTTP_STATUS.UNAUTHORIZED, "Authentication required");
      }

      const success = await this.discussionService.deleteComment(String(commentId), userId);

      if (!success) {
        return sendResponse(res, HTTP_STATUS.FORBIDDEN, "You do not have permission to delete this comment");
      }

      return sendResponse(res, HTTP_STATUS.OK, "Comment deleted successfully");
    } catch (error: any) {
      console.error("[DiscussionController] deleteComment error:", error);
      return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error.message || "Failed to delete comment");
    }
  };

  public toggleLike = async (req: Request, res: Response) => {
    try {
      const { commentId } = req.params;
      const userId = (req as any).user?.userId as string;

      if (!userId) {
        return sendResponse(res, HTTP_STATUS.UNAUTHORIZED, "Authentication required");
      }

      const result = await this.discussionService.toggleLike(String(commentId), userId);

      return sendResponse(res, HTTP_STATUS.OK, "Like status updated successfully", result);
    } catch (error: any) {
      console.error("[DiscussionController] toggleLike error:", error);
      return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error.message || "Failed to toggle like");
    }
  };
}
