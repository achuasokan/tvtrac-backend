import { UserDocument } from "../user.schema.js";

export interface IAuthService {

    googleLogin(idToken: string): Promise<{
        user: UserDocument;
        accessToken: string;
        refreshToken: string;
    }>;

    getCurrentUser(userId: string): Promise<UserDocument>;

    logout(userId: string): Promise<void>;

    refreshToken(token: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
}