import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "inversify";
import { UserService } from "../services/user.service.js";
import { IUserService } from "../services/user.service.interface.js";
import { sendResponse } from "../../../shared/utils/responseHelper.js";
import { HTTP_STATUS } from "../../../shared/constants/http-status.js";
import { USER_MESSAGES } from "../../../shared/constants/user-messages.js";
import { UserMapper } from "../mappers/user.mapper.js";
import { UpdateProfileSchema, ToggleFavoriteSchema } from "../dto/user.dto.js";

import { IUserCategorizationService } from "../services/userCategorization.service.interface.js";

import { TYPES } from "../../../di/types.js";

@injectable()
export class UserController {
    constructor(
        @inject(TYPES.UserService) private userService: IUserService,
        @inject(TYPES.UserCategorizationService) private userCategorizationService: IUserCategorizationService
    ) {}

    public getProfile = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId as string;
            const user = await this.userService.getProfile(userId);
            
            return sendResponse(
                res,
                HTTP_STATUS.OK,
                USER_MESSAGES.PROFILE_FETCHED,
                UserMapper.toProfileResponse(user)
            );
        } catch (error) {
            next(error);
        }
    };

    public updateProfileDetails = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId as string;
            const data = UpdateProfileSchema.parse(req.body);

            const updatedUser = await this.userService.updateProfileDetails(userId, data);
            
            return sendResponse(
                res,
                HTTP_STATUS.OK,
                USER_MESSAGES.PROFILE_UPDATED,
                UserMapper.toProfileResponse(updatedUser)
            );
        } catch (error) {
            next(error);
        }
    };

    public uploadAvatar = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId as string;
            const file = req.file as Express.Multer.File;

            const updatedUser = await this.userService.uploadAvatar(userId, file);
            
            return sendResponse(
                res,
                HTTP_STATUS.OK,
                USER_MESSAGES.AVATAR_UPLOADED,
                UserMapper.toProfileResponse(updatedUser)
            );
        } catch (error) {
            next(error);
        }
    };

    public uploadCoverPhoto = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId as string;
            const file = req.file as Express.Multer.File;

            const updatedUser = await this.userService.uploadCoverPhoto(userId, file);
            
            return sendResponse(
                res,
                HTTP_STATUS.OK,
                USER_MESSAGES.COVER_PHOTO_UPLOADED,
                UserMapper.toProfileResponse(updatedUser)
            );
        } catch (error) {
            next(error);
        }
    };

    public deleteAvatar = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId as string;
            const updatedUser = await this.userService.deleteAvatar(userId);
            return sendResponse(
                res,
                HTTP_STATUS.OK,
                USER_MESSAGES.AVATAR_DELETED,
                UserMapper.toProfileResponse(updatedUser)
            );
        } catch (error) {
            next(error);
        }
    };

    public deleteCoverPhoto = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId as string;
            const updatedUser = await this.userService.deleteCoverPhoto(userId);
            return sendResponse(
                res,
                HTTP_STATUS.OK,
                USER_MESSAGES.COVER_PHOTO_DELETED,
                UserMapper.toProfileResponse(updatedUser)
            );
        } catch (error) {
            next(error);
        }
    };

    public toggleFavorite = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId as string;
            const { tmdbId, type } = ToggleFavoriteSchema.parse(req.body);
            const action = req.method === "DELETE" ? "remove" : "add";

            const updatedUser = await this.userService.toggleFavorite(userId, type, tmdbId, action);
            
            return sendResponse(
                res,
                HTTP_STATUS.OK,
                action === "add" ? USER_MESSAGES.FAVORITE_ADDED : USER_MESSAGES.FAVORITE_REMOVED,
                UserMapper.toProfileResponse(updatedUser)
            );
        } catch (error) {
            next(error);
        }
    };

    public toggleWatchlist = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId as string;
            const { tmdbId, type } = ToggleFavoriteSchema.parse(req.body); // We can reuse ToggleFavoriteSchema here or ToggleWatchlistSchema since they are identical
            const action = req.method === "DELETE" ? "remove" : "add";

            const updatedUser = await this.userService.toggleWatchlist(userId, type, tmdbId, action);
            
            return sendResponse(
                res,
                HTTP_STATUS.OK,
                action === "add" ? "Added to watchlist" : "Removed from watchlist",
                UserMapper.toProfileResponse(updatedUser)
            );
        } catch (error) {
            next(error);
        }
    };

    public getCategorizedShows = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId as string;
            const category = req.query.category as string;
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;

            if (!category) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: "Category is required"
                });
            }

            const result = await this.userCategorizationService.getCategorizedShows(userId, category, page, limit);

            return sendResponse(
                res,
                HTTP_STATUS.OK,
                "Categorized shows fetched successfully",
                result
            );
        } catch (error) {
            next(error);
        }
    };

    public getCategorizedMovies = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId as string;
            const category = req.query.category as string;
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;

            if (!category) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: "Category is required"
                });
            }

            const result = await this.userCategorizationService.getCategorizedMovies(userId, category, page, limit);

            return sendResponse(
                res,
                HTTP_STATUS.OK,
                "Categorized movies fetched successfully",
                result
            );
        } catch (error) {
            next(error);
        }
    };
}
