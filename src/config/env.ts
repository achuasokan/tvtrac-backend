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
  PORT: Number(getEnv("PORT")),

  MONGO_URI: getEnv("MONGO_URI"),

  GOOGLE_CLIENT_ID: getEnv("GOOGLE_CLIENT_ID"),

  GOOGLE_CLIENT_SECRET: getEnv("GOOGLE_CLIENT_SECRET"),

  ACCESS_TOKEN_SECRET: getEnv("ACCESS_TOKEN_SECRET"),

  REFRESH_TOKEN_SECRET: getEnv("REFRESH_TOKEN_SECRET"),

  FRONTEND_URL: getEnv("FRONTEND_URL"),

  ACCESS_TOKEN_EXPIRES_IN: getEnv("ACCESS_TOKEN_EXPIRES_IN"),

REFRESH_TOKEN_EXPIRES_IN: getEnv("REFRESH_TOKEN_EXPIRES_IN"),
};