import { injectable } from "inversify";
import { ITmdbCacheRepository } from "./tmdbCache.repository.interface.js";
import { TmdbCacheModel, ITmdbCache } from "../models/tmdbCache.schema.js";

@injectable()
export class TmdbCacheRepository implements ITmdbCacheRepository {
    async findByTmdbIdAndType(tmdbId: string, type: string): Promise<ITmdbCache | null> {
        return TmdbCacheModel.findOne({ tmdbId, type }).exec();
    }

    async upsertCache(tmdbId: string, type: string, data: any): Promise<void> {
        await TmdbCacheModel.findOneAndUpdate(
            { tmdbId, type },
            { 
                data,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        ).exec();
    }
}
