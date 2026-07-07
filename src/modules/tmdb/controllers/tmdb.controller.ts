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
      const filter = (req.query.filter as string) || "tv";
      if (!networkId) {
        return res.status(400).json({ error: "Missing networkId parameter" });
      }
      const data = await this.tmdbService.discoverByNetwork(networkId, page, filter);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Discover by Network Error:", error);
      res.status(500).json({ error: error.message || "Failed to discover by network from TMDB" });
    }
  };

  public discoverByGenre = async (req: Request, res: Response) => {
    try {
      const genreName = req.params.genreName;
      const page = (req.query.page as string) || "1";
      const type = (req.query.type as string) || "movie";
      const sortBy = (req.query.sort_by as string) || "popularity.desc";
      const minRating = req.query.min_rating as string | undefined;
      const yearFrom = req.query.year_from as string | undefined;
      const yearTo = req.query.year_to as string | undefined;
      const language = req.query.language as string | undefined;
      
      if (!genreName) {
        return res.status(400).json({ error: "Missing genreName parameter" });
      }
      
      const data = await this.tmdbService.discoverByGenreName(genreName, page, type, sortBy, minRating, yearFrom, yearTo, language);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Discover by Genre Error:", error);
      res.status(500).json({ error: error.message || "Failed to discover by genre from TMDB" });
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

  public getTitleDetails = async (req: Request, res: Response) => {
    try {
      const { mediaType, id } = req.params;
      if (!mediaType || !id) {
        return res.status(400).json({ error: "Missing mediaType or id parameter" });
      }
      const data = await this.tmdbService.getTitleDetails(mediaType, id);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Title Details Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch title details from TMDB" });
    }
  };

  public getSeasonDetails = async (req: Request, res: Response) => {
    try {
      const { id, seasonNumber } = req.params;
      if (!id || !seasonNumber) {
        return res.status(400).json({ error: "Missing id or seasonNumber parameter" });
      }
      const data = await this.tmdbService.getSeasonDetails(id, seasonNumber);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Season Details Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch season details from TMDB" });
    }
  };

  public getPersonDetails = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: "Missing id parameter" });
      }
      const data = await this.tmdbService.getPersonDetails(id);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Person Details Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch person details from TMDB" });
    }
  };

  public getEpisodeDetails = async (req: Request, res: Response) => {
    try {
      const { id, seasonNumber, episodeNumber } = req.params;
      if (!id || !seasonNumber || !episodeNumber) {
        return res.status(400).json({ error: "Missing id, seasonNumber, or episodeNumber parameter" });
      }
      const data = await this.tmdbService.getEpisodeDetails(id, seasonNumber, episodeNumber);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Episode Details Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch episode details from TMDB" });
    }
  };
}
