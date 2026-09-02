import { Schema, model, Document, Types } from "mongoose";

export interface ICommentLike extends Document {
  commentId: Types.ObjectId;
  userId: Types.ObjectId;
  createdAt: Date;
}

const commentLikeSchema = new Schema<ICommentLike>(
  {
    commentId: {
      type: Schema.Types.ObjectId,
      ref: "EpisodeComment",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

// Unique compound index: One like per user per comment
commentLikeSchema.index({ commentId: 1, userId: 1 }, { unique: true });
commentLikeSchema.index({ userId: 1, commentId: 1 });

export const CommentLikeModel = model<ICommentLike>("CommentLike", commentLikeSchema);
