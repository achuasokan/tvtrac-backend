import { Schema, model, Document, Types } from "mongoose";

export type MediaAttachmentType = 'image' | 'gif';
export type MediaProvider = 'cloudinary' | 'giphy';
export type MediaAttachmentStatus = 'pending' | 'attached' | 'pending_deletion' | 'deleted';

export interface IDiscussionMedia extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: MediaAttachmentType;
  provider: MediaProvider;
  url: string;
  publicId?: string; // Cloudinary asset ID for deletion
  providerId?: string; // GIPHY ID
  status: MediaAttachmentStatus;
  commentId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const discussionMediaSchema = new Schema<IDiscussionMedia>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ['image', 'gif'],
      required: true,
    },
    provider: {
      type: String,
      enum: ['cloudinary', 'giphy'],
      required: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      trim: true,
    },
    providerId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'attached', 'pending_deletion', 'deleted'],
      default: 'pending',
    },
    commentId: {
      type: Schema.Types.ObjectId,
      ref: "EpisodeComment",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Unique partial index: Ensures no comment can EVER have more than one DiscussionMedia attachment
discussionMediaSchema.index(
  { commentId: 1 },
  { unique: true, partialFilterExpression: { commentId: { $type: 'objectId' } } }
);

// Indexes for fast lookup and cleanup queries
discussionMediaSchema.index({ userId: 1, status: 1 });
discussionMediaSchema.index({ status: 1, createdAt: 1 });

export const DiscussionMediaModel = model<IDiscussionMedia>("DiscussionMedia", discussionMediaSchema);
