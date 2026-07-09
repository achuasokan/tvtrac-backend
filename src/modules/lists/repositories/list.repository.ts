import { injectable } from "inversify";
import { IListRepository } from "./list.repository.interface.js";
import { IList, ListModel } from "../models/list.schema.js";

@injectable()
export class ListRepository implements IListRepository {
    
    public async createList(userId: string, name: string, description?: string): Promise<IList> {
        const newList = new ListModel({
            user: userId,
            name,
            description,
            items: []
        });
        return await newList.save();
    }

    public async updateList(userId: string, listId: string, name?: string, description?: string): Promise<IList | null> {
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;

        return await ListModel.findOneAndUpdate(
            { _id: listId, user: userId },
            { $set: updateData },
            { new: true, runValidators: true }
        ).exec();
    }

    public async getUserLists(userId: string): Promise<IList[]> {
        return await ListModel.find({ user: userId }).sort({ createdAt: -1 }).exec();
    }

    public async getListById(userId: string, listId: string): Promise<IList | null> {
        return await ListModel.findOne({ _id: listId, user: userId }).exec();
    }

    public async addToList(userId: string, listId: string, tmdbId: string, mediaType: 'movie' | 'tv'): Promise<IList | null> {
        // Find list and add item if it doesn't already exist
        const list = await ListModel.findOne({ _id: listId, user: userId }).exec();
        if (!list) return null;

        const exists = list.items.some(item => item.tmdbId === tmdbId && item.mediaType === mediaType);
        if (!exists) {
            list.items.push({ tmdbId, mediaType, addedAt: new Date() });
            await list.save();
        }
        return list;
    }

    public async removeFromList(userId: string, listId: string, tmdbId: string, mediaType: 'movie' | 'tv'): Promise<IList | null> {
        const list = await ListModel.findOne({ _id: listId, user: userId }).exec();
        if (!list) return null;

        list.items = list.items.filter(item => !(item.tmdbId === tmdbId && item.mediaType === mediaType));
        await list.save();
        return list;
    }

    public async deleteList(userId: string, listId: string): Promise<boolean> {
        const result = await ListModel.deleteOne({ _id: listId, user: userId }).exec();
        return result.deletedCount > 0;
    }
}
