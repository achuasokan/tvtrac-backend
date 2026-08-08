import { Schema, model, Document } from "mongoose";

export interface IYoutubeCache extends Document {
    query: string;
    url: string;
    title: string;
    videoId: string;
    thumbnail: string;
    createdAt: Date;
}

const youtubeCacheSchema = new Schema(
    {
        query: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        url: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        videoId: {
            type: String,
            required: true,
        },
        thumbnail: {
            type: String,
            required: true,
        }
    },
    {
        timestamps: true,
    }
);

// Optional: Expire the cache after a month (30 days) to keep it fresh
youtubeCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const YoutubeCacheModel = model<IYoutubeCache>("YoutubeCache", youtubeCacheSchema);
