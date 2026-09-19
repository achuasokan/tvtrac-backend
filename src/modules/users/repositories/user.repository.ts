import { injectable } from "inversify";
import { UserDocument, UserModel } from "../../auth/user.schema.js";
import { IUserRepository } from "./user.repository.interface.js";

@injectable()
export class UserRepository implements IUserRepository {
    async findById(id: string): Promise<UserDocument | null> {
        return await UserModel.findById(id);
    }

    async findByUsername(username: string): Promise<UserDocument | null> {
        return await UserModel.findOne({ username });
    }

    async update(id: string, data: Partial<any>): Promise<UserDocument | null> {
        return await UserModel.findByIdAndUpdate(id, data, { returnDocument: 'after' });
    }

    async addFavorite(id: string, type: 'shows' | 'movies', tmdbId: string): Promise<UserDocument | null> {
        const field = type === 'shows' ? 'favoriteShows' : 'favoriteMovies';
        return await UserModel.findByIdAndUpdate(
            id,
            { $addToSet: { [field]: tmdbId } },
            { returnDocument: 'after' }
        );
    }

    async removeFavorite(id: string, type: 'shows' | 'movies', tmdbId: string): Promise<UserDocument | null> {
        const field = type === 'shows' ? 'favoriteShows' : 'favoriteMovies';
        return await UserModel.findByIdAndUpdate(
            id,
            { $pull: { [field]: tmdbId } },
            { returnDocument: 'after' }
        );
    }

    async addWatchlist(id: string, type: 'shows' | 'movies', tmdbId: string): Promise<UserDocument | null> {
        const field = type === 'shows' ? 'watchlistShows' : 'watchlistMovies';
        return await UserModel.findByIdAndUpdate(
            id,
            { $addToSet: { [field]: tmdbId } },
            { returnDocument: 'after' }
        );
    }

    async removeWatchlist(id: string, type: 'shows' | 'movies', tmdbId: string): Promise<UserDocument | null> {
        const field = type === 'shows' ? 'watchlistShows' : 'watchlistMovies';
        return await UserModel.findByIdAndUpdate(
            id,
            { $pull: { [field]: tmdbId } },
            { returnDocument: 'after' }
        );
    }
}
