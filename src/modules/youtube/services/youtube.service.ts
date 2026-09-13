import axios from 'axios';
import { env } from '../../../config/env.js';
import { YoutubeCacheModel } from '../models/youtubeCache.schema.js';

export class YoutubeService {
  async searchSoundtrack(query: string, composer?: string, refresh: boolean = false) {
    try {
      const normalizedQuery = query.trim();
      const normalizedComposer = composer ? composer.trim() : '';
      const cacheKey = `${normalizedQuery.toLowerCase()}${normalizedComposer ? `_${normalizedComposer.toLowerCase()}` : ''}`;
      
      // 1. Check permanent MongoDB cache if not forcing refresh
      if (!refresh) {
        const existingCache = await YoutubeCacheModel.findOne({ query: cacheKey });
        if (existingCache) {
          return {
            url: existingCache.url,
            title: existingCache.title,
            videoId: existingCache.videoId,
            thumbnail: existingCache.thumbnail,
          };
        }
      } else {
        try {
          await YoutubeCacheModel.deleteOne({ query: cacheKey });
        } catch (delErr) {
          console.error('Failed to delete existing cache entry:', delErr);
        }
      }

      const apiKey = env.YOUTUBE_API_KEY;
      if (!apiKey) {
        console.warn('YOUTUBE_API_KEY is not configured in backend');
        return null;
      }

      // 2. Build prioritized search query
      const primarySearchQuery = normalizedComposer 
        ? `${normalizedQuery} ${normalizedComposer} soundtrack OST theme`
        : `${normalizedQuery} official soundtrack main theme OST`;

      const fetchFromYouTube = async (searchQ: string, categoryId?: string) => {
        const params: any = {
          part: 'snippet',
          type: 'video',
          q: searchQ,
          maxResults: 6,
          key: apiKey
        };
        if (categoryId) {
          params.videoCategoryId = categoryId; // 10 is Music
        }
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', { params });
        return response.data?.items || [];
      };

      // Try with music category (10) first
      let videos = [];
      try {
        videos = await fetchFromYouTube(primarySearchQuery, '10');
      } catch {
        videos = [];
      }

      // Fallback without category restriction
      if (!videos || videos.length === 0) {
        try {
          videos = await fetchFromYouTube(primarySearchQuery);
        } catch {
          videos = [];
        }
      }

      // Secondary fallback with just title + soundtrack
      if (!videos || videos.length === 0) {
        try {
          videos = await fetchFromYouTube(`${normalizedQuery} soundtrack`);
        } catch {
          videos = [];
        }
      }

      if (videos && videos.length > 0) {
        // Negative filter to reject reactions, reviews, 10-hour loops, trailers, etc.
        const unwantedKeywords = [
          'reaction', 'review', 'podcast', '10 hours', '10 hour', '1 hour loop', 
          'ending explained', 'breakdown', 'interview', 'gameplay', 'walkthrough',
          'spoiler', 'parody', 'teaser trailer', 'official trailer', 'behind the scenes'
        ];

        let selectedVideo = videos.find((item: any) => {
          const title = (item.snippet?.title || '').toLowerCase();
          return !unwantedKeywords.some(bad => title.includes(bad));
        });

        if (!selectedVideo) {
          selectedVideo = videos[0];
        }

        const videoId = selectedVideo.id.videoId;
        const result = {
          url: `https://youtube.com/watch?v=${videoId}`,
          title: selectedVideo.snippet.title,
          videoId: videoId,
          thumbnail: selectedVideo.snippet.thumbnails?.high?.url || selectedVideo.snippet.thumbnails?.default?.url,
        };

        // 3. Save to permanent MongoDB cache
        try {
          await YoutubeCacheModel.findOneAndUpdate(
            { query: cacheKey },
            { $set: { ...result, query: cacheKey } },
            { upsert: true, new: true }
          );
        } catch (dbError) {
          console.error('Failed to save youtube cache to DB:', dbError);
        }

        return result;
      }

      return null;
    } catch (error) {
      console.error('Error searching YouTube:', error);
      throw new Error('Failed to search YouTube soundtrack');
    }
  }
}

export const youtubeService = new YoutubeService();
