import { ITmdbCache } from "../models/tmdbCache.schema.js";

export interface ITmdbCacheRepository {
    findByTmdbIdAndType(tmdbId: string, type: string): Promise<ITmdbCache | null>;
    upsertCache(tmdbId: string, type: string, data: any): Promise<void>;
}
