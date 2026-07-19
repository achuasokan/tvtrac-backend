export interface ITmdbCacheService {
    getCachedTrending(): Promise<any>;
    getCachedTrendingTv(page?: string): Promise<any>;
    getCachedTrendingMovies(page?: string): Promise<any>;
    getCachedDiscoverByNetwork(providerId: string, page?: string, filterType?: string, region?: string): Promise<any>;
    getCachedDiscoverByGenreName(genreName: string, page?: string, type?: string, sortBy?: string, minRating?: string, yearFrom?: string, yearTo?: string, language?: string): Promise<any>;
    getCachedDiscoverAdvanced(query: any): Promise<any>;
    getCachedTitleDetails(mediaType: string, id: string): Promise<any>;
    getCachedSeasonDetails(tvId: string, seasonNumber: string): Promise<any>;
    getCachedEpisodeDetails(tvId: string, seasonNumber: string, episodeNumber: string): Promise<any>;
    getCachedPersonDetails(personId: string): Promise<any>;
    getCachedCompany(companyId: string): Promise<any>;
    getCachedDiscoverByCompany(companyId: string, page?: string, type?: string, sortBy?: string, minRating?: string, yearFrom?: string, yearTo?: string, language?: string): Promise<any>;
}
