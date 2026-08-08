import { IOmdbCache } from "../models/omdbCache.schema.js";

export interface IOmdbCacheRepository {
    findByImdbId(imdbId: string): Promise<IOmdbCache | null>;
    saveCache(imdbId: string, data: any): Promise<IOmdbCache>;
}
