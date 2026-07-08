import { Request, Response, NextFunction } from "express";
import { injectable, inject } from "inversify";
import { TYPES } from "../../../di/types.js";
import { IAuthService } from "../services/auth.service.interface.js";
import { setAuthCookies, clearAuthCookies } from "../../../shared/utils/cookie.js";
import { HTTP_STATUS } from "../../../shared/constants/http-status.js";

@injectable()
export class AuthController {
    constructor(
        @inject(TYPES.AuthService)
        private readonly authService: IAuthService
    ) {}

    public googleLogin = async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const { accessToken } = req.body;
            if (!accessToken) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({ message: "accessToken is required" });
                return;
            }

            const { user, accessToken: newAccessToken, refreshToken } = await this.authService.googleLogin(accessToken);
            setAuthCookies(res, newAccessToken, refreshToken);

            res.status(HTTP_STATUS.OK).json({
                message: "Logged in successfully",
                user,
            });
        } catch (error) {
            next(error);
        }
    };

    public logout = async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            // @ts-ignore
            const userId = req.user?.id;
            if (userId) {
                await this.authService.logout(userId);
            }

            clearAuthCookies(res);
            res.status(HTTP_STATUS.OK).json({ message: "Logged out successfully" });
        } catch (error) {
            next(error);
        }
    };

    public refreshToken = async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const token = req.cookies.refreshToken;
            if (!token) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: "Refresh token missing" });
                return;
            }

            const { accessToken, refreshToken } = await this.authService.refreshToken(token);
            setAuthCookies(res, accessToken, refreshToken);

            res.status(HTTP_STATUS.OK).json({
                message: "Tokens refreshed successfully",
            });
        } catch (error) {
            next(error);
        }
    };

    public getCurrentUser = async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            // @ts-ignore
            const userId = req.user?.userId || req.user?.id;
            if (!userId) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: "Not authenticated" });
                return;
            }

            const user = await this.authService.getCurrentUser(userId);
            res.status(HTTP_STATUS.OK).json({ user });
        } catch (error) {
            next(error);
        }
    };
}
