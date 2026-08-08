import jwt, {
  type SignOptions,
  type Secret,
  type JwtPayload as JwtPayloadType,
} from "jsonwebtoken";
import { env } from "../../config/env.js";
import { USER_ROLE } from "../constants/roles.js";

export interface JwtPayload {
  userId: string;
  email: string;
  role: (typeof USER_ROLE)[keyof typeof USER_ROLE];
}

export const generateAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(
    payload,
    env.ACCESS_TOKEN_SECRET as Secret,
    {
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
    } as SignOptions
  );
};

export const generateRefreshToken = (payload: JwtPayload): string => {
  return jwt.sign(
    payload,
    env.REFRESH_TOKEN_SECRET as Secret,
    {
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    } as SignOptions
  );
};

export const verifyAccessToken = (
  token: string
): JwtPayload & JwtPayloadType => {
  return jwt.verify(
    token,
    env.ACCESS_TOKEN_SECRET as Secret
  ) as JwtPayload & JwtPayloadType;
};

export const verifyRefreshToken = (
  token: string
): JwtPayload & JwtPayloadType => {
  return jwt.verify(
    token,
    env.REFRESH_TOKEN_SECRET as Secret
  ) as JwtPayload & JwtPayloadType;
};