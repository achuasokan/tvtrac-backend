import { Router } from "express";
import { container } from "../../../di/container.js";
import { TYPES } from "../../../di/types.js";
import { TrackingController } from "../controllers/tracking.controller.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";

const trackingRoute = Router();
const trackingController = container.get<TrackingController>(TYPES.TrackingController);

trackingRoute.use(authenticate);

trackingRoute.post("/watched/toggle", trackingController.toggleWatchedStatus);
trackingRoute.get("/watched/status/:mediaType/:tmdbId", trackingController.checkIsWatched);
trackingRoute.post("/watched/episode/toggle", trackingController.toggleEpisodeWatched);
trackingRoute.post("/watched/season/toggle", trackingController.markSeasonWatched);
trackingRoute.post("/settings/ignore-previous-prompt", trackingController.setIgnorePreviousPrompt);
trackingRoute.get("/history", trackingController.getWatchHistory);
trackingRoute.get("/stats", trackingController.getStats);

export default trackingRoute;
