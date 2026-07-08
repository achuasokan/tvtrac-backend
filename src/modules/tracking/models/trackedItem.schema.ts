import { Schema, model, Document, Types } from "mongoose";

export interface ITrackedItem extends Document {
    user: Types.ObjectId;
    tmdbId: string;
    mediaType: string;
    watchedEpisodes: { season: number; episode: number; watchedAt?: Date }[];
    ignorePreviousEpisodesPrompt: boolean;
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
            watchedAt: { type: Date, default: Date.now }
        }],
        ignorePreviousEpisodesPrompt: {
            type: Boolean,
            default: false,
        }
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

trackedItemSchema.index({ user: 1, tmdbId: 1, mediaType: 1 }, { unique: true });

export const TrackedItemModel = model("TrackedItem", trackedItemSchema);
