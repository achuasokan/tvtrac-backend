import { injectable } from "inversify";
import { Types } from "mongoose";
import { IFeedbackRepository } from "./feedback.repository.interface.js";
import { IFeedback, FeedbackModel } from "../models/feedback.model.js";
import { CreateFeedbackDto } from "../dtos/feedback.dto.js";

@injectable()
export class FeedbackRepository implements IFeedbackRepository {
  public async create(data: CreateFeedbackDto, userId?: string | null): Promise<IFeedback> {
    const feedback = new FeedbackModel({
      userId: userId ? new Types.ObjectId(userId) : null,
      type: data.type,
      message: data.message,
      context: data.context || {},
      status: "new",
    });

    return await feedback.save();
  }

  public async findById(id: string): Promise<IFeedback | null> {
    return await FeedbackModel.findById(id).exec();
  }

  public async findByIdWithUser(id: string): Promise<any | null> {
    return await FeedbackModel.findById(id).populate("userId", "username email name").exec();
  }
}
