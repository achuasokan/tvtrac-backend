import { inject, injectable } from "inversify";
import { Request, Response } from "express";
import { TmdbService } from "../services/tmdb.service.js";
import { TYPES } from "../../../di/types.js";

@injectable()
export class TmdbController {
  constructor(@inject(TYPES.TmdbService) private tmdbService: TmdbService) {}

  public getTrending = async (req: Request, res: Response) => {
    try {
      const data = await this.tmdbService.getTrending();
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Trending Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch trending from TMDB" });
    }
  };

  public getTrendingTv = async (req: Request, res: Response) => {
    try {
      const page = (req.query.page as string) || "1";
      const data = await this.tmdbService.getTrendingTv(page);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Trending TV Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch trending TV from TMDB" });
    }
  };

  public getTrendingMovies = async (req: Request, res: Response) => {
    try {
      const page = (req.query.page as string) || "1";
      const data = await this.tmdbService.getTrendingMovies(page);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Trending Movies Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch trending Movies from TMDB" });
    }
  };

  public discoverByNetwork = async (req: Request, res: Response) => {
    try {
      const networkId = req.params.networkId;
      const page = (req.query.page as string) || "1";
      if (!networkId) {
        return res.status(400).json({ error: "Missing networkId parameter" });
      }
      const data = await this.tmdbService.discoverByNetwork(networkId, page);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Discover by Network Error:", error);
      res.status(500).json({ error: error.message || "Failed to discover by network from TMDB" });
    }
  };

  public search = async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Missing query parameter 'q'" });
      }
      const data = await this.tmdbService.search(query);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Search Error:", error);
      res.status(500).json({ error: error.message || "Failed to search TMDB" });
    }
  };
}
