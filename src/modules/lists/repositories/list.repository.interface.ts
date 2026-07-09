import { IList } from "../models/list.schema.js";

export interface IListRepository {
    createList(userId: string, name: string, description?: string): Promise<IList>;
    updateList(userId: string, listId: string, name?: string, description?: string): Promise<IList | null>;
    getUserLists(userId: string): Promise<IList[]>;
    getListById(userId: string, listId: string): Promise<IList | null>;
    addToList(userId: string, listId: string, tmdbId: string, mediaType: 'movie' | 'tv'): Promise<IList | null>;
    removeFromList(userId: string, listId: string, tmdbId: string, mediaType: 'movie' | 'tv'): Promise<IList | null>;
    reorderListItems(userId: string, listId: string, items: any[]): Promise<IList | null>;
    deleteList(userId: string, listId: string): Promise<boolean>;
}
