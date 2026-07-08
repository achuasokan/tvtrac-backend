import { injectable } from "inversify";
import { TrackedItemModel } from "../models/trackedItem.schema.js";

@injectable()
export class TrackingService {
  async toggleWatchedStatus(userId: string, tmdbId: string, mediaType: string) {
    const existing = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType });
    
    if (existing) {
      await TrackedItemModel.deleteOne({ _id: existing._id });
      return { watched: false };
    } else {
      await TrackedItemModel.create({ user: userId, tmdbId, mediaType });
      return { watched: true };
    }
  }

  async checkIsWatched(userId: string, tmdbId: string, mediaType: string) {
    const existing = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType });
    return { 
      watched: !!existing,
      watchedEpisodes: existing?.watchedEpisodes || [],
      ignorePreviousEpisodesPrompt: existing?.ignorePreviousEpisodesPrompt || false
    };
  }

  async toggleEpisode(userId: string, tmdbId: string, season: number, episode: number) {
    let doc = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType: 'tv' });
    if (!doc) {
      doc = await TrackedItemModel.create({ user: userId, tmdbId, mediaType: 'tv', watchedEpisodes: [] });
    }

    const index = doc.watchedEpisodes.findIndex(e => e.season === season && e.episode === episode);
    let isWatched = false;
    
    if (index > -1) {
      doc.watchedEpisodes.splice(index, 1);
    } else {
      doc.watchedEpisodes.push({ season, episode, watchedAt: new Date() });
      isWatched = true;
    }
    
    await doc.save();
    return { watched: isWatched, watchedEpisodes: doc.watchedEpisodes };
  }

  async markSeasonWatched(userId: string, tmdbId: string, season: number, episodes: number[]) {
    let doc = await TrackedItemModel.findOne({ user: userId, tmdbId, mediaType: 'tv' });
    if (!doc) {
      doc = await TrackedItemModel.create({ user: userId, tmdbId, mediaType: 'tv', watchedEpisodes: [] });
    }

    const allPresent = episodes.every(ep => doc!.watchedEpisodes.some(e => e.season === season && e.episode === ep));

    if (allPresent) {
      // Remove all episodes of this season from the watched list
      doc.watchedEpisodes = doc.watchedEpisodes.filter(e => !(e.season === season && episodes.includes(e.episode)));
    } else {
      // Add all episodes that aren't already there
      for (const ep of episodes) {
        const exists = doc.watchedEpisodes.some(e => e.season === season && e.episode === ep);
        if (!exists) {
          doc.watchedEpisodes.push({ season, episode: ep, watchedAt: new Date() });
        }
      }
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
}
