import { inject, injectable } from "inversify";
import { TrackedItemModel } from "../models/trackedItem.schema.js";
import { TmdbService } from "../../tmdb/services/tmdb.service.js";
import { TYPES } from "../../../di/types.js";

@injectable()
export class TrackingService {
  constructor(@inject(TYPES.TmdbService) private tmdbService: TmdbService) {}

  private async resolveEpisodeRuntime(
    tmdbId: string,
    runtime?: number,
    season?: number,
    episode?: number,
  ): Promise<number> {
    if (runtime && runtime > 0) return runtime;

    if (season !== undefined && episode !== undefined) {
      try {
        const epDetails = await this.tmdbService.getEpisodeDetails(
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
      const details = await this.tmdbService.getTitleDetails("tv", tmdbId);
      const showRuntime = details?.episode_run_time?.[0];
      return showRuntime && showRuntime > 0 ? showRuntime : 45;
    } catch {
      return 45;
    }
  }

  private async getSeasonEpisodeRuntimes(tmdbId: string, season: number): Promise<Map<number, number>> {
    const runtimes = new Map<number, number>();
    try {
      const seasonDetails = await this.tmdbService.getSeasonDetails(tmdbId, String(season));
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
    const details = await this.tmdbService.getTitleDetails("tv", tmdbId);
    const seasons = (details.seasons || []).filter((s: { season_number: number }) => s.season_number > 0);
    const now = new Date();
    const episodes: { season: number; episode: number; runtime: number }[] = [];

    for (const season of seasons) {
      try {
        const seasonDetails = await this.tmdbService.getSeasonDetails(tmdbId, String(season.season_number));
        for (const ep of seasonDetails.episodes || []) {
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

  async toggleWatchedStatus(userId: string, tmdbId: string, mediaType: 'movie' | 'tv', runtime?: number) {
    if (mediaType === 'movie') {
      const existing = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType });
      if (existing) {
        await TrackedItemModel.deleteOne({ _id: existing._id });
        return { watched: false };
      }

      await TrackedItemModel.create({
        user: userId,
        tmdbId,
        mediaType,
        movieRuntime: runtime || 0,
      });
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

    const releasedEpisodes = await this.getAllReleasedEpisodes(tmdbId);
    const watched = this.isFullyWatched(existing.watchedEpisodes, releasedEpisodes);

    return {
      watched,
      watchedEpisodes: existing.watchedEpisodes || [],
      ignorePreviousEpisodesPrompt: existing.ignorePreviousEpisodesPrompt || false,
    };
  }

  async toggleEpisode(userId: string, tmdbId: string, season: number, episode: number, runtime?: number) {
    let doc = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType: 'tv' });
    const resolvedRuntime = await this.resolveEpisodeRuntime(tmdbId, runtime, season, episode);

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
      return { watched: false, watchedEpisodes: [] };
    }
    
    await doc.save();
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

  async getStats(userId: string) {
    const allItems = await TrackedItemModel.find({ user: userId });

    const movies = allItems.filter(item => item.mediaType === 'movie');
    const tvShows = allItems.filter(item => item.mediaType === 'tv' && (item.watchedEpisodes?.length || 0) > 0);

    // Backfill missing per-episode runtimes from TMDB
    for (const show of tvShows) {
      await this.backfillEpisodeRuntimes(show);
    }

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
}
