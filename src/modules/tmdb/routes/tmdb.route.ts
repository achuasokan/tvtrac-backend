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
tmdbRoute.get("/search", tmdbController.search);

export default tmdbRoute;
