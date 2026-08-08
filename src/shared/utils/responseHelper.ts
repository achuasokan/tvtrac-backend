
import type { Response } from "express";

export const sendResponse = <T>(
    res: Response,
    statusCode: number,
    message: string,
    data: T | null = null
) => {
    return res.status(statusCode).json({
        success: statusCode < 400,
        message,
        data,
        error: statusCode >= 400 ? message : null
    });
};
