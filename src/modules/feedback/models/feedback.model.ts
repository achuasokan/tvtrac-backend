import { Schema, model, Document, Types } from "mongoose";

export type FeedbackType = "bug" | "feature" | "general";
export type FeedbackStatus = "new" | "reviewed" | "resolved";

export interface IFeedbackContext {
  url?: string;
  userAgent?: string;
  screenResolution?: string;
  platform?: string;
  language?: string;
}

export interface IFeedback extends Document {
  userId?: Types.ObjectId | null;
  type: FeedbackType;
  message: string;
  context?: IFeedbackContext;
  status: FeedbackStatus;
  createdAt: Date;
  updatedAt: Date;
}

const feedbackContextSchema = new Schema<IFeedbackContext>(
  {
    url: { type: String, maxlength: 500 },
    userAgent: { type: String, maxlength: 1000 },
    screenResolution: { type: String, maxlength: 50 },
    platform: { type: String, maxlength: 100 },
    language: { type: String, maxlength: 20 },
  },
  { _id: false }
);

const feedbackSchema = new Schema<IFeedback>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
    },
    type: {
      type: String,
      enum: ["bug", "feature", "general"],
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2000,
    },
    context: {
      type: feedbackContextSchema,
      required: false,
      default: {},
    },
    status: {
      type: String,
      enum: ["new", "reviewed", "resolved"],
      default: "new",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "feedbacks",
  }
);

export const FeedbackModel = model<IFeedback>("Feedback", feedbackSchema);
