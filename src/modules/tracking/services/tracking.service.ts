import { inject, injectable } from "inversify";
import { TrackedItemModel } from "../models/trackedItem.schema.js";
import { UserModel } from "../../auth/user.schema.js";
import { ITmdbCacheService } from "../../tmdb/services/tmdbCache.service.interface.js";
import { TYPES } from "../../../di/types.js";
import logger from "../../../shared/logger.js";

@injectable()
export class TrackingService {
  constructor(@inject(TYPES.TmdbCacheService) private tmdbCacheService: ITmdbCacheService) {}

  private async resolveEpisodeRuntime(
    tmdbId: string,
    runtime?: number,
    season?: number,
    episode?: number,
  ): Promise<number> {
    if (runtime && runtime > 0) return runtime;

    if (season !== undefined && episode !== undefined) {
      try {
        const epDetails = await this.tmdbCacheService.getCachedEpisodeDetails(
          tmdbId,
          String(season),
          String(episode),
        );
        if (epDetails?.runtime > 0) return epDetails.runtime;
      } catch {
        // fall through to show-level lookup
      }
    }

    try {
      const details = await this.tmdbCacheService.getCachedTitleDetails("tv", tmdbId);
      const showRuntime = details?.episode_run_time?.[0];
      return showRuntime && showRuntime > 0 ? showRuntime : 45;
    } catch {
      return 45;
    }
  }

  private async getSeasonEpisodeRuntimes(tmdbId: string, season: number): Promise<Map<number, number>> {
    const runtimes = new Map<number, number>();
    try {
      const seasonDetails = await this.tmdbCacheService.getCachedSeasonDetails(tmdbId, String(season));
      for (const ep of seasonDetails?.episodes || []) {
        if (ep.runtime > 0) {
          runtimes.set(ep.episode_number, ep.runtime);
        }
      }
    } catch {
      // ignore — callers fall back to show average
    }
    return runtimes;
  }

  private async backfillEpisodeRuntimes(show: {
    tmdbId: string;
    episodeRuntime: number;
    watchedEpisodes: { season: number; episode: number; runtime?: number }[];
    save: () => Promise<unknown>;
  }) {
    let updated = false;

    for (const ep of show.watchedEpisodes) {
      if (!ep.runtime) {
        const runtime = await this.resolveEpisodeRuntime(
          show.tmdbId,
          undefined,
          ep.season,
          ep.episode,
        );
        if (runtime > 0) {
          ep.runtime = runtime;
          updated = true;
        }
      }
    }

    if (!show.episodeRuntime) {
      const runtimes = show.watchedEpisodes.map(ep => ep.runtime || 0).filter(r => r > 0);
      if (runtimes.length > 0) {
        show.episodeRuntime = Math.round(runtimes.reduce((sum, r) => sum + r, 0) / runtimes.length);
        updated = true;
      }
    }

    if (updated) {
      await show.save();
    }
  }

  private getShowEpisodeMinutes(show: {
    episodeRuntime: number;
    watchedEpisodes: { runtime?: number }[];
  }) {
    return (show.watchedEpisodes || []).reduce(
      (sum, ep) => sum + (ep.runtime || show.episodeRuntime || 0),
      0,
    );
  }

  private async deleteIfNoWatchedEpisodes(doc: { _id: unknown; watchedEpisodes: unknown[] }) {
    if (doc.watchedEpisodes.length === 0) {
      await TrackedItemModel.deleteOne({ _id: doc._id });
      return true;
    }
    return false;
  }

  private async getAllReleasedEpisodes(tmdbId: string) {
    const details = await this.tmdbCacheService.getCachedTitleDetails("tv", tmdbId);
    const seasons = (details?.seasons || []).filter((s: { season_number: number }) => s.season_number > 0);
    const now = new Date();
    const episodes: { season: number; episode: number; runtime: number }[] = [];

    for (const season of seasons) {
      try {
        const seasonDetails = await this.tmdbCacheService.getCachedSeasonDetails(tmdbId, String(season.season_number));
        for (const ep of seasonDetails?.episodes || []) {
          if (ep.air_date && new Date(ep.air_date) <= now) {
            episodes.push({
              season: season.season_number,
              episode: ep.episode_number,
              runtime: ep.runtime > 0 ? ep.runtime : 0,
            });
          }
        }
      } catch {
        // skip unavailable seasons
      }
    }

    return episodes;
  }

  private isFullyWatched(
    watchedEpisodes: { season: number; episode: number }[],
    releasedEpisodes: { season: number; episode: number }[],
  ) {
    if (releasedEpisodes.length === 0) return false;
    return releasedEpisodes.every(ep =>
      watchedEpisodes.some(w => w.season === ep.season && w.episode === ep.episode),
    );
  }

  /**
   * Reconciles watchedEpisodes for a TV show:
   * 1. Fetches TMDB season details to identify true TMDB episode numbers for each season present.
   * 2. Detects seasons with absolute/cumulative numbering (e.g. Anime like One Piece) or TV Time relative ghost records.
   * 3. Maps relative episode numbers (e.g. 1..194) to TMDB absolute episode numbers (e.g. 892..1085).
   * 4. Deduplicates ghosts when true TMDB absolute numbers are already marked.
   * 5. Prunes invalid out-of-bounds episodes (e.g. Specials 40..48 when TMDB only has 39 specials).
   * Automatically saves to DB if modified and returns true.
   */
  async reconcileWatchedEpisodes(tmdbId: string, doc: any): Promise<boolean> {
    if (!doc || !Array.isArray(doc.watchedEpisodes) || doc.watchedEpisodes.length === 0) {
      return false;
    }

    const seasonsPresent = Array.from(new Set(doc.watchedEpisodes.map((e: any) => e.season))) as number[];
    let modified = false;
    const reconciledEpisodes: any[] = [];

    for (const seasonNum of seasonsPresent) {
      const seasonItems = doc.watchedEpisodes.filter((e: any) => e.season === seasonNum);
      let seasonDetails: any = null;
      try {
        seasonDetails = await this.tmdbCacheService.getCachedSeasonDetails(tmdbId, String(seasonNum));
      } catch (err: any) {
        // Fallback: keep items as-is if TMDB fetch fails
        reconciledEpisodes.push(...seasonItems);
        continue;
      }

      const validTmdbEpisodes = seasonDetails?.episodes;
      if (!Array.isArray(validTmdbEpisodes) || validTmdbEpisodes.length === 0) {
        reconciledEpisodes.push(...seasonItems);
        continue;
      }

      const validEpNumbers = new Set(validTmdbEpisodes.map((ep: any) => ep.episode_number));

      // keepMap: TMDB episode_number -> watched item
      const keepMap = new Map<number, any>();

      // Pass 1: Retain all directly valid TMDB episode numbers
      for (const item of seasonItems) {
        if (validEpNumbers.has(item.episode)) {
          if (!keepMap.has(item.episode)) {
            keepMap.set(item.episode, item);
          } else {
            // Duplicate direct episode
            modified = true;
          }
        }
      }

      // Pass 2: Handle items whose episode number does NOT directly match a valid TMDB episode
      for (const item of seasonItems) {
        if (validEpNumbers.has(item.episode)) {
          continue;
        }

        // Check if item.episode is a 1-based relative index (TV Time / TVDB convention)
        if (item.episode >= 1 && item.episode <= validTmdbEpisodes.length) {
          const targetTmdbEp = validTmdbEpisodes[item.episode - 1].episode_number;
          if (!keepMap.has(targetTmdbEp)) {
            // Upgrade relative episode number to the true TMDB episode number
            keepMap.set(targetTmdbEp, {
              season: seasonNum,
              episode: targetTmdbEp,
              watchedAt: item.watchedAt || new Date(),
              runtime: item.runtime || doc.episodeRuntime || 0,
            });
            modified = true;
          } else {
            // The true TMDB episode is already marked; this relative entry is a ghost duplicate
            modified = true;
          }
        } else {
          // Out of bounds episode that does not exist on TMDB (e.g. extra specials); discard
          modified = true;
        }
      }

      for (const val of keepMap.values()) {
        reconciledEpisodes.push(val);
      }
    }

    if (modified) {
      doc.watchedEpisodes = reconciledEpisodes;
      await doc.save();
      logger.info(`[TrackingService] Reconciled watched episodes for tmdbId=${tmdbId}: cleaned to ${reconciledEpisodes.length} episodes`);
    }

    return modified;
  }

  async toggleWatchedStatus(userId: string, tmdbId: string, mediaType: 'movie' | 'tv', runtime?: number) {
    if (mediaType === 'movie') {
      const existing = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType });
      if (existing) {
        await TrackedItemModel.deleteOne({ _id: existing._id });
        return { watched: false };
      }

      let movieRuntime = runtime && runtime > 0 ? runtime : 0;
      if (!movieRuntime) {
        try {
          const details = await this.tmdbCacheService.getCachedTitleDetails('movie', tmdbId);
          movieRuntime = details?.runtime || 0;
        } catch {
          movieRuntime = 0;
        }
      }

      await TrackedItemModel.create({
        user: userId,
        tmdbId,
        mediaType,
        movieRuntime,
      });

      // Automatically remove from active watchlist since it has been watched
      await UserModel.updateOne(
        { _id: userId },
        { $pull: { watchlistMovies: String(tmdbId) } }
      ).catch(() => {});

      return { watched: true };
    }

    const existing = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType: 'tv' });
    const releasedEpisodes = await this.getAllReleasedEpisodes(tmdbId);
    const episodeRuntime = await this.resolveEpisodeRuntime(tmdbId, runtime);
    const currentlyFullyWatched = existing
      ? this.isFullyWatched(existing.watchedEpisodes, releasedEpisodes)
      : false;

    if (currentlyFullyWatched && existing) {
      await TrackedItemModel.deleteOne({ _id: existing._id });
      return { watched: false, watchedEpisodes: [] };
    }

    const watchedEpisodes = releasedEpisodes.map(ep => ({
      season: ep.season,
      episode: ep.episode,
      watchedAt: new Date(),
      runtime: ep.runtime || episodeRuntime,
    }));

    if (existing) {
      existing.watchedEpisodes = watchedEpisodes as any;
      if (episodeRuntime > 0) existing.episodeRuntime = episodeRuntime;
      await existing.save();
    } else {
      await TrackedItemModel.create({
        user: userId,
        tmdbId,
        mediaType: 'tv',
        watchedEpisodes,
        episodeRuntime,
      });
    }

    return { watched: true, watchedEpisodes };
  }

  async checkIsWatched(userId: string, tmdbId: string, mediaType: 'movie' | 'tv') {
    const existing = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType });
    if (!existing) {
      return {
        watched: false,
        watchedEpisodes: [],
        ignorePreviousEpisodesPrompt: false,
      };
    }

    if (mediaType === 'movie') {
      return {
        watched: true,
        watchedEpisodes: [],
        ignorePreviousEpisodesPrompt: false,
      };
    }

    // Auto-reconcile TV episodes (deduplicates relative ghost episodes for anime/cumulative shows)
    await this.reconcileWatchedEpisodes(tmdbId, existing);

    const releasedEpisodes = await this.getAllReleasedEpisodes(tmdbId);
    const watched = this.isFullyWatched(existing.watchedEpisodes, releasedEpisodes);

    return {
      watched,
      watchedEpisodes: existing.watchedEpisodes || [],
      ignorePreviousEpisodesPrompt: existing.ignorePreviousEpisodesPrompt || false,
    };
  }

  async toggleEpisode(userId: string, tmdbId: string, season: number, episode: number, runtime?: number) {
    const startTime = performance.now();
    let doc = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType: 'tv' });
    const runtimeStart = performance.now();
    const resolvedRuntime = await this.resolveEpisodeRuntime(tmdbId, runtime, season, episode);
    const runtimeDuration = Math.round(performance.now() - runtimeStart);

    if (!doc) {
      doc = await TrackedItemModel.create({
        user: userId,
        tmdbId,
        mediaType: 'tv',
        watchedEpisodes: [],
        episodeRuntime: resolvedRuntime,
      });
    } else if (resolvedRuntime > 0 && !doc.episodeRuntime) {
      doc.episodeRuntime = resolvedRuntime;
    }

    const index = doc.watchedEpisodes.findIndex(e => e.season === season && e.episode === episode);
    let isWatched = false;
    
    if (index > -1) {
      doc.watchedEpisodes.splice(index, 1);
    } else {
      doc.watchedEpisodes.push({
        season,
        episode,
        watchedAt: new Date(),
        runtime: resolvedRuntime,
      });
      isWatched = true;
    }

    if (await this.deleteIfNoWatchedEpisodes(doc)) {
      const totalDuration = Math.round(performance.now() - startTime);
      logger.info(`[TrackingService] toggleEpisode (deleted) tmdbId=${tmdbId} S${season}E${episode} took ${totalDuration}ms (runtime: ${runtimeDuration}ms)`);
      return { watched: false, watchedEpisodes: [] };
    }
    
    await doc.save();
    const totalDuration = Math.round(performance.now() - startTime);
    logger.info(`[TrackingService] toggleEpisode tmdbId=${tmdbId} S${season}E${episode} watched=${isWatched} took ${totalDuration}ms (runtime: ${runtimeDuration}ms)`);
    return { watched: isWatched, watchedEpisodes: doc.watchedEpisodes };
  }

  async markSeasonWatched(userId: string, tmdbId: string, season: number, episodes: number[], runtime?: number) {
    let doc = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType: 'tv' });
    const resolvedRuntime = await this.resolveEpisodeRuntime(tmdbId, runtime);
    const seasonRuntimes = await this.getSeasonEpisodeRuntimes(tmdbId, season);

    if (!doc) {
      doc = await TrackedItemModel.create({
        user: userId,
        tmdbId,
        mediaType: 'tv',
        watchedEpisodes: [],
        episodeRuntime: resolvedRuntime,
      });
    } else if (resolvedRuntime > 0 && !doc.episodeRuntime) {
      doc.episodeRuntime = resolvedRuntime;
    }

    const allPresent = episodes.every(ep => doc!.watchedEpisodes.some(e => e.season === season && e.episode === ep));

    if (allPresent) {
      // Remove all episodes of this season from the watched list, ensuring we clean up any corrupted 'ghost' episodes
      doc.watchedEpisodes = doc.watchedEpisodes.filter(e => e.season !== season) as any;
    } else {
      // Add all episodes that aren't already there
      // Prune any invalid/ghost episodes for this season that are NOT in `episodes`
      const validEpSet = new Set(episodes);
      doc.watchedEpisodes = doc.watchedEpisodes.filter(e => e.season !== season || validEpSet.has(e.episode)) as any;

      for (const ep of episodes) {
        const exists = doc.watchedEpisodes.some(e => e.season === season && e.episode === ep);
        if (!exists) {
          const epRuntime = seasonRuntimes.get(ep) || resolvedRuntime || 0;
          doc.watchedEpisodes.push({
            season,
            episode: ep,
            watchedAt: new Date(),
            runtime: epRuntime,
          });
        }
      }
    }

    if (await this.deleteIfNoWatchedEpisodes(doc)) {
      return { watchedEpisodes: [] };
    }

    await doc.save();
    return { watchedEpisodes: doc.watchedEpisodes };
  }

  async setIgnorePreviousEpisodesPrompt(userId: string, tmdbId: string) {
    let doc = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType: 'tv' });
    if (!doc) {
      doc = await TrackedItemModel.create({ user: userId, tmdbId, mediaType: 'tv', watchedEpisodes: [], ignorePreviousEpisodesPrompt: true });
    } else {
      doc.ignorePreviousEpisodesPrompt = true;
      await doc.save();
    }
    return { success: true };
  }

  async getWatchHistory(userId: string, page = 1, limit = 50, mediaType?: 'tv' | 'movie') {
    const skip = (page - 1) * limit;
    
    let query: any = { user: userId };
    
    if (mediaType === 'tv') {
        query.mediaType = 'tv';
        query['watchedEpisodes.0'] = { $exists: true };
    } else if (mediaType === 'movie') {
        query.mediaType = 'movie';
    } else {
        query.$or = [
            { mediaType: 'movie' },
            { mediaType: 'tv', 'watchedEpisodes.0': { $exists: true } },
        ];
    }

    const items = await TrackedItemModel.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
      
    const total = await TrackedItemModel.countDocuments(query);
    
    return {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit)
    };
  }

  private async backfillMovieRuntimes(movies: any[]) {
    for (const movie of movies) {
      if (!movie.movieRuntime || movie.movieRuntime <= 0) {
        try {
          const details = await this.tmdbCacheService.getCachedTitleDetails('movie', movie.tmdbId);
          if (details?.runtime && details.runtime > 0) {
            movie.movieRuntime = details.runtime;
            await TrackedItemModel.updateOne({ _id: movie._id }, { $set: { movieRuntime: details.runtime } });
          }
        } catch {
          // ignore error
        }
      }
    }
  }

  async getStats(userId: string) {
    const allItems = await TrackedItemModel.find({ user: userId });

    const movies = allItems.filter(item => item.mediaType === 'movie');
    const tvShows = allItems.filter(item => item.mediaType === 'tv' && (item.watchedEpisodes?.length || 0) > 0);

    // Reconcile episodes for all TV shows and backfill missing runtimes
    for (const show of tvShows) {
      await this.reconcileWatchedEpisodes(show.tmdbId, show);
      await this.backfillEpisodeRuntimes(show);
    }
    await this.backfillMovieRuntimes(movies);

    const totalMovies = movies.length;
    const totalMovieMinutes = movies.reduce((sum, m) => sum + (m.movieRuntime || 0), 0);

    const totalEpisodes = tvShows.reduce((sum, show) => sum + (show.watchedEpisodes?.length || 0), 0);
    const totalEpisodeMinutes = tvShows.reduce(
      (sum, show) => sum + this.getShowEpisodeMinutes(show),
      0,
    );

    return {
      totalMovies,
      totalMovieMinutes,
      totalEpisodes,
      totalEpisodeMinutes,
    };
  }

  async importTvTimeBatch(userId: string, items: TvTimeImportItem[]): Promise<TvTimeImportResult> {
    const result: TvTimeImportResult = {
      processed: 0,
      importedEpisodes: 0,
      unmatched: [],
      failed: [],
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return result;
    }

    // Group items by show to resolve TMDB once per unique show in batch
    const showGroups = new Map<string, { tvdbId?: string; title?: string; episodes: TvTimeImportItem[] }>();

    for (const item of items) {
      result.processed++;

      // Validate season & episode
      const season = Number(item.season);
      const episode = Number(item.episode);

      if (isNaN(season) || season < 0 || isNaN(episode) || episode < 0) {
        result.failed.push({
          title: item.title,
          tvdbId: item.tvdbId,
          season: item.season,
          episode: item.episode,
          reason: "Invalid season or episode number",
        });
        continue;
      }

      const cleanTvdbId = item.tvdbId ? String(item.tvdbId).trim() : undefined;
      const cleanTitle = item.title ? String(item.title).trim() : undefined;

      if (!cleanTvdbId && !cleanTitle) {
        result.failed.push({
          season,
          episode,
          reason: "Missing both TVDB ID and show title",
        });
        continue;
      }

      const groupKey = cleanTvdbId ? `tvdb_${cleanTvdbId}` : `title_${cleanTitle!.toLowerCase()}`;
      if (!showGroups.has(groupKey)) {
        showGroups.set(groupKey, {
          tvdbId: cleanTvdbId,
          title: cleanTitle,
          episodes: [],
        });
      }

      showGroups.get(groupKey)!.episodes.push({
        ...item,
        season,
        episode,
        tvdbId: cleanTvdbId,
        title: cleanTitle,
      });
    }

    // Process each show group
    for (const [, group] of showGroups) {
      let tmdbId: string | null = null;

      // Strategy 1: TVDB ID lookup (preferred & deterministic)
      if (group.tvdbId) {
        try {
          const findResult = await this.tmdbCacheService.getCachedFindByExternalId(group.tvdbId, 'tvdb_id');
          if (findResult?.tv_results && findResult.tv_results.length > 0) {
            const cand = findResult.tv_results[0];
            // Validate candidate title against expected group.title to prevent episode ID collisions (e.g. Lost -> Aristocrats)
            // Only exact alphanumeric-normalized equality is accepted — startsWith is NOT sufficient.
            if (group.title) {
              const normCand = (cand.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const normExp = group.title.toLowerCase().replace(/\s*\(\d{4}\)$/, '').replace(/[^a-z0-9]/g, '');
              if (normCand === normExp) {
                tmdbId = String(cand.id);
              } else {
                logger.warn(`[TrackingService] Discarding TVDB ${group.tvdbId} collision: "${cand.name}" does not match "${group.title}"`);
              }
            } else {
              tmdbId = String(cand.id);
            }
          }
        } catch (err: any) {
          logger.warn(`[TrackingService] TVDB lookup failed for ${group.tvdbId}: ${err?.message}`);
        }
      }

      // Strategy 2: Title search fallback (if no TVDB ID or if TVDB ID had a title collision)
      if (!tmdbId && group.title) {
        try {
          const rawTitle = group.title.trim();
          // Extract year in parentheses if present, e.g. "Soundtrack (2022)" -> cleanTitle: "Soundtrack", titleYear: "2022"
          const yearParenMatch = rawTitle.match(/^(.*?)\s*\((\d{4})\)$/);
          const cleanTitle = (yearParenMatch && yearParenMatch[1]) ? yearParenMatch[1].trim() : rawTitle;
          const titleYear = (yearParenMatch && yearParenMatch[2]) ? parseInt(yearParenMatch[2], 10) : undefined;

          // Helper to normalize strings for comparison (lowercase, unify apostrophes, quotes, ellipsis, whitespace)
          const norm = (s?: string) =>
            (s || '')
              .toLowerCase()
              .replace(/[…]/g, '...')
              .replace(/[‘’]/g, "'")
              .replace(/[“”]/g, '"')
              .replace(/[\s:_\-]+/g, ' ')
              .trim();

          const targetNorm = norm(cleanTitle);

          // 1. Search with cleanTitle
          let searchResult = await this.tmdbCacheService.getCachedSearch(cleanTitle, '1');
          let tvResults = (searchResult?.results || []).filter(
            (r: any) => r.media_type === 'tv' || (!r.media_type && r.first_air_date)
          );

          // If no TV results with cleanTitle, retry search with rawTitle
          if (tvResults.length === 0 && cleanTitle !== rawTitle) {
            searchResult = await this.tmdbCacheService.getCachedSearch(rawTitle, '1');
            tvResults = (searchResult?.results || []).filter(
              (r: any) => r.media_type === 'tv' || (!r.media_type && r.first_air_date)
            );
          }

          if (tvResults.length > 0) {
            // Filter out candidates with conflicting air year
            const nonConflicting = tvResults.filter((r: any) => {
              if (!titleYear) return true;
              const airYear = r.first_air_date ? parseInt(r.first_air_date.slice(0, 4), 10) : NaN;
              return isNaN(airYear) || Math.abs(airYear - titleYear) <= 1;
            });

            // Exact title match on name or original_name
            const exactMatches = nonConflicting.filter(
              (r: any) => norm(r.name) === targetNorm || norm(r.original_name) === targetNorm
            );

            if (exactMatches.length === 1) {
              tmdbId = String(exactMatches[0].id);
            } else if (exactMatches.length > 1) {
              if (titleYear) {
                const exactYearMatches = exactMatches.filter((r: any) => {
                  const airYear = r.first_air_date ? parseInt(r.first_air_date.slice(0, 4), 10) : NaN;
                  return airYear === titleYear;
                });
                if (exactYearMatches.length > 0) {
                  exactYearMatches.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
                  tmdbId = String(exactYearMatches[0].id);
                } else {
                  exactMatches.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
                  tmdbId = String(exactMatches[0].id);
                }
              } else {
                exactMatches.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
                tmdbId = String(exactMatches[0].id);
              }
            }
          }
        } catch (err: any) {
          logger.warn(`[TrackingService] Title search fallback failed for ${group.title}: ${err?.message}`);
        }
      }

      // If TMDB ID could not be resolved, record all episodes in this group as unmatched
      if (!tmdbId) {
        const reason = group.tvdbId
          ? `Show not found on TMDB for TVDB ID ${group.tvdbId}`
          : `Ambiguous or missing TV show match for title "${group.title}"`;

        for (const ep of group.episodes) {
          result.unmatched.push({
            title: ep.title,
            tvdbId: ep.tvdbId,
            season: ep.season,
            episode: ep.episode,
            reason,
          });
        }
        continue;
      }

      // TMDB ID resolved! Get show runtime
      let defaultRuntime = 45;
      try {
        const showDetails = await this.tmdbCacheService.getCachedTitleDetails('tv', tmdbId);
        if (showDetails?.episode_run_time?.[0] > 0) {
          defaultRuntime = showDetails.episode_run_time[0];
        }
      } catch {
        // use fallback 45
      }

      // Upsert base TrackedItem document atomically
      await TrackedItemModel.updateOne(
        { user: userId, tmdbId, mediaType: 'tv' },
        {
          $setOnInsert: {
            user: userId,
            tmdbId,
            mediaType: 'tv',
            episodeRuntime: defaultRuntime,
            watchedEpisodes: [],
          },
        },
        { upsert: true }
      );

      // Pre-fetch TMDB season details for all seasons in this show to resolve relative vs absolute episode numbers
      const seasonDetailsMap = new Map<number, any>();
      const uniqueSeasons = Array.from(new Set(group.episodes.map(e => e.season)));
      await Promise.all(
        uniqueSeasons.map(async (sNum) => {
          try {
            const sDetails = await this.tmdbCacheService.getCachedSeasonDetails(tmdbId!, String(sNum));
            if (sDetails?.episodes?.length > 0) {
              seasonDetailsMap.set(sNum, sDetails);
            }
          } catch {
            // ignore
          }
        })
      );

      // Ingest each episode atomically & idempotently
      for (const ep of group.episodes) {
        let validWatchedAt: Date | null = null;
        if (ep.watchedDate) {
          const parsed = new Date(ep.watchedDate);
          if (!isNaN(parsed.getTime())) {
            validWatchedAt = parsed;
          }
        }

        let targetEpisodeNumber = ep.episode;
        const sDetails = seasonDetailsMap.get(ep.season);
        if (sDetails?.episodes?.length > 0) {
          const validTmdbEps = sDetails.episodes;
          const isDirectMatch = validTmdbEps.some((ve: any) => ve.episode_number === ep.episode);
          if (!isDirectMatch) {
            if (ep.episode >= 1 && ep.episode <= validTmdbEps.length) {
              // Map relative 1-based episode index from TV Time to TMDB absolute episode number
              targetEpisodeNumber = validTmdbEps[ep.episode - 1].episode_number;
            } else {
              // Episode number is out of bounds for TMDB; skip phantom episode
              continue;
            }
          }
        }

        // Atomic push: only pushes if season+targetEpisodeNumber does NOT already exist in watchedEpisodes
        const pushResult = await TrackedItemModel.updateOne(
          {
            user: userId,
            tmdbId,
            mediaType: 'tv',
            watchedEpisodes: { $not: { $elemMatch: { season: ep.season, episode: targetEpisodeNumber } } },
          },
          {
            $push: {
              watchedEpisodes: {
                season: ep.season,
                episode: targetEpisodeNumber,
                ...(validWatchedAt ? { watchedAt: validWatchedAt } : {}),
                runtime: defaultRuntime,
              },
            },
          }
        );

        if (pushResult.modifiedCount > 0) {
          result.importedEpisodes++;
        } else if (validWatchedAt) {
          // If episode already exists and has missing/null watchedAt, backfill it
          await TrackedItemModel.updateOne(
            {
              user: userId,
              tmdbId,
              mediaType: 'tv',
              watchedEpisodes: {
                $elemMatch: {
                  season: ep.season,
                  episode: targetEpisodeNumber,
                  $or: [{ watchedAt: { $exists: false } }, { watchedAt: null }],
                },
              },
            },
            {
              $set: { "watchedEpisodes.$[elem].watchedAt": validWatchedAt },
            },
            {
              arrayFilters: [{ "elem.season": ep.season, "elem.episode": targetEpisodeNumber }],
            }
          );
        }
      }

      // Reconcile watchedEpisodes for this show to ensure any existing ghost duplicates are pruned
      try {
        const doc = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType: 'tv' });
        if (doc) {
          await this.reconcileWatchedEpisodes(tmdbId, doc);
        }
      } catch (err: any) {
        logger.warn(`[TrackingService] Post-import reconciliation failed for tmdbId=${tmdbId}: ${err?.message}`);
      }
    }

    return result;
  }

  /**
   * Imports a batch of TV Time movie records atomically and idempotently.
   * - Strict resolution sequence:
   *   1. IMDb ID -> TMDB /find (checking movie_results only)
   *   2. TVDB ID -> TMDB /find (checking movie_results only)
   *   3. Title search restricted to movies only
   *   Never accepts TV or person results.
   * - Reuses TMDB MongoDB cache, in-memory batch resolution cache, and pendingRequests single-flight.
   * - Atomic upsert on TrackedItemModel (watchedDate & userRating backfilled if missing).
   * - Pulls watched movie from UserModel.watchlistMovies.
   */
  public async importMovieBatch(
    userId: string,
    items: TvTimeMovieImportItem[]
  ): Promise<TvTimeMovieImportResult> {
    const result: TvTimeMovieImportResult = {
      processed: items.length,
      importedMovies: 0,
      unmatched: [],
      failed: [],
    };

    // In-memory resolution cache for this batch to prevent duplicate TMDB lookups within the same batch
    const resolutionCache = new Map<string, string>(); // cacheKey -> tmdbId

    for (const item of items) {
      try {
        let tmdbId: string | null = null;
        const imdbId = item.imdbId ? String(item.imdbId).trim() : undefined;
        const tvdbId = item.tvdbId ? String(item.tvdbId).trim() : undefined;
        const title = item.title ? String(item.title).trim() : undefined;

        // Check in-memory batch cache
        if (imdbId && resolutionCache.has(`imdb:${imdbId}`)) {
          tmdbId = resolutionCache.get(`imdb:${imdbId}`)!;
        } else if (tvdbId && resolutionCache.has(`tvdb:${tvdbId}`)) {
          tmdbId = resolutionCache.get(`tvdb:${tvdbId}`)!;
        } else if (title && resolutionCache.has(`title:${title.toLowerCase()}`)) {
          tmdbId = resolutionCache.get(`title:${title.toLowerCase()}`)!;
        }

        // Strategy 1: IMDb ID -> TMDB /find (movie_results ONLY)
        if (!tmdbId && imdbId && imdbId !== '-1') {
          try {
            const findData = await this.tmdbCacheService.getCachedFindByExternalId(imdbId, 'imdb_id');
            const movieResults = findData?.movie_results || [];
            if (movieResults.length > 0 && movieResults[0].id) {
              const cand = movieResults[0];
              if (title) {
                const normCand = (cand.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const normExp = title.toLowerCase().replace(/\s*\(\d{4}\)$/, '').replace(/[^a-z0-9]/g, '');
                // Only exact alphanumeric-normalized equality — startsWith is NOT sufficient.
                if (normCand === normExp) {
                  tmdbId = String(cand.id);
                  resolutionCache.set(`imdb:${imdbId}`, tmdbId);
                } else {
                  logger.warn(`[TrackingService] Discarding IMDb ${imdbId} collision: "${cand.title}" does not match "${title}"`);
                }
              } else {
                tmdbId = String(cand.id);
                resolutionCache.set(`imdb:${imdbId}`, tmdbId);
              }
            }
          } catch (err: any) {
            logger.warn(`[TrackingService] IMDb lookup failed for movie ${imdbId}: ${err?.message}`);
          }
        }

        // Strategy 2: TVDB ID -> TMDB /find (movie_results ONLY)
        if (!tmdbId && tvdbId && tvdbId !== '-1') {
          try {
            const findData = await this.tmdbCacheService.getCachedFindByExternalId(tvdbId, 'tvdb_id');
            const movieResults = findData?.movie_results || [];
            if (movieResults.length > 0 && movieResults[0].id) {
              const cand = movieResults[0];
              if (title) {
                const normCand = (cand.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const normExp = title.toLowerCase().replace(/\s*\(\d{4}\)$/, '').replace(/[^a-z0-9]/g, '');
                // Only exact alphanumeric-normalized equality — startsWith is NOT sufficient.
                if (normCand === normExp) {
                  tmdbId = String(cand.id);
                  resolutionCache.set(`tvdb:${tvdbId}`, tmdbId);
                } else {
                  logger.warn(`[TrackingService] Discarding TVDB ${tvdbId} collision: "${cand.title}" does not match "${title}"`);
                }
              } else {
                tmdbId = String(cand.id);
                resolutionCache.set(`tvdb:${tvdbId}`, tmdbId);
              }
            }
          } catch (err: any) {
            logger.warn(`[TrackingService] TVDB lookup failed for movie ${tvdbId}: ${err?.message}`);
          }
        }

        // Strategy 3: Title search fallback (restricted strictly to movies)
        if (!tmdbId && title) {
          try {
            const rawTitle = title.trim();
            const yearParenMatch = rawTitle.match(/^(.*?)\s*\((\d{4})\)$/);
            const cleanTitle = (yearParenMatch && yearParenMatch[1]) ? yearParenMatch[1].trim() : rawTitle;
            const titleYear = (yearParenMatch && yearParenMatch[2]) ? parseInt(yearParenMatch[2], 10) : item.year;

            const norm = (s?: string) =>
              (s || '')
                .toLowerCase()
                .replace(/[…]/g, '...')
                .replace(/[‘’]/g, "'")
                .replace(/[“”]/g, '"')
                .replace(/[\s:_\-]+/g, ' ')
                .trim();

            const targetNorm = norm(cleanTitle);

            let searchResult = await this.tmdbCacheService.getCachedSearch(cleanTitle, '1');
            let movieResults = (searchResult?.results || []).filter(
              (r: any) => r.media_type === 'movie' || (!r.media_type && r.release_date && !r.first_air_date)
            );

            if (movieResults.length === 0 && cleanTitle !== rawTitle) {
              searchResult = await this.tmdbCacheService.getCachedSearch(rawTitle, '1');
              movieResults = (searchResult?.results || []).filter(
                (r: any) => r.media_type === 'movie' || (!r.media_type && r.release_date && !r.first_air_date)
              );
            }

            if (movieResults.length > 0) {
              // Filter out candidates with conflicting release year
              const nonConflicting = movieResults.filter((r: any) => {
                if (!titleYear) return true;
                const rYear = r.release_date ? parseInt(r.release_date.slice(0, 4), 10) : NaN;
                return isNaN(rYear) || Math.abs(rYear - titleYear) <= 1;
              });

              // Exact title match
              const exactMatches = nonConflicting.filter(
                (r: any) => norm(r.title) === targetNorm || norm(r.original_title) === targetNorm
              );

              if (exactMatches.length === 1) {
                tmdbId = String(exactMatches[0].id);
              } else if (exactMatches.length > 1) {
                if (titleYear) {
                  const exactYearMatches = exactMatches.filter((r: any) => {
                    const rYear = r.release_date ? parseInt(r.release_date.slice(0, 4), 10) : NaN;
                    return rYear === titleYear;
                  });
                  if (exactYearMatches.length > 0) {
                    exactYearMatches.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
                    tmdbId = String(exactYearMatches[0].id);
                  } else {
                    exactMatches.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
                    tmdbId = String(exactMatches[0].id);
                  }
                } else {
                  exactMatches.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
                  tmdbId = String(exactMatches[0].id);
                }
              }
            }

            if (tmdbId) {
              resolutionCache.set(`title:${title.toLowerCase()}`, tmdbId);
            }
          } catch (err: any) {
            logger.warn(`[TrackingService] Title search fallback failed for movie ${title}: ${err?.message}`);
          }
        }

        // If not found, log to unmatched
        if (!tmdbId) {
          const reason = imdbId
            ? `Movie not found on TMDB for IMDb ID ${imdbId}`
            : tvdbId
            ? `Movie not found on TMDB for TVDB ID ${tvdbId}`
            : `Ambiguous or missing movie match for title "${title}"`;

          result.unmatched.push({
            title,
            imdbId,
            tvdbId,
            reason,
          });
          continue;
        }

        // Parse optional valid watched date (strictly no default Date.now())
        let validWatchedDate: Date | null = null;
        if (item.watchedDate) {
          const parsed = new Date(item.watchedDate);
          if (!isNaN(parsed.getTime())) {
            validWatchedDate = parsed;
          }
        }

        // Parse optional valid rating (1-10)
        let validRating: number | null = null;
        if (typeof item.userRating === 'number' && !isNaN(item.userRating)) {
          const rounded = Math.round(item.userRating);
          if (rounded >= 1 && rounded <= 10) {
            validRating = rounded;
          }
        }

        // Resolve runtime if possible
        let movieRuntime = 0;
        try {
          const details = await this.tmdbCacheService.getCachedTitleDetails('movie', tmdbId);
          movieRuntime = details?.runtime || 0;
        } catch {
          movieRuntime = 0;
        }

        // Atomic upsert
        const upsertResult = await TrackedItemModel.updateOne(
          { user: userId, tmdbId, mediaType: 'movie' },
          {
            $setOnInsert: {
              user: userId,
              tmdbId,
              mediaType: 'movie',
              movieRuntime,
              watchedEpisodes: [],
              ...(validWatchedDate ? { watchedDate: validWatchedDate } : {}),
              ...(validRating ? { userRating: validRating } : {}),
            },
          },
          { upsert: true }
        );

        if (upsertResult.upsertedCount > 0) {
          result.importedMovies++;
        } else {
          // Existing document: backfill fields only if not already set (never overwrite valid user data with null)
          if (validWatchedDate) {
            await TrackedItemModel.updateOne(
              {
                user: userId,
                tmdbId,
                mediaType: 'movie',
                $or: [{ watchedDate: { $exists: false } }, { watchedDate: null }],
              },
              { $set: { watchedDate: validWatchedDate } }
            );
          }
          if (validRating) {
            await TrackedItemModel.updateOne(
              {
                user: userId,
                tmdbId,
                mediaType: 'movie',
                $or: [{ userRating: { $exists: false } }, { userRating: null }],
              },
              { $set: { userRating: validRating } }
            );
          }
        }

        // Automatically pull from watchlistMovies (established TVTrac behavior)
        await UserModel.updateOne(
          { _id: userId },
          { $pull: { watchlistMovies: String(tmdbId) } }
        ).catch(() => {});

      } catch (err: any) {
        logger.error(`[TrackingService] Failed to import movie ${item.title || item.imdbId}: ${err?.message}`);
        result.failed.push({
          title: item.title,
          imdbId: item.imdbId,
          tvdbId: item.tvdbId,
          reason: err?.message || 'Unexpected server error',
        });
      }
    }

    return result;
  }
}

export interface TvTimeImportItem {
  tvdbId?: string;
  title?: string;
  season: number;
  episode: number;
  watchedDate?: string | Date;
}

export interface TvTimeImportResult {
  processed: number;
  importedEpisodes: number;
  unmatched: Array<{
    title?: string;
    tvdbId?: string;
    season: number;
    episode: number;
    reason: string;
  }>;
  failed: Array<{
    title?: string;
    tvdbId?: string;
    season?: number;
    episode?: number;
    reason: string;
  }>;
}

export interface TvTimeMovieImportItem {
  tvdbId?: string;
  imdbId?: string;
  title?: string;
  year?: number;
  watchedDate?: string | Date;
  userRating?: number;
}

export interface TvTimeMovieImportResult {
  processed: number;
  importedMovies: number;
  unmatched: Array<{
    title?: string;
    imdbId?: string;
    tvdbId?: string;
    reason: string;
  }>;
  failed: Array<{
    title?: string;
    imdbId?: string;
    tvdbId?: string;
    reason: string;
  }>;
}
