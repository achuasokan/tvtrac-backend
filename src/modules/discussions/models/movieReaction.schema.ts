import { Schema, model, Document, Types } from "mongoose";

export interface IMovieReaction extends Document {
  user: Types.ObjectId;
  tmdbId: string;
  characterId?: number | null;
  rating?: number | null;
  platform?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const movieReactionSchema = new Schema<IMovieReaction>(
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
    characterId: {
      type: Number,
      default: null,
    },
    rating: {
      type: Number,
      min: 1,
      max: 10,
      default: null,
    },
    platform: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Exactly one reaction per user per movie
movieReactionSchema.index({ user: 1, tmdbId: 1 }, { unique: true });
// Fast lookup for movie aggregations
movieReactionSchema.index({ tmdbId: 1 });

export const MovieReactionModel = model<IMovieReaction>("MovieReaction", movieReactionSchema);
