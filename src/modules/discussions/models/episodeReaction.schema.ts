import { Schema, model, Document, Types } from "mongoose";

export interface IEpisodeReaction extends Document {
  user: Types.ObjectId;
  tmdbId: string;
  season: number;
  episode: number;
  emotion?: 'mindblown' | 'loved' | 'funny' | 'epic' | 'tense' | 'shocked' | 'emotional' | 'confused' | 'angry' | 'boring' | null;
  characterId?: number | null;
  rating?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const episodeReactionSchema = new Schema<IEpisodeReaction>(
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
    season: {
      type: Number,
      required: true,
    },
    episode: {
      type: Number,
      required: true,
    },
    emotion: {
      type: String,
      enum: ['mindblown', 'loved', 'funny', 'epic', 'tense', 'shocked', 'emotional', 'confused', 'angry', 'boring', null],
      default: null,
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
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Exactly one reaction per user per episode
episodeReactionSchema.index({ user: 1, tmdbId: 1, season: 1, episode: 1 }, { unique: true });
// Fast lookup for episode aggregations
episodeReactionSchema.index({ tmdbId: 1, season: 1, episode: 1 });

export const EpisodeReactionModel = model<IEpisodeReaction>("EpisodeReaction", episodeReactionSchema);
