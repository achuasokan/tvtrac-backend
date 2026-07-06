import { z } from "zod";

export const googleLoginSchema = z.object({
    idToken: z
        .string({
            message: "Google ID Token is required",
        })
        .min(1, "Google ID Token is required"),
});

export type GoogleLoginSchema = z.infer<typeof googleLoginSchema>;