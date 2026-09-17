import { ListResponseDTO, CreateListDTO, UpdateListDTO } from "../dtos/list.dto.js";

export interface ImportListItemDTO {
    tvdbId?: string;
    imdbId?: string;
    title?: string;
    mediaType?: 'movie' | 'tv';
    position: number;
}

export interface ImportListBatchDTO {
    name: string;
    description?: string;
    items: ImportListItemDTO[];
}

export interface UnresolvedCandidateDTO {
    id: number | string;
    title: string;
    mediaType: 'movie' | 'tv';
    firstAirDate?: string;
    releaseDate?: string;
    year?: number;
    originalLanguage?: string;
    originCountry?: string[];
    posterPath?: string;
    voteAverage?: number;
    voteCount?: number;
    popularity?: number;
}

export interface UnresolvedGroupDTO {
    groupKey: string;
    title?: string;
    mediaType?: 'movie' | 'tv';
    titleYear?: number;
    tvdbId?: string;
    imdbId?: string;
    status: 'ambiguous' | 'unmatched' | 'rejected';
    occurrences: number;
    positions: number[];
    reason: string;
    candidates?: UnresolvedCandidateDTO[];
}

export interface ImportListBatchResult {
    listId: string;
    listName: string;
    processed: number;
    importedItems: number;
    duplicatesCount?: number;
    unmatched: Array<{
        title?: string;
        tvdbId?: string;
        imdbId?: string;
        mediaType?: string;
        position?: number;
        status?: 'unmatched' | 'rejected' | 'ambiguous';
        candidateTitle?: string;
        reason: string;
        candidates?: UnresolvedCandidateDTO[];
    }>;
    unresolvedGroups?: UnresolvedGroupDTO[];
    failed: Array<{
        title?: string;
        tvdbId?: string;
        imdbId?: string;
        reason: string;
    }>;
}

export interface IListService {
    createList(userId: string, data: CreateListDTO): Promise<ListResponseDTO>;
    updateList(userId: string, listId: string, data: UpdateListDTO): Promise<ListResponseDTO>;
    getUserLists(userId: string): Promise<ListResponseDTO[]>;
    addToList(userId: string, listId: string, tmdbId: string, mediaType: 'movie' | 'tv', position?: number): Promise<ListResponseDTO>;
    removeFromList(userId: string, listId: string, tmdbId: string, mediaType: 'movie' | 'tv'): Promise<ListResponseDTO>;
    reorderListItems(userId: string, listId: string, items: any[]): Promise<ListResponseDTO>;
    deleteList(userId: string, listId: string): Promise<void>;
    importBatch(userId: string, data: ImportListBatchDTO): Promise<ImportListBatchResult>;
}
