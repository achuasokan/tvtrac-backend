import { Schema, model, Document, Types } from "mongoose";

export interface IEpisodeCommentMediaProjection {
  mediaId: Types.ObjectId;
  type: 'image' | 'gif';
  provider: 'cloudinary' | 'giphy';
  url: string;
}

export interface IEpisodeComment extends Document {
  user: Types.ObjectId;
  tmdbId: string;
  season: number;
  episode: number;
  content: string;
  media?: IEpisodeCommentMediaProjection | null;
  isSpoiler: boolean;
  likeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const commentMediaSchema = new Schema<IEpisodeCommentMediaProjection>(
  {
    mediaId: { type: Schema.Types.ObjectId, ref: "DiscussionMedia", required: true },
    type: { type: String, enum: ['image', 'gif'], required: true },
    provider: { type: String, enum: ['cloudinary', 'giphy'], required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const episodeCommentSchema = new Schema<IEpisodeComment>(
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
    content: {
      type: String,
      maxlength: 2000,
      trim: true,
      default: "",
      required: function (this: any) {
        return !this.media?.url;
      },
    },
    media: {
      type: commentMediaSchema,
      default: null,
    },
    isSpoiler: {
      type: Boolean,
      default: false,
    },
    likeCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Cursor pagination indexes
episodeCommentSchema.index({ tmdbId: 1, season: 1, episode: 1, createdAt: -1, _id: -1 });
episodeCommentSchema.index({ tmdbId: 1, season: 1, episode: 1, likeCount: -1, _id: -1 });
episodeCommentSchema.index({ user: 1 });

export const EpisodeCommentModel = model<IEpisodeComment>("EpisodeComment", episodeCommentSchema);
