import { Request, Response, NextFunction } from "express";
import { redisClient } from "../config/redis.js";
import { sendResponse } from "../shared/utils/responseHelper.js";
import { HTTP_STATUS } from "../shared/constants/http-status.js";
import logger from "../shared/logger.js";

interface RateLimiterOptions {
  windowSeconds: number;
  maxRequests: number;
  prefix: string;
}

/**
 * Creates a Redis-backed rate limiter middleware reusing the existing redisClient
 */
export const createRateLimiter = (options: RateLimiterOptions) => {
  const { windowSeconds, maxRequests, prefix } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Determine client identifier: authenticated userId > forwarded-for IP > remote IP
      const identifier =
        req.user?.userId ||
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        "anonymous";

      const key = `ratelimit:${prefix}:${identifier}`;

      const current = await redisClient.incr(key);

      if (current === 1) {
        await redisClient.expire(key, windowSeconds);
      }

      if (current > maxRequests) {
        const ttl = await redisClient.ttl(key);
        const mins = Math.max(Math.ceil(ttl / 60), 1);
        logger.warn(`[RateLimiter] Rate limit exceeded for ${key} (${current}/${maxRequests})`);
        sendResponse(
          res,
          HTTP_STATUS.TOO_MANY_REQUESTS,
          `Limit reached. Try in ${mins}m`
        );
        return;
      }

      next();
    } catch (err: any) {
      // If Redis has an issue, log and fail-open so legitimate user requests are not broken
      logger.error("[RateLimiter] Redis rate limiter error, failing open:", { error: err.message });
      next();
    }
  };
};

/**
 * Feedback specific rate limit: 5 requests per 15 minutes (900 seconds) per IP/User
 */
export const feedbackRateLimiter = createRateLimiter({
  prefix: "feedback",
  windowSeconds: 15 * 60,
  maxRequests: 5,
});
