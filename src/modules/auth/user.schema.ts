import { Schema, model, type InferSchemaType, HydratedDocument } from "mongoose";
import { USER_ROLE } from "../../shared/constants/roles.js";

const userSchema = new Schema(
    {
        googleId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        username: {
            type: String,
            unique: true,
            required: true,
            trim: true,
        },

        avatar: {
            type: String,
            default: "",
        },

        role: {
            type: String,
            enum: Object.values(USER_ROLE),
            default: USER_ROLE.USER,
        },

        coverPhoto: {
            type: String,
            default: "",
        },

        favoriteShows: [{
            type: String,
        }],

        favoriteMovies: [{
            type: String,
        }],

        isBlocked: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

export const UserModel = model("User", userSchema);

export type UserDocument = InstanceType<typeof UserModel>;