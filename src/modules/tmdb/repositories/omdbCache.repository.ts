import { injectable } from "inversify";
import { IOmdbCacheRepository } from "./omdbCache.repository.interface.js";
import { OmdbCacheModel, IOmdbCache } from "../models/omdbCache.schema.js";

@injectable()
export class OmdbCacheRepository implements IOmdbCacheRepository {
    async findByImdbId(imdbId: string): Promise<IOmdbCache | null> {
        return OmdbCacheModel.findOne({ imdbId }).exec();
    }

    async saveCache(imdbId: string, data: any): Promise<IOmdbCache> {
        return OmdbCacheModel.create({ imdbId, data });
    }
}
