import { ListResponseDTO, CreateListDTO, UpdateListDTO } from "../dtos/list.dto.js";

export interface IListService {
    createList(userId: string, data: CreateListDTO): Promise<ListResponseDTO>;
    updateList(userId: string, listId: string, data: UpdateListDTO): Promise<ListResponseDTO>;
    getUserLists(userId: string): Promise<ListResponseDTO[]>;
    addToList(userId: string, listId: string, tmdbId: string, mediaType: 'movie' | 'tv'): Promise<ListResponseDTO>;
    removeFromList(userId: string, listId: string, tmdbId: string, mediaType: 'movie' | 'tv'): Promise<ListResponseDTO>;
    deleteList(userId: string, listId: string): Promise<void>;
}
