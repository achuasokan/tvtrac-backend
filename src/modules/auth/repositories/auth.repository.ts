import { injectable } from "inversify";


import type { CreateUserDto } from "../dto/create-user.dto.js";
import { UserDocument, UserModel } from "../user.schema.js";
import { IAuthRepository } from "./auth.repoistory.interface.js";

@injectable()
export class AuthRepository implements IAuthRepository {
    async findByGoogleId(
        googleId: string
    ): Promise<UserDocument | null> {
        return await UserModel.findOne({ googleId });
    }

    async findByEmail(
        email: string
    ): Promise<UserDocument | null> {
        return await UserModel.findOne({ email });
    }

    async findById(
        id: string
    ): Promise<UserDocument | null> {
        return await UserModel.findById(id);
    }

    async create(
        user: CreateUserDto
    ): Promise<UserDocument> {
        return await UserModel.create(user);
    }

    async update(
        id: string,
        data: Partial<CreateUserDto>
    ): Promise<UserDocument | null> {
        return await UserModel.findByIdAndUpdate(
            id,
            data,
            {
                new: true,
            }
        );
    }

    async findByUsername(
        username: string
    ): Promise<UserDocument | null> {
        return await UserModel.findOne({ username });
    }
}