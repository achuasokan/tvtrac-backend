import { z } from "zod";

export const UpdateProfileSchema = z.object({
    name: z.string().trim().min(1, "Name cannot be empty").optional(),
    username: z.string()
        .trim()
        .min(3, "Username must be at least 3 characters")
        .max(25, "Username cannot exceed 25 characters")
        .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores and hyphens")
        .optional(),
    avatar: z.string().url().optional(),
    coverPhoto: z.string().url().optional(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

export const ToggleFavoriteSchema = z.object({
    tmdbId: z.string().min(1, "tmdbId is required"),
    type: z.enum(["shows", "movies"]),
});

export type ToggleFavoriteDto = z.infer<typeof ToggleFavoriteSchema>;

export const ToggleWatchlistSchema = z.object({
    tmdbId: z.string().min(1, "tmdbId is required"),
    type: z.enum(["shows", "movies"]),
});

export type ToggleWatchlistDto = z.infer<typeof ToggleWatchlistSchema>;
