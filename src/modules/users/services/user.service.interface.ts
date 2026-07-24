import { UserDocument } from "../../auth/user.schema.js";
import { UpdateProfileDto } from "../dto/user.dto.js";

export interface IUserService {
    getProfile(userId: string): Promise<UserDocument>;
    updateProfileDetails(userId: string, data: UpdateProfileDto): Promise<UserDocument>;
    uploadAvatar(userId: string, file: Express.Multer.File): Promise<UserDocument>;
    uploadCoverPhoto(userId: string, file: Express.Multer.File): Promise<UserDocument>;
    deleteAvatar(userId: string): Promise<UserDocument>;
    deleteCoverPhoto(userId: string): Promise<UserDocument>;
    toggleFavorite(userId: string, type: 'shows' | 'movies', tmdbId: string, action: 'add' | 'remove'): Promise<UserDocument>;
    toggleWatchlist(userId: string, type: 'shows' | 'movies', tmdbId: string, action: 'add' | 'remove'): Promise<UserDocument>;
}
