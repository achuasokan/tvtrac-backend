import { IList } from "../models/list.schema.js";
import { ListResponseDTO } from "../dtos/list.dto.js";

export class ListMapper {
    public static toDTO(list: IList): ListResponseDTO {
        return {
            id: list._id.toString(),
            userId: list.user.toString(),
            name: list.name,
            description: list.description,
            items: list.items.map(item => ({
                tmdbId: item.tmdbId,
                mediaType: item.mediaType,
                addedAt: item.addedAt,
            })),
            createdAt: list.createdAt,
            updatedAt: list.updatedAt,
        };
    }
}
