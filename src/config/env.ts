import dotenv from "dotenv";

dotenv.config();

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT) || 5000,

  MONGO_URI: getEnv("MONGO_URI"),

  GOOGLE_CLIENT_ID: getEnv("GOOGLE_CLIENT_ID"),

  GOOGLE_CLIENT_SECRET: getEnv("GOOGLE_CLIENT_SECRET"),

  ACCESS_TOKEN_SECRET: getEnv("ACCESS_TOKEN_SECRET"),

  REFRESH_TOKEN_SECRET: getEnv("REFRESH_TOKEN_SECRET"),

  FRONTEND_URL: getEnv("FRONTEND_URL"),

  ACCESS_TOKEN_EXPIRES_IN: getEnv("ACCESS_TOKEN_EXPIRES_IN"),

  REFRESH_TOKEN_EXPIRES_IN: getEnv("REFRESH_TOKEN_EXPIRES_IN"),

  CLOUDINARY_CLOUD_NAME: getEnv("CLOUDINARY_CLOUD_NAME"),
  CLOUDINARY_API_KEY: getEnv("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: getEnv("CLOUDINARY_API_SECRET"),

  YOUTUBE_API_KEY: getEnv("YOUTUBE_API_KEY"),

  TMDB_API_KEY: getEnv("TMDB_API_KEY"),
OMDB_API_KEY: getEnv("OMDB_API_KEY"),
};