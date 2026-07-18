import { Router } from "express";
import { container } from "../../../di/container.js";
import { TYPES } from "../../../di/types.js";
import { TmdbController } from "../controllers/tmdb.controller.js";

const tmdbRoute = Router();
const tmdbController = container.get<TmdbController>(TYPES.TmdbController);

tmdbRoute.get("/trending", tmdbController.getTrending);
tmdbRoute.get("/trending/tv", tmdbController.getTrendingTv);
tmdbRoute.get("/trending/movie", tmdbController.getTrendingMovies);
tmdbRoute.get("/network/:networkId", tmdbController.discoverByNetwork);
tmdbRoute.get("/discover/genre/:genreName", tmdbController.discoverByGenre);
tmdbRoute.get("/discover/advanced", tmdbController.discoverAdvanced);
tmdbRoute.get("/search", tmdbController.search);
tmdbRoute.get("/title/:mediaType/:id", tmdbController.getTitleDetails);
tmdbRoute.get("/tv/:id/season/:seasonNumber", tmdbController.getSeasonDetails);
tmdbRoute.get("/tv/:id/season/:seasonNumber/episode/:episodeNumber", tmdbController.getEpisodeDetails);
tmdbRoute.get("/person/:id", tmdbController.getPersonDetails);

tmdbRoute.get("/collection/:id", tmdbController.getCollection);

export default tmdbRoute;
