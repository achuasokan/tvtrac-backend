import { injectable, inject } from "inversify";
import { TmdbService } from "./tmdb.service.js";
import { ITmdbCacheRepository } from "../repositories/tmdbCache.repository.interface.js";
import { ITmdbCacheService } from "./tmdbCache.service.interface.js";
import { TYPES } from "../../../di/types.js";
import logger from "../../../shared/logger.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@injectable()
export class TmdbCacheService implements ITmdbCacheService {
    private pendingRequests: Map<string, Promise<any>> = new Map();
    private revalidatingKeys: Set<string> = new Set();

    constructor(
        @inject(TYPES.TmdbService) private tmdbService: TmdbService,
        @inject(TYPES.TmdbCacheRepository) private tmdbCacheRepository: ITmdbCacheRepository
    ) {}

    /**
     * Helper to fetch data with automatic retry on transient network errors (ECONNRESET, ETIMEDOUT, 5xx)
     */
    private async fetchWithRetry(fetchFn: () => Promise<any>, maxRetries = 3, delays = [500, 1000]): Promise<any> {
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                return await fetchFn();
            } catch (error: any) {
                attempt++;
                const isTransient = 
                    error?.code === 'ECONNRESET' ||
                    error?.code === 'ETIMEDOUT' ||
                    error?.code === 'ENOTFOUND' ||
                    (error?.status >= 500 && error?.status < 600);

                if (attempt >= maxRetries || !isTransient) {
                    throw error;
                }

                const delay = delays[attempt - 1] || 1000;
                logger.warn(`[TmdbCacheService] Fetch attempt ${attempt} failed (${error?.code || error?.message}). Retrying in ${delay}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    private async getOrSetCache(cacheKey: string, type: string, fetchFn: () => Promise<any>, ttlMs: number = DEFAULT_TTL_MS) {
        const fullKey = `${type}:${cacheKey}`;

        // Single-flight deduplication for active in-flight requests
        if (this.pendingRequests.has(fullKey)) {
            return this.pendingRequests.get(fullKey);
        }

        const workPromise = (async () => {
            try {
                const cacheEntry = await this.tmdbCacheRepository.findByTmdbIdAndType(cacheKey, type);
                const expiryThreshold = new Date(Date.now() - ttlMs);

                // Case 1: Fresh Cache -> Return immediately
                if (cacheEntry && cacheEntry.lastUpdated > expiryThreshold) {
                    return cacheEntry.data;
                }

                // Case 2: Stale Cache -> Return stale immediately + trigger background refresh (SWR) with single-flight lock
                if (cacheEntry) {
                    if (!this.revalidatingKeys.has(fullKey)) {
                        this.revalidatingKeys.add(fullKey);
                        // Async background revalidation
                        (async () => {
                            try {
                                const freshData = await this.fetchWithRetry(fetchFn);
                                if (freshData) {
                                    await this.tmdbCacheRepository.upsertCache(cacheKey, type, freshData);
                                }
                            } catch (err: any) {
                                logger.error(`[TmdbCacheService] Background revalidation failed for ${fullKey}: ${err?.message}`);
                            } finally {
                                this.revalidatingKeys.delete(fullKey);
                            }
                        })();
                    }
                    return cacheEntry.data;
                }

                // Case 3: No Cache -> Fetch with retries, upsert and return
                try {
                    const freshData = await this.fetchWithRetry(fetchFn);
                    await this.tmdbCacheRepository.upsertCache(cacheKey, type, freshData);
                    return freshData;
                } catch (fetchError: any) {
                    logger.error(`[TmdbCacheService] TMDB fetch failed for ${fullKey}: ${fetchError?.message}`);
                    // Return controlled fallback structure instead of throwing 500
                    return { results: [], source: "fallback" };
                }
            } finally {
                this.pendingRequests.delete(fullKey);
            }
        })();

        this.pendingRequests.set(fullKey, workPromise);
        return workPromise;
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

    async getCachedCompany(companyId: string) {
        return this.getOrSetCache(companyId, "company", () => this.tmdbService.getCompany(companyId));
    }

    async getCachedDiscoverByCompany(companyId: string, page: string = "1", type: string = "movie", sortBy: string = "popularity.desc", minRating?: string, yearFrom?: string, yearTo?: string, language?: string) {
        const key = `discover_company_${companyId}_type_${type}_page_${page}_sort_${sortBy}_minRating_${minRating || ''}_yearFrom_${yearFrom || ''}_yearTo_${yearTo || ''}_lang_${language || ''}`;
        return this.getOrSetCache(key, "list", () => this.tmdbService.discoverByCompany(companyId, page, type, sortBy, minRating, yearFrom, yearTo, language));
    }

    async getCachedDiscoverByKeyword(keywordId: string, page: string = "1", type: string = "movie", sortBy: string = "popularity.desc") {
        const key = `discover_keyword_${keywordId}_type_${type}_page_${page}_sort_${sortBy}`;
        return this.getOrSetCache(key, "list", () => this.tmdbService.discoverByKeyword(keywordId, page, type, sortBy));
    }

    async getCachedCollection(collectionId: string) {
        return this.getOrSetCache(`collection_${collectionId}`, "collection", () => this.tmdbService.getCollection(collectionId));
    }
}
