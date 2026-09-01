import { injectable, inject } from "inversify";
import { TYPES } from "../../../di/types.js";
import { IUserRepository } from "../repositories/user.repository.interface.js";
import { ITmdbCacheService } from "../../tmdb/services/tmdbCache.service.interface.js";
import { TrackedItemModel } from "../../tracking/models/trackedItem.schema.js";
import { IUserCategorizationService } from "./userCategorization.service.interface.js";
import logger from "../../../shared/logger.js";

@injectable()
export class UserCategorizationService implements IUserCategorizationService {
    constructor(
        @inject(TYPES.UserRepository) private userRepository: IUserRepository,
        @inject(TYPES.TmdbCacheService) private tmdbCacheService: ITmdbCacheService
    ) {}

    async getCategorizedShows(userId: string, category: string, page: number = 1, limit: number = 20) {
        const startTime = performance.now();
        const user = await this.userRepository.findById(userId);
        if (!user || !user.watchlistShows || user.watchlistShows.length === 0) {
            return { data: [], total: 0, hasMore: false };
        }

        const watchlist = Array.from(new Set(user.watchlistShows));
        
        // 1. Batch fetch all tracked items for the user's watchlist in a single indexed query
        const dbStart = performance.now();
        const trackedDocs = await TrackedItemModel.find({
            user: userId,
            mediaType: 'tv',
            tmdbId: { $in: watchlist }
        }).lean();
        const dbDuration = Math.round(performance.now() - dbStart);
        const trackedMap = new Map(trackedDocs.map(doc => [doc.tmdbId, doc]));

        // 2. Fetch cached TMDB details in parallel without redundant external calls
        const promises = watchlist.map(async (tmdbId) => {
            const details = await this.tmdbCacheService.getCachedTitleDetails('tv', tmdbId);
            if (!details) return null;

            const trackedItem = trackedMap.get(tmdbId);
            const trackedData = trackedItem ? {
                watchedEpisodes: trackedItem.watchedEpisodes || [],
                ignorePreviousEpisodesPrompt: trackedItem.ignorePreviousEpisodesPrompt || false,
            } : null;

            let seasonDetails = null;
            if (details.next_episode_to_air) {
                try {
                    seasonDetails = await this.tmdbCacheService.getCachedSeasonDetails(tmdbId, String(details.next_episode_to_air.season_number));
                } catch (e) {}
            }

            // Categorization Logic (identical to established business rules)
            let nextEpisodeStr = "Up to date";
            let nextEpisodeTitle = "";
            let isUpToDate = false;
            let nextSeasonNum = undefined;
            let nextEpisodeNum = undefined;
            
            if (details.seasons && details.seasons.length > 0) {
                const watchedEps = trackedData?.watchedEpisodes || [];
                let found = false;
                
                for (const season of details.seasons) {
                    if (season.season_number === 0) continue;
                    
                    for (let epNum = 1; epNum <= season.episode_count; epNum++) {
                        // Check if this episode is unreleased
                        const nextAir = details.next_episode_to_air;
                        const isUnreleased = nextAir && (
                            season.season_number > nextAir.season_number ||
                            (season.season_number === nextAir.season_number && epNum >= nextAir.episode_number)
                        );

                        if (isUnreleased) {
                            isUpToDate = true;
                            break;
                        }

                        const isWatched = watchedEps.some((we: any) => we.season === season.season_number && we.episode === epNum);
                        if (!isWatched) {
                            nextEpisodeStr = `S${String(season.season_number).padStart(2, '0')} | E${String(epNum).padStart(2, '0')}`;
                            nextEpisodeTitle = `Episode ${epNum}`;
                            nextSeasonNum = season.season_number;
                            nextEpisodeNum = epNum;
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }
                
                if (!found) {
                    isUpToDate = true;
                    if (details.next_episode_to_air) {
                        nextEpisodeStr = `S${String(details.next_episode_to_air.season_number).padStart(2, '0')} | E${String(details.next_episode_to_air.episode_number).padStart(2, '0')}`;
                        nextEpisodeTitle = details.next_episode_to_air.name;
                    }
                }
            } else {
                isUpToDate = true;
            }

            let latestWatchDate = new Date(0);
            if (trackedData?.watchedEpisodes && trackedData.watchedEpisodes.length > 0) {
                latestWatchDate = trackedData.watchedEpisodes.reduce((latest: Date, ep: any) => {
                    if (!ep.watchedAt) return latest;
                    const epDate = new Date(ep.watchedAt);
                    return epDate > latest ? epDate : latest;
                }, new Date(0));
            }
            
            const daysSinceLastWatch = latestWatchDate.getTime() > 0 
                ? (new Date().getTime() - latestWatchDate.getTime()) / (1000 * 3600 * 24) 
                : 0;

            const hasStarted = (trackedData?.watchedEpisodes || []).length > 0;

            const showObj = {
                tmdbId,
                details,
                seasonDetails,
                trackedData,
                nextEpisodeStr,
                nextEpisodeTitle,
                nextSeason: nextSeasonNum,
                nextEpisode: nextEpisodeNum,
                isUpToDate,
                hasStarted,
                daysSinceLastWatch
            };

            return showObj;
        });

        const rawShows = await Promise.all(promises);
        const allShows = rawShows.filter((s): s is NonNullable<typeof s> => s !== null);

        // Sort by category
        let filteredShows: any[] = [];
        let historyEpisodes: any[] = [];
        let upcomingEpisodesToProcess: any[] = [];

        if (category === 'history') {
            for (const show of allShows) {
                if (show.trackedData?.watchedEpisodes) {
                    for (const ep of show.trackedData.watchedEpisodes) {
                        historyEpisodes.push({
                            tmdbId: show.tmdbId,
                            details: show.details,
                            trackedData: show.trackedData,
                            nextEpisodeStr: `S${String(ep.season).padStart(2, '0')} | E${String(ep.episode).padStart(2, '0')}`,
                            nextEpisodeTitle: `Episode ${ep.episode}`,
                            nextSeason: ep.season,
                            nextEpisode: ep.episode,
                            isHistoryItem: true,
                            watchedAt: new Date(ep.watchedAt || 0)
                        });
                    }
                }
            }
            historyEpisodes.sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
            filteredShows = historyEpisodes;
        } else if (category === 'upcoming') {
            const todayAtMidnight = new Date();
            todayAtMidnight.setHours(0, 0, 0, 0);

            for (const show of allShows) {
                if (show.seasonDetails?.episodes) {
                    for (const ep of show.seasonDetails.episodes) {
                        if (!ep.air_date) continue;
                        const [year, month, day] = ep.air_date.split('-').map(Number);
                        const airDate = new Date(year, month - 1, day);
                        if (airDate.getTime() >= todayAtMidnight.getTime()) {
                            if (!upcomingEpisodesToProcess.some(e => e.episode_number === ep.episode_number && e.season_number === ep.season_number)) {
                                upcomingEpisodesToProcess.push({ ...ep, show });
                            }
                        }
                    }
                } else if (show.details?.next_episode_to_air) {
                    upcomingEpisodesToProcess.push({ ...show.details.next_episode_to_air, show });
                }
                
                if (show.details?.last_episode_to_air) {
                    const [year, month, day] = show.details.last_episode_to_air.air_date.split('-').map(Number);
                    const lastAirDate = new Date(year, month - 1, day);
                    const diffTime = todayAtMidnight.getTime() - lastAirDate.getTime();
                    const daysSince = Math.round(diffTime / (1000 * 3600 * 24));
                    if (daysSince >= 0 && daysSince <= 30) {
                        if (!upcomingEpisodesToProcess.some(e => e.episode_number === show.details.last_episode_to_air.episode_number && e.season_number === show.details.last_episode_to_air.season_number)) {
                            upcomingEpisodesToProcess.push({ ...show.details.last_episode_to_air, show });
                        }
                    }
                }
            }

            filteredShows = upcomingEpisodesToProcess.map(ep => {
                const [year, month, day] = ep.air_date.split('-').map(Number);
                const airDate = new Date(year, month - 1, day);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diffTime = airDate.getTime() - today.getTime();
                const daysLeft = Math.round(diffTime / (1000 * 3600 * 24));
                return {
                    ...ep.show,
                    isUpcomingItem: true,
                    daysLeft,
                    airDate: airDate.toISOString(),
                    upcomingEpisodeDetails: ep
                };
            });
            filteredShows.sort((a, b) => new Date(a.airDate).getTime() - new Date(b.airDate).getTime());
        } else {
            for (const show of allShows) {
                if (category === 'watch-next' && show.hasStarted && !show.isUpToDate && show.daysSinceLastWatch <= 30) {
                    filteredShows.push(show);
                } else if (category === 'havent-watched-for-a-while' && show.hasStarted && !show.isUpToDate && show.daysSinceLastWatch > 30) {
                    filteredShows.push(show);
                } else if (category === 'havent-started' && !show.hasStarted) {
                    filteredShows.push(show);
                }
            }

            if (category === 'watch-next' || category === 'havent-watched-for-a-while') {
                filteredShows.sort((a, b) => a.daysSinceLastWatch - b.daysSinceLastWatch);
            } else if (category === 'havent-started') {
                filteredShows.reverse(); // Most recently added shows appear at the top
            }
        }

        // Pagination
        const startIndex = (page - 1) * limit;
        const paginatedShows = filteredShows.slice(startIndex, startIndex + limit);

        const totalDuration = Math.round(performance.now() - startTime);
        logger.info(`[UserCategorizationService] getCategorizedShows category=${category} count=${paginatedShows.length}/${filteredShows.length} total=${totalDuration}ms (dbBatch=${dbDuration}ms)`);

        return {
            data: paginatedShows,
            total: filteredShows.length,
            page,
            nextPage: startIndex + limit < filteredShows.length ? page + 1 : undefined,
            hasMore: startIndex + limit < filteredShows.length
        };
    }

    public async getCategorizedMovies(userId: string, category: string, page: number = 1, limit: number = 20) {
        const user = await this.userRepository.findById(userId);
        if (!user || !user.watchlistMovies || user.watchlistMovies.length === 0) {
            return { data: [], total: 0, hasMore: false };
        }

        const watchlist = Array.from(new Set(user.watchlistMovies));

        // Fetch watched movies in a single indexed query
        const trackedMovies = await TrackedItemModel.find({
            user: userId,
            mediaType: 'movie',
            tmdbId: { $in: watchlist }
        }).lean();
        const watchedMovieSet = new Set(trackedMovies.map(m => String(m.tmdbId)));
        
        // Fetch TMDB details in parallel
        const promises = watchlist.map(async (tmdbId) => {
            const details = await this.tmdbCacheService.getCachedTitleDetails('movie', tmdbId);
            if (!details) return null;

            let daysLeft = undefined;
            if (details.release_date) {
                const todayAtMidnight = new Date();
                todayAtMidnight.setHours(0, 0, 0, 0);
                const [year, month, day] = details.release_date.split('-').map(Number);
                const releaseDate = new Date(year, month - 1, day);
                const diffTime = releaseDate.getTime() - todayAtMidnight.getTime();
                daysLeft = Math.round(diffTime / (1000 * 3600 * 24));
            }

            return {
                tmdbId,
                details,
                daysLeft,
                isWatched: watchedMovieSet.has(String(tmdbId))
            };
        });

        const rawResults = await Promise.all(promises);
        const moviesData = rawResults.filter((m): m is NonNullable<typeof m> => m !== null);

        let filteredMovies: any[] = [];

        if (category === 'upcoming') {
            for (const movie of moviesData) {
                if (!movie.isWatched && movie.daysLeft !== undefined && movie.daysLeft >= -30) {
                    filteredMovies.push(movie);
                }
            }
            
            // Sort chronologically (earliest first)
            filteredMovies.sort((a, b) => {
                if (a.daysLeft === undefined) return 1;
                if (b.daysLeft === undefined) return -1;
                return a.daysLeft - b.daysLeft;
            });
        } else {
            // Watchlist category: Only return movies that have NOT been watched yet (newest added first)
            filteredMovies = moviesData.filter(movie => !movie.isWatched).reverse();
        }

        // Pagination
        const startIndex = (page - 1) * limit;
        const paginatedMovies = filteredMovies.slice(startIndex, startIndex + limit);

        return {
            data: paginatedMovies,
            total: filteredMovies.length,
            page,
            nextPage: startIndex + limit < filteredMovies.length ? page + 1 : undefined,
            hasMore: startIndex + limit < filteredMovies.length
        };
    }
}
