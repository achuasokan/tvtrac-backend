import { Schema, model, Document } from "mongoose";

export interface ITmdbCache extends Document {
    tmdbId: string;
    type: string; // 'movie', 'tv', 'season', 'episode', 'person', 'list'
    seasonNumber?: number; // only if type is 'season'
    data: any; // the JSON response
    lastUpdated: Date;
}

const tmdbCacheSchema = new Schema(
    {
        tmdbId: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ['movie', 'tv', 'season', 'episode', 'person', 'list'],
            required: true,
        },
        seasonNumber: {
            type: Number,
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

// Compound index to ensure uniqueness for tmdbId + type + seasonNumber
tmdbCacheSchema.index({ tmdbId: 1, type: 1, seasonNumber: 1 }, { unique: true });

// TTL Index to automatically delete cached items that haven't been updated in 7 days
tmdbCacheSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const TmdbCacheModel = model<ITmdbCache>("TmdbCache", tmdbCacheSchema);
