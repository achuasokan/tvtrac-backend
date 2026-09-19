import { CreateFeedbackDto } from "../dtos/feedback.dto.js";
import { IFeedback } from "../models/feedback.model.js";

export interface IFeedbackService {
  createFeedback(data: CreateFeedbackDto, userId?: string | null): Promise<IFeedback>;
}
