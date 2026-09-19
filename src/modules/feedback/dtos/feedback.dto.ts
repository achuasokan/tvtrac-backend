import { z } from "zod";

export const createFeedbackSchema = z.object({
  type: z.enum(["bug", "feature", "general"]),
  message: z
    .string()
    .trim()
    .min(5, "Message must be at least 5 characters")
    .max(2000, "Message cannot exceed 2000 characters"),
  context: z
    .object({
      url: z.string().max(500).optional(),
      userAgent: z.string().max(1000).optional(),
      screenResolution: z.string().max(50).optional(),
      platform: z.string().max(100).optional(),
      language: z.string().max(20).optional(),
    })
    .optional(),
});

export type CreateFeedbackDto = z.infer<typeof createFeedbackSchema>;
