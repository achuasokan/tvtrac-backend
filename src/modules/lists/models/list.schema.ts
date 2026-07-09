import { Schema, model, Document, Types } from "mongoose";

export interface IListItem {
    tmdbId: string;
    mediaType: 'movie' | 'tv';
    addedAt: Date;
}

export interface IList extends Document {
    user: Types.ObjectId;
    name: string;
    description?: string;
    items: IListItem[];
    createdAt: Date;
    updatedAt: Date;
}

const listItemSchema = new Schema(
    {
        tmdbId: {
            type: String,
            required: true,
        },
        mediaType: {
            type: String,
            enum: ['movie', 'tv'],
            required: true,
        },
        addedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

const listSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500,
        },
        items: [listItemSchema],
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// A user shouldn't have multiple lists with the exact same name
listSchema.index({ user: 1, name: 1 }, { unique: true });

export const ListModel = model<IList>("List", listSchema);
