import { injectable, inject } from "inversify";

import type { IAuthService } from "./auth.service.interface.js";

import { TYPES } from "../../../di/types.js";
import { IAuthRepository } from "../repositories/auth.repoistory.interface.js";
import { verifyGoogleToken } from "../googleVerify.js";
import { USER_ROLE } from "../../../shared/constants/roles.js";
import { generateUsername } from "../../../shared/utils/username.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../../../shared/utils/jwt.js";
import { CreateUserDto } from "../dto/create-user.dto.js";

@injectable()
export class AuthService implements IAuthService {

    constructor(
        @inject(TYPES.AuthRepository)
        private readonly authRepository: IAuthRepository
    ) {}

    async googleLogin(googleAccessToken: string) {
        const payload = await verifyGoogleToken(googleAccessToken);
        const { sub: googleId, email, name, picture } = payload;
        
        if (!email) {
            throw new Error("Google token payload is missing email");
        }

        let user = await this.authRepository.findByGoogleId(googleId);

        if (!user) {
            user = await this.authRepository.findByEmail(email);
            if (user) {
                // Link account if email exists but no googleId
                user = await this.authRepository.update(user.id, { googleId, avatar: picture });
            } else {
                // Create new user
                const username = generateUsername(name || "user");
                user = await this.authRepository.create({
                    googleId,
                    email,
                    name: name || "Google User",
                    username,
                    avatar: picture || "",
                    role: USER_ROLE.USER,
                } as CreateUserDto);
            }
        }

        if (!user) throw new Error("Could not create user");

        const tokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
        };

        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        return { user, accessToken, refreshToken };
    }

    async getCurrentUser(userId: string) {
        const user = await this.authRepository.findById(userId);
        if (!user) {
            throw new Error("User not found");
        }
        return user;
    }

    async logout(userId: string) {
        // Since we are not storing the refresh token in the DB for now,
        // logout is simply clearing the cookies on the client side,
        // which will be handled by the controller.
        return;
    }

    async refreshToken(token: string) {
        const decoded = verifyRefreshToken(token);
        const user = await this.authRepository.findById(decoded.userId);
        if (!user) {
            throw new Error("User not found");
        }

        const tokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
        };

        const newAccessToken = generateAccessToken(tokenPayload);
        const newRefreshToken = generateRefreshToken(tokenPayload);

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    }
}