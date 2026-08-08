import { inject, injectable } from "inversify";
import { Request, Response } from "express";
import { TmdbService } from "../services/tmdb.service.js";
import { ITmdbCacheService } from "../services/tmdbCache.service.interface.js";
import { TYPES } from "../../../di/types.js";

@injectable()
export class TmdbController {
  constructor(
    @inject(TYPES.TmdbService) private tmdbService: TmdbService,
    @inject(TYPES.TmdbCacheService) private tmdbCacheService: ITmdbCacheService
  ) {}

  public getTrending = async (req: Request, res: Response) => {
    try {
      const data = await this.tmdbCacheService.getCachedTrending();
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Trending Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch trending from TMDB" });
    }
  };

  public getTrendingTv = async (req: Request, res: Response) => {
    try {
      const page = (req.query.page as string) || "1";
      const data = await this.tmdbCacheService.getCachedTrendingTv(page);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Trending TV Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch trending TV from TMDB" });
    }
  };

  public getTrendingMovies = async (req: Request, res: Response) => {
    try {
      const page = (req.query.page as string) || "1";
      const data = await this.tmdbCacheService.getCachedTrendingMovies(page);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Trending Movies Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch trending Movies from TMDB" });
    }
  };

  public getCompany = async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ error: "Missing company ID" });
      const data = await this.tmdbCacheService.getCachedCompany(id);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Get Company Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch company details" });
    }
  };

  public discoverByCompany = async (req: Request, res: Response) => {
    try {
      const companyId = req.params.companyId as string;
      const page = (req.query.page as string) || "1";
      const type = (req.query.type as string) || "movie";
      const sortBy = (req.query.sort_by as string) || "popularity.desc";
      const minRating = typeof req.query.min_rating === "string" ? req.query.min_rating : undefined;
      const yearFrom = typeof req.query.year_from === "string" ? req.query.year_from : undefined;
      const yearTo = typeof req.query.year_to === "string" ? req.query.year_to : undefined;
      const language = typeof req.query.language === "string" ? req.query.language : undefined;
      if (!companyId) return res.status(400).json({ error: "Missing company ID" });
      const data = await this.tmdbCacheService.getCachedDiscoverByCompany(companyId, page, type, sortBy, minRating, yearFrom, yearTo, language);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Discover by Company Error:", error);
      res.status(500).json({ error: error.message || "Failed to discover by company" });
    }
  };

  public discoverByKeyword = async (req: Request, res: Response) => {
    try {
      const keywordId = req.params.keywordId as string;
      const page = (req.query.page as string) || "1";
      const type = (req.query.type as string) || "movie";
      const sortBy = (req.query.sort_by as string) || "popularity.desc";
      if (!keywordId) return res.status(400).json({ error: "Missing keyword ID" });
      const data = await this.tmdbCacheService.getCachedDiscoverByKeyword(keywordId, page, type, sortBy);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Discover by Keyword Error:", error);
      res.status(500).json({ error: error.message || "Failed to discover by keyword" });
    }
  };

  public discoverByNetwork = async (req: Request, res: Response) => {
    try {
      const networkId = req.params.networkId as string;
      const page = (req.query.page as string) || "1";
      const filter = (req.query.filter as string) || "tv";
      const region = (req.query.region as string) || "US";
      if (!networkId) {
        return res.status(400).json({ error: "Missing networkId parameter" });
      }
      const data = await this.tmdbCacheService.getCachedDiscoverByNetwork(networkId, page, filter, region);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Discover by Network Error:", error);
      res.status(500).json({ error: error.message || "Failed to discover by network from TMDB" });
    }
  };

  public discoverByGenre = async (req: Request, res: Response) => {
    try {
      const genreName = req.params.genreName as string;
      const page = (req.query.page as string) || "1";
      const type = (req.query.type as string) || "movie";
      const sortBy = (req.query.sort_by as string) || "popularity.desc";
      const minRating = typeof req.query.min_rating === "string" ? req.query.min_rating : undefined;
      const yearFrom = typeof req.query.year_from === "string" ? req.query.year_from : undefined;
      const yearTo = typeof req.query.year_to === "string" ? req.query.year_to : undefined;
      const language = typeof req.query.language === "string" ? req.query.language : undefined;
      
      if (!genreName) {
        return res.status(400).json({ error: "Missing genreName parameter" });
      }
      
      const data = await this.tmdbCacheService.getCachedDiscoverByGenreName(genreName, page, type, sortBy, minRating, yearFrom, yearTo, language);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Discover by Genre Error:", error);
      res.status(500).json({ error: error.message || "Failed to discover by genre from TMDB" });
    }
  };

  public discoverAdvanced = async (req: Request, res: Response) => {
    try {
      const data = await this.tmdbCacheService.getCachedDiscoverAdvanced(req.query);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Discover Advanced Error:", error);
      res.status(500).json({ error: error.message || "Failed to discover advanced from TMDB" });
    }
  };

  public search = async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      const page = (req.query.page as string) || "1";
      if (!query) {
        return res.status(400).json({ error: "Missing query parameter 'q'" });
      }
      const data = await this.tmdbService.search(query, page);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Search Error:", error);
      res.status(500).json({ error: error.message || "Failed to search TMDB" });
    }
  };

  public getTitleDetails = async (req: Request, res: Response) => {
    try {
      const mediaType = req.params.mediaType as string;
      const id = req.params.id as string;
      if (!mediaType || !id) {
        return res.status(400).json({ error: "Missing mediaType or id parameter" });
      }
      const data = await this.tmdbCacheService.getCachedTitleDetails(mediaType, id);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Title Details Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch title details from TMDB" });
    }
  };

  public getBatchTitleDetails = async (req: Request, res: Response) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.json({});
      }

      const targetItems = items.slice(0, 50);

      const results = await Promise.all(
        targetItems.map(async (item: { tmdbId: string; mediaType: string }) => {
          try {
            if (!item.tmdbId || !item.mediaType) return null;
            const data = await this.tmdbCacheService.getCachedTitleDetails(item.mediaType, String(item.tmdbId));
            return { key: `${item.mediaType}-${item.tmdbId}`, data };
          } catch (err) {
            return { key: `${item.mediaType}-${item.tmdbId}`, data: null };
          }
        })
      );

      const detailsMap: Record<string, any> = {};
      results.forEach((r) => {
        if (r && r.key) {
          detailsMap[r.key] = r.data;
        }
      });

      res.json(detailsMap);
    } catch (error: any) {
      console.error("TMDB Batch Title Details Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch batch title details" });
    }
  };

  public getSeasonDetails = async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const seasonNumber = req.params.seasonNumber as string;
      if (!id || !seasonNumber) {
        return res.status(400).json({ error: "Missing id or seasonNumber parameter" });
      }
      const data = await this.tmdbCacheService.getCachedSeasonDetails(id, seasonNumber);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Season Details Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch season details from TMDB" });
    }
  };

  public getPersonDetails = async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!id) {
        return res.status(400).json({ error: "Missing id parameter" });
      }
      const data = await this.tmdbCacheService.getCachedPersonDetails(id);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Person Details Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch person details from TMDB" });
    }
  };

  public getEpisodeDetails = async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const seasonNumber = req.params.seasonNumber as string;
      const episodeNumber = req.params.episodeNumber as string;
      if (!id || !seasonNumber || !episodeNumber) {
        return res.status(400).json({ error: "Missing id, seasonNumber, or episodeNumber parameter" });
      }
      const data = await this.tmdbCacheService.getCachedEpisodeDetails(id, seasonNumber, episodeNumber);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Episode Details Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch episode details from TMDB" });
    }
  };
  public getCollection = async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!id) {
        return res.status(400).json({ error: "Missing id parameter" });
      }
      const data = await this.tmdbCacheService.getCachedCollection(id);
      res.json(data);
    } catch (error: any) {
      console.error("TMDB Collection Details Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch collection details from TMDB" });
    }
  };
}
