import { injectable, inject } from "inversify";
import { AppError } from "../../../shared/errors/AppError.js";
import { HTTP_STATUS } from "../../../shared/constants/http-status.js";
import { USER_MESSAGES } from "../../../shared/constants/user-messages.js";
import { UpdateProfileDto } from "../dto/user.dto.js";
import { UserDocument } from "../../auth/user.schema.js";

import { TYPES } from "../../../di/types.js";
import { IUserService } from "./user.service.interface.js";
import { IUserRepository } from "../repositories/user.repository.interface.js";

@injectable()
export class UserService implements IUserService {
    constructor(
        @inject(TYPES.UserRepository) private userRepository: IUserRepository
    ) {}

    async getProfile(userId: string): Promise<UserDocument> {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new AppError(USER_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
        }
        return user;
    }

    async updateProfileDetails(userId: string, data: UpdateProfileDto): Promise<UserDocument> {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new AppError(USER_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
        }

        const updateData: Partial<UpdateProfileDto> = { ...data };

        const updatedUser = await this.userRepository.update(userId, updateData);
        if (!updatedUser) {
            throw new AppError(USER_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
        }

        return updatedUser;
    }

    async uploadAvatar(userId: string, file: Express.Multer.File): Promise<UserDocument> {
        if (!file) {
            throw new AppError("No image file provided.", HTTP_STATUS.BAD_REQUEST);
        }

        if (file.size > 20 * 1024 * 1024) {
            throw new AppError("Image size must be less than 20MB.", HTTP_STATUS.BAD_REQUEST);
        }

        const updatedUser = await this.userRepository.update(userId, { avatar: file.path });
        if (!updatedUser) {
            throw new AppError(USER_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
        }

        return updatedUser;
    }

    async uploadCoverPhoto(userId: string, file: Express.Multer.File): Promise<UserDocument> {
        if (!file) {
            throw new AppError("No image file provided.", HTTP_STATUS.BAD_REQUEST);
        }

        if (file.size > 20 * 1024 * 1024) {
            throw new AppError("Image size must be less than 20MB.", HTTP_STATUS.BAD_REQUEST);
        }

        const updatedUser = await this.userRepository.update(userId, { coverPhoto: file.path });
        if (!updatedUser) {
            throw new AppError(USER_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
        }

        return updatedUser;
    }

    async deleteAvatar(userId: string): Promise<UserDocument> {
        const updatedUser = await this.userRepository.update(userId, { avatar: "" });
        if (!updatedUser) {
            throw new AppError(USER_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
        }
        return updatedUser;
    }

    async deleteCoverPhoto(userId: string): Promise<UserDocument> {
        const updatedUser = await this.userRepository.update(userId, { coverPhoto: "" });
        if (!updatedUser) {
            throw new AppError(USER_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
        }
        return updatedUser;
    }

    async toggleFavorite(userId: string, type: 'shows' | 'movies', tmdbId: string, action: 'add' | 'remove'): Promise<UserDocument> {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new AppError(USER_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
        }

        let updatedUser;
        if (action === 'add') {
            updatedUser = await this.userRepository.addFavorite(userId, type, tmdbId);
        } else {
            updatedUser = await this.userRepository.removeFavorite(userId, type, tmdbId);
        }

        if (!updatedUser) {
            throw new AppError(USER_MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
        }

        return updatedUser;
    }
}
