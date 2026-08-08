import { Schema, model, Document } from "mongoose";

export interface IOmdbCache extends Document {
    imdbId: string;
    data: any;
    lastUpdated: Date;
}

const omdbCacheSchema = new Schema(
    {
        imdbId: {
            type: String,
            required: true,
            unique: true,
        },
        data: {
            type: Schema.Types.Mixed,
            required: true,
        },
        lastUpdated: {
            type: Date,
            default: Date.now,
        }
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// TTL Index to automatically delete cached items that haven't been updated in 90 days (approx 3 months)
// This aggressively saves the 1000/day limit on the OMDB API
omdbCacheSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const OmdbCacheModel = model<IOmdbCache>("OmdbCache", omdbCacheSchema);
