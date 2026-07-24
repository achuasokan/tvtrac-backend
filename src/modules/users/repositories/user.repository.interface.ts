import { UserDocument } from "../../auth/user.schema.js";

export interface IUserRepository {
    findById(id: string): Promise<UserDocument | null>;
    findByUsername(username: string): Promise<UserDocument | null>;
    update(id: string, data: Partial<any>): Promise<UserDocument | null>;
    addFavorite(id: string, type: 'shows' | 'movies', tmdbId: string): Promise<UserDocument | null>;
    removeFavorite(id: string, type: 'shows' | 'movies', tmdbId: string): Promise<UserDocument | null>;
    addWatchlist(id: string, type: 'shows' | 'movies', tmdbId: string): Promise<UserDocument | null>;
    removeWatchlist(id: string, type: 'shows' | 'movies', tmdbId: string): Promise<UserDocument | null>;
}
