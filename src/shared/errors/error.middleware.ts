import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "./AppError.js";
import { sendResponse } from "../utils/responseHelper.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import logger from "../logger.js";
import { COMMON_MESSAGES } from "../constants/common-messages.js";

export const errorHandler = (
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction // eslint-disable-line @typescript-eslint/no-unused-vars
) => {

    if (err instanceof AppError) {
        return sendResponse(res, err.statusCode, err.message);
    }

    if (err instanceof z.ZodError) {
        const message = err.issues[0]?.message || "Validation failed";
        return sendResponse(res, HTTP_STATUS.BAD_REQUEST, message);
    }

    logger.error('unhandled Error: ', {error: err});
    return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, COMMON_MESSAGES.SOMETHING_WENT_WRONG);

}