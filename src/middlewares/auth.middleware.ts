import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, JwtPayload } from "../shared/utils/jwt.js";
import { HTTP_STATUS } from "../shared/constants/http-status.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token =
      req.cookies.accessToken ||
      (req.headers.authorization &&
        req.headers.authorization.split(" ")[1]);

    if (!token) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: "Access token missing" });
      return;
    }

    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: "Invalid access token" });
    return;
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(HTTP_STATUS.FORBIDDEN).json({ message: "Insufficient permissions" });
      return;
    }
    next();
  };
};
