import { UserDocument } from "../../auth/user.schema.js";

export class UserMapper {
    static toProfileResponse(user: UserDocument) {
        return {
            id: user._id,
            email: user.email,
            name: user.name,
            username: user.username,
            avatar: user.avatar,
            coverPhoto: (user as any).coverPhoto || "",
            favoriteShows: (user as any).favoriteShows || [],
            favoriteMovies: (user as any).favoriteMovies || [],
            watchlistShows: (user as any).watchlistShows || [],
            watchlistMovies: (user as any).watchlistMovies || [],
            role: user.role,
            createdAt: user.createdAt,
        };
    }
}
