import type { CreateUserDto } from "../dto/create-user.dto.js";
import { UserDocument } from "../user.schema.js";


export interface IAuthRepository {
    findByGoogleId(googleId: string): Promise<UserDocument | null>;

    findByEmail(email: string): Promise<UserDocument | null>;

    findById(id: string): Promise<UserDocument | null>;

    create(user: CreateUserDto): Promise<UserDocument>;

    update(
        id: string,
        data: Partial<CreateUserDto>
    ): Promise<UserDocument | null>;

    findByUsername(username: string): Promise<UserDocument | null>;
}