import { Schema, model, Document, Types } from "mongoose";

export interface ITrackedItem extends Document {
    user: Types.ObjectId;
    tmdbId: string;
    mediaType: string;
    watchedEpisodes: { season: number; episode: number; watchedAt?: Date; runtime?: number }[];
    ignorePreviousEpisodesPrompt: boolean;
    episodeRuntime: number; // minutes per episode (TV shows)
    movieRuntime: number;   // total runtime in minutes (movies)
    createdAt: Date;
}

const trackedItemSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        tmdbId: {
            type: String,
            required: true,
        },
        mediaType: {
            type: String,
            enum: ['movie', 'tv'],
            required: true,
        },
        watchedEpisodes: [{
            _id: false,
            season: { type: Number, required: true },
            episode: { type: Number, required: true },
            watchedAt: { type: Date, default: Date.now },
            runtime: { type: Number, default: 0 },
        }],
        ignorePreviousEpisodesPrompt: {
            type: Boolean,
            default: false,
        },
        episodeRuntime: {
            type: Number,
            default: 0,
        },
        movieRuntime: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

trackedItemSchema.index({ user: 1, tmdbId: 1, mediaType: 1 }, { unique: true });

export const TrackedItemModel = model("TrackedItem", trackedItemSchema);
