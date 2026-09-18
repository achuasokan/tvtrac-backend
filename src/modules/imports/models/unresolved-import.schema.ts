import { Schema, model, Document, Types } from "mongoose";

export interface IUnresolvedCandidate {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  releaseYear?: number | null;
  overview?: string;
  posterPath?: string | null;
  voteAverage?: number;
  voteCount?: number;
}

export interface IUnresolvedImportItem extends Document {
  userId: Types.ObjectId;
  jobId: string;
  sourceTitle: string;
  sourceYear?: number | null;
  sourceMediaType: 'movie' | 'tv' | 'unknown';
  sourceExternalIds?: {
    tvdbId?: string;
    imdbId?: string;
  };
  candidates: IUnresolvedCandidate[];
  reason: string;
  status: 'unresolved' | 'resolved';
  resolvedTmdbId?: string;
  resolvedMediaType?: 'movie' | 'tv';
  occurrences: number;
  targetListId?: string;
  targetListName?: string;
  positions?: number[];
  createdAt: Date;
  updatedAt: Date;
}

const unresolvedCandidateSchema = new Schema(
  {
    tmdbId: { type: Number, required: true },
    mediaType: { type: String, enum: ['movie', 'tv'], required: true },
    title: { type: String, required: true },
    releaseYear: { type: Number, required: false },
    overview: { type: String, required: false },
    posterPath: { type: String, required: false },
    voteAverage: { type: Number, required: false },
    voteCount: { type: Number, required: false },
  },
  { _id: false }
);

const unresolvedImportItemSchema = new Schema<IUnresolvedImportItem>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jobId: {
      type: String,
      required: true,
      index: true,
    },
    sourceTitle: {
      type: String,
      required: true,
      trim: true,
    },
    sourceYear: {
      type: Number,
      required: false,
    },
    sourceMediaType: {
      type: String,
      enum: ['movie', 'tv', 'unknown'],
      default: 'unknown',
    },
    sourceExternalIds: {
      tvdbId: { type: String, required: false },
      imdbId: { type: String, required: false },
    },
    candidates: [unresolvedCandidateSchema],
    reason: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['unresolved', 'resolved'],
      default: 'unresolved',
      index: true,
    },
    resolvedTmdbId: {
      type: String,
      required: false,
    },
    resolvedMediaType: {
      type: String,
      enum: ['movie', 'tv'],
      required: false,
    },
    occurrences: {
      type: Number,
      default: 1,
    },
    targetListId: {
      type: String,
      required: false,
    },
    targetListName: {
      type: String,
      required: false,
    },
    positions: [{ type: Number }],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for fast, user-scoped retrieval and resolution
unresolvedImportItemSchema.index({ userId: 1, jobId: 1, status: 1 });
unresolvedImportItemSchema.index({ userId: 1, _id: 1 });

export const UnresolvedImportModel = model<IUnresolvedImportItem>(
  "UnresolvedImportItem",
  unresolvedImportItemSchema
);
