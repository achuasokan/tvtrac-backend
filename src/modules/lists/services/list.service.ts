import { inject, injectable } from "inversify";
import { IListService, ImportListBatchDTO, ImportListBatchResult, ImportListItemDTO, UnresolvedCandidateDTO, UnresolvedGroupDTO } from "./list.service.interface.js";
import { IListRepository } from "../repositories/list.repository.interface.js";
import { TYPES } from "../../../di/types.js";
import { ListMapper } from "../mappers/list.mapper.js";
import { CreateListDTO, ListResponseDTO, UpdateListDTO } from "../dtos/list.dto.js";
import { ListModel } from "../models/list.schema.js";
import { ITmdbCacheService } from "../../tmdb/services/tmdbCache.service.interface.js";
import logger from "../../../shared/logger.js";

@injectable()
export class ListService implements IListService {
    private listLocks = new Map<string, Promise<any>>();

    constructor(
        @inject(TYPES.ListRepository) private listRepository: IListRepository,
        @inject(TYPES.TmdbCacheService) private tmdbCacheService: ITmdbCacheService
    ) {}

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

    public async addToList(userId: string, listId: string, tmdbId: string, mediaType: 'movie' | 'tv', position?: number): Promise<ListResponseDTO> {
        const list = await this.listRepository.addToList(userId, listId, tmdbId, mediaType, position);
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

    public async reorderListItems(userId: string, listId: string, items: any[]): Promise<ListResponseDTO> {
        const list = await this.listRepository.reorderListItems(userId, listId, items);
        if (!list) {
            throw new Error("List not found or you don't have permission");
        }
        return ListMapper.toDTO(list);
    }

    public async deleteList(userId: string, listId: string): Promise<void> {
        const deleted = await this.listRepository.deleteList(userId, listId);
        if (!deleted) {
            throw new Error("List not found or you don't have permission");
        }
    }

    public async importBatch(userId: string, data: ImportListBatchDTO): Promise<ImportListBatchResult> {
        const rawName = data.name || '';
        const normalizedName = rawName.trim().replace(/\s+/g, ' ');
        if (!normalizedName) {
            throw new Error("List name cannot be empty");
        }

        // Atomically find or create the list using the normalized name
        const list = await ListModel.findOneAndUpdate(
            { user: userId, name: normalizedName },
            {
                $setOnInsert: {
                    user: userId,
                    name: normalizedName,
                    description: data.description?.trim() || undefined,
                    items: [],
                }
            },
            { upsert: true, new: true }
        );

        if (data.description && !list.description) {
            await ListModel.updateOne({ _id: list._id }, { $set: { description: data.description.trim() } });
        }

        const result: ImportListBatchResult = {
            listId: String(list._id),
            listName: normalizedName,
            processed: data.items.length,
            importedItems: 0,
            duplicatesCount: 0,
            unmatched: [],
            unresolvedGroups: [],
            failed: [],
        };

        // Serialize execution for this user and list to prevent race conditions across batches
        const lockKey = `${userId}:${normalizedName}`;
        const previousLock = this.listLocks.get(lockKey) || Promise.resolve();
        const currentExecution = previousLock.then(async () => {
            await this.processListItemsBatch(userId, String(list._id), data.items, result);
        }).finally(() => {
            if (this.listLocks.get(lockKey) === currentExecution) {
                this.listLocks.delete(lockKey);
            }
        });

        this.listLocks.set(lockKey, currentExecution);
        await currentExecution;

        return result;
    }

    private async processListItemsBatch(
        userId: string,
        listId: string,
        items: ImportListItemDTO[],
        result: ImportListBatchResult
    ): Promise<void> {
        // Sort items by source position to preserve exact source sequence
        const sortedItems = [...items].sort((a, b) => a.position - b.position);
        const resolutionCache = new Map<string, { tmdbId: string; mediaType: 'movie' | 'tv' }>();

        for (const item of sortedItems) {
            try {
                let tmdbId: string | null = null;
                const imdbId = item.imdbId && item.imdbId !== '-1' ? String(item.imdbId).trim() : undefined;
                const tvdbId = item.tvdbId && item.tvdbId !== '-1' ? String(item.tvdbId).trim() : undefined;
                let resolvedMediaType: 'movie' | 'tv' | undefined = item.mediaType;
                const rawTitle = item.title ? String(item.title).trim() : undefined;
                let cleanTitle = rawTitle;
                let titleYear: number | undefined = undefined;
                if (rawTitle) {
                    const match = rawTitle.match(/^(.*?)\s*\((\d{4})\)$/);
                    if (match && match[1] && match[2]) {
                        cleanTitle = match[1].trim();
                        titleYear = parseInt(match[2], 10);
                    }
                }

                const cacheKey = `${resolvedMediaType || 'auto'}:${imdbId || tvdbId || cleanTitle?.toLowerCase()}`;
                if (resolutionCache.has(cacheKey)) {
                    const cached = resolutionCache.get(cacheKey)!;
                    tmdbId = cached.tmdbId;
                    resolvedMediaType = cached.mediaType;
                }

                // Helper references for safe title normalization and comparison
                const normalizeTitle = (s?: string) => this.normalizeTitle(s);
                const normalizeAlnum = (s?: string) => this.normalizeAlnum(s);
                const isExactTitleMatch = (cand?: string, expected?: string) => this.isExactTitleMatch(cand, expected);

                let resolutionStatus: 'unmatched' | 'rejected' | 'ambiguous' | undefined = undefined;
                let resolutionReason: string | undefined = undefined;
                let candidateSuggestions: UnresolvedCandidateDTO[] | undefined = undefined;

                // 1. External ID Resolution: IMDb
                if (!tmdbId && imdbId) {
                    try {
                        const findData = await this.tmdbCacheService.getCachedFindByExternalId(imdbId, 'imdb_id');
                        const tvResults = findData?.tv_results || [];
                        const movieResults = findData?.movie_results || [];
                        const episodeResults = findData?.tv_episode_results || [];

                        let candidateId: string | null = null;
                        let candidateType: 'movie' | 'tv' | undefined = resolvedMediaType;
                        let candidateTitle: string | undefined = undefined;
                        let candidateOriginalTitle: string | undefined = undefined;
                        let candidateDate: string | undefined = undefined;

                        if (resolvedMediaType === 'tv') {
                            if (tvResults.length > 0 && tvResults[0].id) {
                                candidateId = String(tvResults[0].id);
                                candidateType = 'tv';
                                candidateTitle = tvResults[0].name;
                                candidateOriginalTitle = tvResults[0].original_name;
                                candidateDate = tvResults[0].first_air_date;
                            } else if (episodeResults.length > 0 && episodeResults[0].show_id) {
                                candidateId = String(episodeResults[0].show_id);
                                candidateType = 'tv';
                                candidateTitle = episodeResults[0].name;
                                candidateOriginalTitle = episodeResults[0].original_name;
                                candidateDate = episodeResults[0].air_date;
                            }
                        } else if (resolvedMediaType === 'movie') {
                            if (movieResults.length > 0 && movieResults[0].id) {
                                candidateId = String(movieResults[0].id);
                                candidateType = 'movie';
                                candidateTitle = movieResults[0].title;
                                candidateOriginalTitle = movieResults[0].original_title;
                                candidateDate = movieResults[0].release_date;
                            }
                        } else {
                            if (tvResults.length > 0 && tvResults[0].id) {
                                candidateId = String(tvResults[0].id);
                                candidateType = 'tv';
                                candidateTitle = tvResults[0].name;
                                candidateOriginalTitle = tvResults[0].original_name;
                                candidateDate = tvResults[0].first_air_date;
                            } else if (movieResults.length > 0 && movieResults[0].id) {
                                candidateId = String(movieResults[0].id);
                                candidateType = 'movie';
                                candidateTitle = movieResults[0].title;
                                candidateOriginalTitle = movieResults[0].original_title;
                                candidateDate = movieResults[0].release_date;
                            } else if (episodeResults.length > 0 && episodeResults[0].show_id) {
                                candidateId = String(episodeResults[0].show_id);
                                candidateType = 'tv';
                                candidateTitle = episodeResults[0].name;
                                candidateOriginalTitle = episodeResults[0].original_name;
                                candidateDate = episodeResults[0].air_date;
                            }
                        }

                        if (candidateId && candidateType) {
                            const isPlausible = await this.validateExternalIdMatch(
                                candidateId,
                                candidateType,
                                candidateTitle,
                                candidateOriginalTitle,
                                candidateDate,
                                cleanTitle,
                                titleYear,
                                resolvedMediaType
                            );

                            if (!isPlausible) {
                                logger.warn(`[ListService] Discarding IMDb ${imdbId} collision: "${candidateTitle}" does not match expected "${cleanTitle}"`);
                                resolutionStatus = 'rejected';
                                resolutionReason = `IMDb ID ${imdbId} returned "${candidateTitle}", which does not match expected title "${cleanTitle || rawTitle}"`;
                            } else {
                                tmdbId = candidateId;
                                resolvedMediaType = candidateType;
                            }
                        }
                    } catch (err: any) {
                        logger.warn(`[ListService] IMDb lookup failed for ${imdbId}: ${err?.message}`);
                    }
                }

                // 2. External ID Resolution: TVDB
                if (!tmdbId && tvdbId) {
                    try {
                        const findData = await this.tmdbCacheService.getCachedFindByExternalId(tvdbId, 'tvdb_id');
                        const tvResults = findData?.tv_results || [];
                        const movieResults = findData?.movie_results || [];
                        const episodeResults = findData?.tv_episode_results || [];

                        let candidateId: string | null = null;
                        let candidateType: 'movie' | 'tv' | undefined = resolvedMediaType;
                        let candidateTitle: string | undefined = undefined;
                        let candidateOriginalTitle: string | undefined = undefined;
                        let candidateDate: string | undefined = undefined;

                        if (resolvedMediaType === 'tv') {
                            if (tvResults.length > 0 && tvResults[0].id) {
                                candidateId = String(tvResults[0].id);
                                candidateType = 'tv';
                                candidateTitle = tvResults[0].name;
                                candidateOriginalTitle = tvResults[0].original_name;
                                candidateDate = tvResults[0].first_air_date;
                            } else if (episodeResults.length > 0 && episodeResults[0].show_id) {
                                candidateId = String(episodeResults[0].show_id);
                                candidateType = 'tv';
                                candidateTitle = episodeResults[0].name;
                                candidateOriginalTitle = episodeResults[0].original_name;
                                candidateDate = episodeResults[0].air_date;
                            }
                        } else if (resolvedMediaType === 'movie') {
                            if (movieResults.length > 0 && movieResults[0].id) {
                                candidateId = String(movieResults[0].id);
                                candidateType = 'movie';
                                candidateTitle = movieResults[0].title;
                                candidateOriginalTitle = movieResults[0].original_title;
                                candidateDate = movieResults[0].release_date;
                            }
                        } else {
                            if (tvResults.length > 0 && tvResults[0].id) {
                                candidateId = String(tvResults[0].id);
                                candidateType = 'tv';
                                candidateTitle = tvResults[0].name;
                                candidateOriginalTitle = tvResults[0].original_name;
                                candidateDate = tvResults[0].first_air_date;
                            } else if (movieResults.length > 0 && movieResults[0].id) {
                                candidateId = String(movieResults[0].id);
                                candidateType = 'movie';
                                candidateTitle = movieResults[0].title;
                                candidateOriginalTitle = movieResults[0].original_title;
                                candidateDate = movieResults[0].release_date;
                            } else if (episodeResults.length > 0 && episodeResults[0].show_id) {
                                candidateId = String(episodeResults[0].show_id);
                                candidateType = 'tv';
                                candidateTitle = episodeResults[0].name;
                                candidateOriginalTitle = episodeResults[0].original_name;
                                candidateDate = episodeResults[0].air_date;
                            }
                        }

                        if (candidateId && candidateType) {
                            const isPlausible = await this.validateExternalIdMatch(
                                candidateId,
                                candidateType,
                                candidateTitle,
                                candidateOriginalTitle,
                                candidateDate,
                                cleanTitle,
                                titleYear,
                                resolvedMediaType
                            );

                            if (!isPlausible) {
                                logger.warn(`[ListService] Discarding TVDB ${tvdbId} collision: "${candidateTitle}" does not match expected "${cleanTitle}"`);
                                resolutionStatus = 'rejected';
                                resolutionReason = `TVDB ID ${tvdbId} returned "${candidateTitle}", which does not match expected title "${cleanTitle || rawTitle}"`;
                            } else {
                                tmdbId = candidateId;
                                resolvedMediaType = candidateType;
                            }
                        }
                    } catch (err: any) {
                        logger.warn(`[ListService] TVDB lookup failed for ${tvdbId}: ${err?.message}`);
                    }
                }

                // 3. Title Search Resolution
                if (!tmdbId && cleanTitle) {
                    try {
                        let searchResult = await this.tmdbCacheService.getCachedSearch(cleanTitle, '1');
                        let allResults = searchResult?.results || [];
                        if (allResults.length === 0 && cleanTitle !== rawTitle && rawTitle) {
                            searchResult = await this.tmdbCacheService.getCachedSearch(rawTitle, '1');
                            allResults = searchResult?.results || [];
                        }

                        const tvResults = allResults.filter(
                            (r: any) => r.media_type === 'tv' || (!r.media_type && r.first_air_date)
                        );
                        const movieResults = allResults.filter(
                            (r: any) => r.media_type === 'movie' || (!r.media_type && r.release_date && !r.first_air_date)
                        );

                        const pickBestCandidate = (
                            candidates: any[],
                            isTv: boolean
                        ): { candidate: any | null; confidence: 'high' | 'medium' | 'unmatched'; reason?: string; compatibleCandidates?: any[] } => {
                            if (!candidates || candidates.length === 0) {
                                return {
                                    candidate: null,
                                    confidence: 'unmatched',
                                    reason: `No ${isTv ? 'TV' : 'movie'} candidates returned by TMDB for "${cleanTitle}"`,
                                };
                            }

                            const getCandTitle = (r: any): string =>
                                (isTv ? r.name || r.original_name : r.title || r.original_title) || '';
                            const getCandYear = (r: any): number => {
                                const dateStr = isTv ? r.first_air_date : r.release_date;
                                return dateStr ? parseInt(dateStr.slice(0, 4), 10) : NaN;
                            };

                            // Filter out candidates whose release year directly contradicts specified titleYear
                            const nonConflicting = candidates.filter((r) => {
                                if (!titleYear) return true;
                                const y = getCandYear(r);
                                if (isNaN(y)) return true;
                                return Math.abs(y - titleYear) <= 1;
                            });

                            if (nonConflicting.length === 0) {
                                return {
                                    candidate: null,
                                    confidence: 'unmatched',
                                    reason: `All ${candidates.length} candidate(s) have release years conflicting with ${titleYear}`,
                                };
                            }

                            // Find exact normalized title matches
                            const exactMatches = nonConflicting.filter((r) => {
                                const t = getCandTitle(r);
                                return (
                                    isExactTitleMatch(t, cleanTitle) ||
                                    (rawTitle ? isExactTitleMatch(t, rawTitle) : false)
                                );
                            });

                            if (exactMatches.length === 1) {
                                return { candidate: exactMatches[0], confidence: 'high' };
                            }

                            if (exactMatches.length > 1) {
                                if (titleYear) {
                                    const exactYearMatches = exactMatches.filter(
                                        (r) => getCandYear(r) === titleYear
                                    );
                                    if (exactYearMatches.length === 1) {
                                        return { candidate: exactYearMatches[0], confidence: 'high' };
                                    }
                                    if (exactYearMatches.length > 1) {
                                        const ranked = [...exactYearMatches].sort((a, b) => {
                                            const scoreA = (a.vote_count || 0) * 2 + (a.popularity || 0);
                                            const scoreB = (b.vote_count || 0) * 2 + (b.popularity || 0);
                                            return scoreB - scoreA;
                                        });
                                        return {
                                            candidate: null,
                                            confidence: 'medium',
                                            reason: `Ambiguous: Multiple candidates match exact title "${cleanTitle}" and release year ${titleYear}`,
                                            compatibleCandidates: ranked,
                                        };
                                    }
                                    exactMatches.sort(
                                        (a, b) =>
                                            Math.abs(getCandYear(a) - titleYear) -
                                            Math.abs(getCandYear(b) - titleYear)
                                    );
                                    return { candidate: exactMatches[0], confidence: 'high' };
                                } else {
                                    // Multiple exact title matches without a year -> Ambiguous!
                                    // Per strict requirements: supporting signals (votes, popularity, language, country)
                                    // rank candidates for manual resolution but MUST NOT independently auto-import.
                                    const ranked = [...exactMatches].sort((a, b) => {
                                        const scoreA = (a.vote_count || 0) * 2 + (a.popularity || 0);
                                        const scoreB = (b.vote_count || 0) * 2 + (b.popularity || 0);
                                        return scoreB - scoreA;
                                    });
                                    return {
                                        candidate: null,
                                        confidence: 'medium',
                                        reason: `Ambiguous: Multiple candidates match exact title "${cleanTitle}" without a source year to distinguish them`,
                                        compatibleCandidates: ranked,
                                    };
                                }
                            }

                            // No exact title match found among non-conflicting candidates.
                            return {
                                candidate: null,
                                confidence: 'unmatched',
                                reason: `No exact title match found for "${cleanTitle}" among compatible candidates`,
                                compatibleCandidates: nonConflicting.slice(0, 5),
                            };
                        };

                        if (resolvedMediaType === 'tv') {
                            const res = pickBestCandidate(tvResults, true);
                            if (res.confidence === 'high' && res.candidate?.id) {
                                tmdbId = String(res.candidate.id);
                            } else {
                                resolutionStatus = res.confidence === 'medium' ? 'ambiguous' : 'unmatched';
                                resolutionReason = res.reason || `No high-confidence TV match found for "${cleanTitle}"`;
                                if (res.compatibleCandidates && res.compatibleCandidates.length > 0) {
                                    candidateSuggestions = res.compatibleCandidates.map(c => this.toUnresolvedCandidate(c, true));
                                }
                            }
                        } else if (resolvedMediaType === 'movie') {
                            const res = pickBestCandidate(movieResults, false);
                            if (res.confidence === 'high' && res.candidate?.id) {
                                tmdbId = String(res.candidate.id);
                            } else {
                                resolutionStatus = res.confidence === 'medium' ? 'ambiguous' : 'unmatched';
                                resolutionReason = res.reason || `No high-confidence movie match found for "${cleanTitle}"`;
                                if (res.compatibleCandidates && res.compatibleCandidates.length > 0) {
                                    candidateSuggestions = res.compatibleCandidates.map(c => this.toUnresolvedCandidate(c, false));
                                }
                            }
                        } else {
                            // Undefined mediaType: evaluate both TV and movie candidates strictly
                            const tvRes = pickBestCandidate(tvResults, true);
                            const movieRes = pickBestCandidate(movieResults, false);

                            if (tvRes.confidence === 'high' && movieRes.confidence !== 'high') {
                                tmdbId = String(tvRes.candidate.id);
                                resolvedMediaType = 'tv';
                            } else if (movieRes.confidence === 'high' && tvRes.confidence !== 'high') {
                                tmdbId = String(movieRes.candidate.id);
                                resolvedMediaType = 'movie';
                            } else if (tvRes.confidence === 'high' && movieRes.confidence === 'high') {
                                resolutionStatus = 'ambiguous';
                                resolutionReason = `Ambiguous: Both a TV show and a movie match "${cleanTitle}" without source media type specified`;
                                const tvCand = this.toUnresolvedCandidate(tvRes.candidate, true);
                                const movieCand = this.toUnresolvedCandidate(movieRes.candidate, false);
                                const scoreTv = (tvCand.voteCount || 0) * 2 + (tvCand.popularity || 0);
                                const scoreMovie = (movieCand.voteCount || 0) * 2 + (movieCand.popularity || 0);
                                candidateSuggestions = scoreTv >= scoreMovie ? [tvCand, movieCand] : [movieCand, tvCand];
                            } else {
                                resolutionStatus = 'ambiguous';
                                resolutionReason = `Could not uniquely determine media type or match for "${cleanTitle}"`;
                                const allCand = [
                                    ...(tvRes.compatibleCandidates || []).map(c => this.toUnresolvedCandidate(c, true)),
                                    ...(movieRes.compatibleCandidates || []).map(c => this.toUnresolvedCandidate(c, false)),
                                ];
                                if (allCand.length > 0) {
                                    candidateSuggestions = allCand;
                                }
                            }
                        }
                    } catch (err: any) {
                        logger.warn(`[ListService] Title search failed for ${cleanTitle}: ${err?.message}`);
                    }
                }

                if (tmdbId && resolvedMediaType) {
                    resolutionCache.set(cacheKey, { tmdbId, mediaType: resolvedMediaType });
                } else {
                    result.unmatched.push({
                        title: rawTitle || item.title || '',
                        tvdbId,
                        imdbId,
                        mediaType: resolvedMediaType,
                        position: item.position,
                        status: resolutionStatus || 'unmatched',
                        reason: resolutionReason || `Could not resolve TMDB ID for "${rawTitle || item.title || imdbId || tvdbId}"`,
                        candidates: candidateSuggestions && candidateSuggestions.length > 0 ? candidateSuggestions : undefined,
                    });
                    continue;
                }

                // Concurrency-safe atomic insert:
                // Canonical entity is (tmdbId + mediaType).
                // Atomic $not / $elemMatch prevents duplicate insertions even during concurrent imports.
                const updateResult = await ListModel.updateOne(
                    {
                        _id: listId,
                        user: userId,
                        items: {
                            $not: {
                                $elemMatch: {
                                    tmdbId: String(tmdbId),
                                    mediaType: resolvedMediaType,
                                },
                            },
                        },
                    },
                    {
                        $push: {
                            items: {
                                tmdbId: String(tmdbId),
                                mediaType: resolvedMediaType,
                                addedAt: new Date(),
                            },
                        },
                    }
                );

                if (updateResult.modifiedCount > 0) {
                    result.importedItems++;
                } else {
                    result.duplicatesCount = (result.duplicatesCount || 0) + 1;
                }
            } catch (err: any) {
                logger.error(`[ListService] Failed to import list item ${item.title || item.tvdbId || item.imdbId}: ${err?.message}`);
                result.failed.push({
                    title: item.title,
                    tvdbId: item.tvdbId,
                    imdbId: item.imdbId,
                    reason: err?.message || 'Failed to insert list item',
                });
            }
        }

        // Aggregate all unresolved source rows into grouped unresolved records
        // Grouping rule: Group only records with equivalent source identity evidence
        // (mediaType, normalized title, extracted source year, imdbId, tvdbId)
        const groupsMap = new Map<string, UnresolvedGroupDTO>();

        for (const u of result.unmatched) {
            let cleanT = u.title?.trim() || '';
            let extractedY: number | undefined = undefined;
            if (cleanT) {
                const yMatch = cleanT.match(/\((\d{4})\)\s*$/);
                if (yMatch && yMatch[1]) {
                    extractedY = parseInt(yMatch[1], 10);
                    cleanT = cleanT.replace(/\((\d{4})\)\s*$/, '').trim();
                }
            }
            const normT = this.normalizeTitle(cleanT);
            // Group unresolved items by mediaType and normalized title.
            // Do NOT include episode-level tvdbId or placeholder imdbId in groupKey because multiple episode rows
            // of the same show in a list would fragment into dozens of duplicate cards instead of grouping together.
            const groupKey = `${u.mediaType || 'unknown'}:${normT}:${extractedY || ''}`;

            let group = groupsMap.get(groupKey);
            if (!group) {
                group = {
                    groupKey,
                    title: cleanT || u.title || (u.imdbId && u.imdbId !== '-1' ? `IMDb ${u.imdbId}` : u.tvdbId ? `TVDB ${u.tvdbId}` : 'Unknown Title'),
                    mediaType: u.mediaType as 'movie' | 'tv' | undefined,
                    titleYear: extractedY,
                    tvdbId: u.tvdbId,
                    imdbId: u.imdbId && u.imdbId !== '-1' ? u.imdbId : undefined,
                    status: u.status || 'unmatched',
                    occurrences: 0,
                    positions: [],
                    reason: u.reason,
                    candidates: u.candidates ? [...u.candidates] : [],
                };
                groupsMap.set(groupKey, group);
            }

            group.occurrences++;
            if (u.position !== undefined && !group.positions.includes(u.position)) {
                group.positions.push(u.position);
            }
            if ((!group.candidates || group.candidates.length === 0) && u.candidates && u.candidates.length > 0) {
                group.candidates = [...u.candidates];
            }
        }

        // Sort positions inside each group to preserve earliest source position
        groupsMap.forEach((g) => {
            g.positions.sort((a, b) => a - b);
        });

        result.unresolvedGroups = Array.from(groupsMap.values());
    }

    private toUnresolvedCandidate(r: any, isTv: boolean): UnresolvedCandidateDTO {
        const title = (isTv ? r.name || r.original_name : r.title || r.original_title) || '';
        const dateStr = isTv ? r.first_air_date : r.release_date;
        const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : undefined;
        return {
            id: r.id,
            title,
            mediaType: isTv ? 'tv' : 'movie',
            firstAirDate: isTv ? r.first_air_date : undefined,
            releaseDate: !isTv ? r.release_date : undefined,
            year: isNaN(year!) ? undefined : year,
            originalLanguage: r.original_language,
            originCountry: r.origin_country || (r.production_countries ? r.production_countries.map((c: any) => c.iso_3166_1) : undefined),
            posterPath: r.poster_path,
            voteAverage: r.vote_average,
            voteCount: r.vote_count,
            popularity: r.popularity,
        };
    }

    public normalizeTitle(s?: string): string {
        if (!s) return '';
        return s
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\u2026/g, '...')
            .replace(/\s+/g, ' ');
    }

    public normalizeAlnum(s?: string): string {
        if (!s) return '';
        return s
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    public isExactTitleMatch(cand?: string, expected?: string): boolean {
        if (!cand || !expected) return false;
        const normCand = this.normalizeTitle(cand);
        const normExp = this.normalizeTitle(expected);
        if (normCand === normExp) return true;
        const alnumCand = this.normalizeAlnum(cand);
        const alnumExp = this.normalizeAlnum(expected);
        return Boolean(alnumCand && alnumExp && alnumCand === alnumExp);
    }

    private async validateExternalIdMatch(
        candidateId: string,
        candidateType: 'movie' | 'tv',
        candidateTitle: string | undefined,
        candidateOriginalTitle: string | undefined,
        candidateDate: string | undefined,
        expectedTitle: string | undefined,
        expectedYear: number | undefined,
        expectedMediaType: 'movie' | 'tv' | undefined
    ): Promise<boolean> {
        if (!expectedTitle) return true;

        // 1. Media type validation
        if (expectedMediaType && expectedMediaType !== candidateType) {
            return false;
        }

        // 2. Year validation when source year is available
        if (expectedYear && candidateDate) {
            const candYear = parseInt(candidateDate.slice(0, 4), 10);
            if (!isNaN(candYear) && Math.abs(candYear - expectedYear) > 1) {
                return false;
            }
        }

        const stripCountryTag = (s?: string): string => {
            if (!s) return '';
            return s.replace(/\s*\((?:US|UK|AU|CA|NZ|FR|DE|ES|IT|KR|JP|CN|IN)\)\s*$/i, '').trim();
        };

        const expectedNorm = this.normalizeTitle(expectedTitle);
        const expectedStripped = this.normalizeTitle(stripCountryTag(expectedTitle));
        const expectedAlnum = this.normalizeAlnum(expectedTitle);
        const expectedAlnumStripped = this.normalizeAlnum(stripCountryTag(expectedTitle));

        // Authoritative stylized variants when external ID verifies entity (e.g., High School D×D -> High School DxD, Sex!fy -> Sexify)
        const stylizedExpectedNorm = this.normalizeTitle(
            expectedTitle.replace(/×/g, 'x').replace(/!/g, 'i')
        );
        const stylizedExpectedStripped = this.normalizeTitle(
            stripCountryTag(expectedTitle).replace(/×/g, 'x').replace(/!/g, 'i')
        );

        const matchesTitle = (alias?: string): boolean => {
            if (!alias) return false;
            const normAlias = this.normalizeTitle(alias);
            if (!normAlias) return false;
            const strippedAlias = this.normalizeTitle(stripCountryTag(alias));

            // Exact title match (with Unicode NFD diacritic handling)
            if (normAlias === expectedNorm || normAlias === expectedStripped) return true;
            if (strippedAlias === expectedNorm || strippedAlias === expectedStripped) return true;

            // Authoritative stylized variant match when verified by external ID
            if (normAlias === stylizedExpectedNorm || normAlias === stylizedExpectedStripped) return true;
            if (strippedAlias === stylizedExpectedNorm || strippedAlias === stylizedExpectedStripped) return true;

            // Exact alphanumeric match
            const alnumAlias = this.normalizeAlnum(alias);
            if (alnumAlias && (alnumAlias === expectedAlnum || alnumAlias === expectedAlnumStripped)) {
                return true;
            }

            // Safe subtitle prefix (e.g. "Dark: Season 1" vs "Dark", "Inuyashiki: Last Hero" vs "Inuyashiki")
            if (normAlias.startsWith(expectedNorm + ':') || normAlias.startsWith(expectedNorm + ' -') || normAlias.startsWith(expectedNorm + ' –')) {
                return true;
            }
            if (normAlias.startsWith(expectedStripped + ':') || normAlias.startsWith(expectedStripped + ' -') || normAlias.startsWith(expectedStripped + ' –')) {
                return true;
            }
            if (expectedNorm.startsWith(normAlias + ':') || expectedNorm.startsWith(normAlias + ' -') || expectedNorm.startsWith(normAlias + ' –')) {
                return true;
            }

            return false;
        };

        // 3. Fast check against candidate primary title and original title
        if (matchesTitle(candidateTitle) || matchesTitle(candidateOriginalTitle)) {
            return true;
        }

        // 4. Validate against TMDB entity aliases (alternative titles & OMDb title)
        try {
            if (typeof this.tmdbCacheService.getCachedTitleDetails === 'function') {
                const details = await this.tmdbCacheService.getCachedTitleDetails(candidateType, candidateId);
                if (details) {
                    if (matchesTitle(details.name) || matchesTitle(details.title)) return true;
                    if (matchesTitle(details.original_name) || matchesTitle(details.original_title)) return true;
                    if (details.omdb?.Title && matchesTitle(details.omdb.Title)) return true;

                    // Check TMDB alternative_titles if embedded in details
                    const altList = candidateType === 'tv'
                        ? details.alternative_titles?.results
                        : details.alternative_titles?.titles;

                    if (Array.isArray(altList)) {
                        for (const alt of altList) {
                            if (alt?.title && matchesTitle(alt.title)) {
                                return true;
                            }
                        }
                    }
                }
            }

            // Also check direct alternative titles endpoint if available
            if (typeof this.tmdbCacheService.getCachedAlternativeTitles === 'function') {
                const altData = await this.tmdbCacheService.getCachedAlternativeTitles(candidateType, candidateId);
                const titlesArray = candidateType === 'tv' ? altData?.results : altData?.titles;
                if (Array.isArray(titlesArray)) {
                    for (const alt of titlesArray) {
                        if (alt?.title && matchesTitle(alt.title)) {
                            return true;
                        }
                    }
                }
            }
        } catch (err: any) {
            logger.warn(`[ListService] Error checking aliases for external ID ${candidateId}: ${err?.message}`);
        }

        return false;
    }
}
