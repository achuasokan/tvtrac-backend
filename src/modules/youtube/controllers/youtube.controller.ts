import { Request, Response } from 'express';
import { youtubeService } from '../services/youtube.service.js';

export class YoutubeController {
  async getSoundtrack(req: Request, res: Response): Promise<void> {
    try {
      const { q, composer, refresh } = req.query;
      
      if (!q || typeof q !== 'string') {
        res.status(400).json({ error: 'Search query "q" is required' });
        return;
      }

      const composerStr = typeof composer === 'string' ? composer : undefined;
      const isRefresh = refresh === 'true' || refresh === '1';

      const result = await youtubeService.searchSoundtrack(q, composerStr, isRefresh);
      
      if (result) {
        res.status(200).json(result);
      } else {
        res.status(404).json({ error: 'No soundtrack found' });
      }
    } catch (error) {
      console.error('YouTube Controller Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const youtubeController = new YoutubeController();
