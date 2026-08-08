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
}
