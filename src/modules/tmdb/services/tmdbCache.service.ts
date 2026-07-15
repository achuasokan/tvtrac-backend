import { injectable, inject } from "inversify";
import { TmdbService } from "./tmdb.service.js";
import { TmdbCacheModel } from "../models/tmdbCache.schema.js";
import { ITmdbCacheService } from "./tmdbCache.service.interface.js";
import { TYPES } from "../../../di/types.js";

@injectable()
export class TmdbCacheService implements ITmdbCacheService {
    constructor(
        @inject(TYPES.TmdbService) private tmdbService: TmdbService
    ) {}

    private async getOrSetCache(cacheKey: string, type: string, fetchFn: () => Promise<any>) {
        const cacheEntry = await TmdbCacheModel.findOne({ tmdbId: cacheKey, type });
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        if (cacheEntry && cacheEntry.lastUpdated > oneDayAgo) {
            return cacheEntry.data;
        }

        const freshData = await fetchFn();

        await TmdbCacheModel.findOneAndUpdate(
            { tmdbId: cacheKey, type },
            { 
                data: freshData,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        return freshData;
    }

    async getCachedTrending() {
        return this.getOrSetCache("trending_all", "list", () => this.tmdbService.getTrending());
    }

    async getCachedTrendingTv(page: string = "1") {
        return this.getOrSetCache(`trending_tv_page_${page}`, "list", () => this.tmdbService.getTrendingTv(page));
    }

    async getCachedTrendingMovies(page: string = "1") {
        return this.getOrSetCache(`trending_movie_page_${page}`, "list", () => this.tmdbService.getTrendingMovies(page));
    }

    async getCachedDiscoverByNetwork(providerId: string, page: string = "1", filterType: string = "tv", region: string = "US") {
        const key = `discover_network_${providerId}_type_${filterType}_page_${page}_region_${region}`;
        return this.getOrSetCache(key, "list", () => this.tmdbService.discoverByNetwork(providerId, page, filterType, region));
    }

    async getCachedDiscoverByGenreName(genreName: string, page: string = "1", type: string = "movie", sortBy: string = "popularity.desc", minRating?: string, yearFrom?: string, yearTo?: string, language?: string) {
        const key = `discover_genre_${genreName}_type_${type}_page_${page}_sort_${sortBy}_minRating_${minRating || ''}_yearFrom_${yearFrom || ''}_yearTo_${yearTo || ''}_lang_${language || ''}`;
        return this.getOrSetCache(key, "list", () => this.tmdbService.discoverByGenreName(genreName, page, type, sortBy, minRating, yearFrom, yearTo, language));
    }

    async getCachedDiscoverAdvanced(query: any) {
        // Sort keys to ensure stable cache key
        const sortedQuery = Object.keys(query).sort().reduce((acc, key) => {
            acc[key] = query[key];
            return acc;
        }, {} as any);
        const key = `discover_advanced_${JSON.stringify(sortedQuery)}`;
        return this.getOrSetCache(key, "list", () => this.tmdbService.discoverAdvanced(query));
    }

    async getCachedTitleDetails(mediaType: string, id: string) {
        return this.getOrSetCache(id, mediaType, () => this.tmdbService.getTitleDetails(mediaType, id));
    }

    async getCachedSeasonDetails(tvId: string, seasonNumber: string) {
        const key = `${tvId}_s${seasonNumber}`;
        return this.getOrSetCache(key, "season", () => this.tmdbService.getSeasonDetails(tvId, seasonNumber));
    }

    async getCachedEpisodeDetails(tvId: string, seasonNumber: string, episodeNumber: string) {
        const key = `${tvId}_s${seasonNumber}_e${episodeNumber}`;
        return this.getOrSetCache(key, "episode", () => this.tmdbService.getEpisodeDetails(tvId, seasonNumber, episodeNumber));
    }

    async getCachedPersonDetails(personId: string) {
        return this.getOrSetCache(personId, "person", () => this.tmdbService.getPersonDetails(personId));
    }
}
