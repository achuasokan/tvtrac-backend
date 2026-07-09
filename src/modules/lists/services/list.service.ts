import { inject, injectable } from "inversify";
import { IListService } from "./list.service.interface.js";
import { IListRepository } from "../repositories/list.repository.interface.js";
import { TYPES } from "../../../di/types.js";
import { ListMapper } from "../mappers/list.mapper.js";
import { CreateListDTO, ListResponseDTO, UpdateListDTO } from "../dtos/list.dto.js";

@injectable()
export class ListService implements IListService {
    constructor(@inject(TYPES.ListRepository) private listRepository: IListRepository) {}

    public async createList(userId: string, data: CreateListDTO): Promise<ListResponseDTO> {
        const list = await this.listRepository.createList(userId, data.name, data.description);
        return ListMapper.toDTO(list);
    }

    public async updateList(userId: string, listId: string, data: UpdateListDTO): Promise<ListResponseDTO> {
        const list = await this.listRepository.updateList(userId, listId, data.name, data.description);
        if (!list) {
            throw new Error("List not found or you don't have permission");
        }
        return ListMapper.toDTO(list);
    }

    public async getUserLists(userId: string): Promise<ListResponseDTO[]> {
        const lists = await this.listRepository.getUserLists(userId);
        return lists.map(ListMapper.toDTO);
    }

    public async addToList(userId: string, listId: string, tmdbId: string, mediaType: 'movie' | 'tv'): Promise<ListResponseDTO> {
        const list = await this.listRepository.addToList(userId, listId, tmdbId, mediaType);
        if (!list) {
            throw new Error("List not found");
        }
        return ListMapper.toDTO(list);
    }

    public async removeFromList(userId: string, listId: string, tmdbId: string, mediaType: 'movie' | 'tv'): Promise<ListResponseDTO> {
        const list = await this.listRepository.removeFromList(userId, listId, tmdbId, mediaType);
        if (!list) {
            throw new Error("List not found");
        }
        return ListMapper.toDTO(list);
    }

    public async deleteList(userId: string, listId: string): Promise<void> {
        const deleted = await this.listRepository.deleteList(userId, listId);
        if (!deleted) {
            throw new Error("List not found or you don't have permission");
        }
    }
}
