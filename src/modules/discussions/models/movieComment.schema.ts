import { Schema, model, Document, Types } from "mongoose";

export interface IMovieCommentMediaProjection {
  mediaId: Types.ObjectId;
  type: 'image' | 'gif';
  provider: 'cloudinary' | 'giphy';
  url: string;
}

export interface IMovieComment extends Document {
  user: Types.ObjectId;
  tmdbId: string;
  content: string;
  media?: IMovieCommentMediaProjection | null;
  isSpoiler: boolean;
  likeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const movieCommentMediaSchema = new Schema<IMovieCommentMediaProjection>(
  {
    mediaId: { type: Schema.Types.ObjectId, ref: "DiscussionMedia", required: true },
    type: { type: String, enum: ['image', 'gif'], required: true },
    provider: { type: String, enum: ['cloudinary', 'giphy'], required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const movieCommentSchema = new Schema<IMovieComment>(
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
      type: movieCommentMediaSchema,
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
movieCommentSchema.index({ tmdbId: 1, createdAt: -1, _id: -1 });
movieCommentSchema.index({ tmdbId: 1, likeCount: -1, _id: -1 });
movieCommentSchema.index({ user: 1 });

export const MovieCommentModel = model<IMovieComment>("MovieComment", movieCommentSchema);
