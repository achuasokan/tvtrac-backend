import { IFeedback } from "../models/feedback.model.js";
import { CreateFeedbackDto } from "../dtos/feedback.dto.js";

export interface IFeedbackRepository {
  create(data: CreateFeedbackDto, userId?: string | null): Promise<IFeedback>;
  findById(id: string): Promise<IFeedback | null>;
  findByIdWithUser(id: string): Promise<any | null>;
}
