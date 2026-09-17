import { inject, injectable } from "inversify";
import { Request, Response } from "express";
import { TrackingService } from "../services/tracking.service.js";
import { TYPES } from "../../../di/types.js";

@injectable()
export class TrackingController {
  constructor(@inject(TYPES.TrackingService) private trackingService: TrackingService) {}

  public toggleWatchedStatus = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { tmdbId, mediaType, runtime } = req.body;
      
      if (!tmdbId || !mediaType) {
        return res.status(400).json({ error: "Missing tmdbId or mediaType" });
      }

      const result = await this.trackingService.toggleWatchedStatus(userId, tmdbId, mediaType, runtime);
      res.json(result);
    } catch (error: any) {
      console.error("Toggle Watched Error:", error);
      res.status(500).json({ error: "Failed to toggle watched status" });
    }
  };

  public checkIsWatched = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { mediaType, tmdbId } = req.params;
      
      if (!tmdbId || !mediaType) {
        return res.status(400).json({ error: "Missing tmdbId or mediaType parameter" });
      }

      const result = await this.trackingService.checkIsWatched(userId, tmdbId as string, mediaType as "movie" | "tv");
      res.json(result);
    } catch (error: any) {
      console.error("Check Watched Error:", error);
      res.status(500).json({ error: "Failed to check watched status" });
    }
  };

  public toggleEpisodeWatched = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { tmdbId, season, episode, runtime } = req.body;
      
      if (!tmdbId || season === undefined || episode === undefined) {
        return res.status(400).json({ error: "Missing tmdbId, season, or episode" });
      }

      const result = await this.trackingService.toggleEpisode(userId, tmdbId, Number(season), Number(episode), runtime);
      res.json(result);
    } catch (error: any) {
      console.error("Toggle Episode Watched Error:", error);
      res.status(500).json({ error: "Failed to toggle episode watched status" });
    }
  };

  public markSeasonWatched = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { tmdbId, season, episodes, runtime } = req.body;
      
      if (!tmdbId || season === undefined || !Array.isArray(episodes)) {
        return res.status(400).json({ error: "Missing tmdbId, season, or episodes array" });
      }

      const result = await this.trackingService.markSeasonWatched(userId, tmdbId, Number(season), episodes.map(Number), runtime);
      res.json(result);
    } catch (error: any) {
      console.error("Mark Season Watched Error:", error);
      res.status(500).json({ error: "Failed to mark season watched" });
    }
  };

  public setIgnorePreviousPrompt = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { tmdbId } = req.body;
      
      if (!tmdbId) {
        return res.status(400).json({ error: "Missing tmdbId" });
      }

      const result = await this.trackingService.setIgnorePreviousEpisodesPrompt(userId, tmdbId);
      res.json(result);
    } catch (error: any) {
      console.error("Set Ignore Prompt Error:", error);
      res.status(500).json({ error: "Failed to set ignore prompt setting" });
    }
  };

  public getWatchHistory = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const mediaType = req.query.mediaType as 'tv' | 'movie' | undefined;
      
      const result = await this.trackingService.getWatchHistory(userId, page, limit, mediaType);
      res.json({ data: result });
    } catch (error: any) {
      console.error("Get Watch History Error:", error);
      res.status(500).json({ error: "Failed to fetch watch history" });
    }
  };

  public getStats = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const result = await this.trackingService.getStats(userId);
      res.json({ data: result });
    } catch (error: any) {
      console.error("Get Stats Error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  };

  public importBatch = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Invalid payload: 'items' must be an array" });
      }

      if (items.length === 0) {
        return res.status(400).json({ error: "Batch cannot be empty" });
      }

      if (items.length > 20) {
        return res.status(400).json({ error: "Batch size exceeds maximum limit of 20 items" });
      }

      // Payload validation
      for (const item of items) {
        if (!item || typeof item !== "object") {
          return res.status(400).json({ error: "Invalid item format in batch" });
        }
        if (item.title && typeof item.title === "string" && item.title.length > 200) {
          return res.status(400).json({ error: "Title exceeds maximum length of 200 characters" });
        }
        if (item.tvdbId && typeof item.tvdbId === "string" && item.tvdbId.length > 50) {
          return res.status(400).json({ error: "TVDB ID exceeds maximum length of 50 characters" });
        }
        if (item.season !== undefined && (isNaN(Number(item.season)) || Number(item.season) < 0 || !Number.isInteger(Number(item.season)))) {
          return res.status(400).json({ error: "Season must be a non-negative integer" });
        }
        if (item.episode !== undefined && (isNaN(Number(item.episode)) || Number(item.episode) < 0 || !Number.isInteger(Number(item.episode)))) {
          return res.status(400).json({ error: "Episode must be a non-negative integer" });
        }
        if (item.watchedDate && isNaN(new Date(item.watchedDate).getTime())) {
          return res.status(400).json({ error: "Invalid date format for watchedDate" });
        }
      }

      const result = await this.trackingService.importTvTimeBatch(userId, items);
      res.json(result);
    } catch (error: any) {
      console.error("Import Batch Error:", error);
      res.status(500).json({ error: "Failed to process import batch" });
    }
  };

  public importMovieBatch = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Invalid payload: 'items' must be an array" });
      }

      if (items.length === 0) {
        return res.status(400).json({ error: "Batch cannot be empty" });
      }

      if (items.length > 20) {
        return res.status(400).json({ error: "Batch size exceeds maximum limit of 20 items" });
      }

      // Payload validation
      for (const item of items) {
        if (!item || typeof item !== "object") {
          return res.status(400).json({ error: "Invalid item format in batch" });
        }
        if (item.title && typeof item.title === "string" && item.title.length > 200) {
          return res.status(400).json({ error: "Title exceeds maximum length of 200 characters" });
        }
        if (item.imdbId && typeof item.imdbId === "string" && item.imdbId.length > 50) {
          return res.status(400).json({ error: "IMDb ID exceeds maximum length of 50 characters" });
        }
        if (item.tvdbId && typeof item.tvdbId === "string" && item.tvdbId.length > 50) {
          return res.status(400).json({ error: "TVDB ID exceeds maximum length of 50 characters" });
        }
        if (item.watchedDate && isNaN(new Date(item.watchedDate).getTime())) {
          return res.status(400).json({ error: "Invalid date format for watchedDate" });
        }
        if (item.userRating !== undefined && (isNaN(Number(item.userRating)) || Number(item.userRating) < 1 || Number(item.userRating) > 10)) {
          return res.status(400).json({ error: "userRating must be a number between 1 and 10" });
        }
      }

      const result = await this.trackingService.importMovieBatch(userId, items);
      res.json(result);
    } catch (error: any) {
      console.error("Import Movie Batch Error:", error);
      res.status(500).json({ error: "Failed to process movie import batch" });
    }
  };
}

