import axios from 'axios';
import { env } from '../../../config/env.js';
import { YoutubeCacheModel } from '../models/youtubeCache.schema.js';

export class YoutubeService {
  async searchSoundtrack(query: string) {
    try {
      const cacheKey = query.toLowerCase();
      
      // 1. Check permanent MongoDB cache
      const existingCache = await YoutubeCacheModel.findOne({ query: cacheKey });
      if (existingCache) {
        return {
          url: existingCache.url,
          title: existingCache.title,
          videoId: existingCache.videoId,
          thumbnail: existingCache.thumbnail,
        };
      }

      // 2. Not in cache, search YouTube via Official API
      const searchQuery = query + ' official soundtrack';
      const apiKey = env.YOUTUBE_API_KEY;
      
      const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          type: 'video',
          q: searchQuery,
          maxResults: 1,
          key: apiKey
        }
      });

      const videos = response.data.items;
      
      if (videos && videos.length > 0) {
        const topResult = videos[0];
        const videoId = topResult.id.videoId;
        const result = {
          url: `https://youtube.com/watch?v=${videoId}`,
          title: topResult.snippet.title,
          videoId: videoId,
          thumbnail: topResult.snippet.thumbnails?.high?.url || topResult.snippet.thumbnails?.default?.url,
        };
        
        // 3. Save to permanent MongoDB cache
        try {
          await YoutubeCacheModel.create({
            query: cacheKey,
            ...result
          });
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
