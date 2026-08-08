export interface IUserCategorizationService {
    getCategorizedShows(userId: string, category: string, page?: number, limit?: number): Promise<{
        data: any[];
        total: number;
        hasMore: boolean;
    }>;
    getCategorizedMovies(userId: string, category: string, page?: number, limit?: number): Promise<{
        data: any[];
        total: number;
        hasMore: boolean;
    }>;
}
