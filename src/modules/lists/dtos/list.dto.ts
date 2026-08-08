export interface CreateListDTO {
    name: string;
    description?: string;
}

export interface UpdateListDTO {
    name?: string;
    description?: string;
}

export interface ReorderListDTO {
    items: {
        tmdbId: string;
        mediaType: 'movie' | 'tv';
        addedAt: Date;
    }[];
}

export interface AddListItemDTO {
    tmdbId: string;
    mediaType: 'movie' | 'tv';
}

export interface RemoveListItemDTO {
    tmdbId: string;
    mediaType: 'movie' | 'tv';
}

export interface ListItemResponseDTO {
    tmdbId: string;
    mediaType: 'movie' | 'tv';
    addedAt: Date;
}

export interface ListResponseDTO {
    id: string;
    userId: string;
    name: string;
    description?: string;
    items: ListItemResponseDTO[];
    createdAt: Date;
    updatedAt: Date;
}
