export interface CreateUserDto {
    googleId: string;
    email: string;
    name: string;
    username: string;
    avatar?: string;
}