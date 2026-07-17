import { Router } from 'express';
import { youtubeController } from '../controllers/youtube.controller.js';

const router = Router();

router.get('/soundtrack', youtubeController.getSoundtrack);

export default router;
