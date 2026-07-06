import "reflect-metadata";
import { Container } from "inversify";
import { TYPES } from "./types.js";

import { IAuthRepository } from "../modules/auth/repositories/auth.repoistory.interface.js";
import { AuthRepository } from "../modules/auth/repositories/auth.repository.js";
import { IAuthService } from "../modules/auth/services/auth.service.interface.js";
import { AuthService } from "../modules/auth/services/auth.service.js";
import { AuthController } from "../modules/auth/controllers/auth.controller.js";

import { TmdbService } from "../modules/tmdb/services/tmdb.service.js";
import { TmdbController } from "../modules/tmdb/controllers/tmdb.controller.js";

const container = new Container();

container.bind<IAuthRepository>(TYPES.AuthRepository).to(AuthRepository);
container.bind<IAuthService>(TYPES.AuthService).to(AuthService);
container.bind<AuthController>(TYPES.AuthController).to(AuthController);
container.bind<TmdbService>(TYPES.TmdbService).to(TmdbService);
container.bind<TmdbController>(TYPES.TmdbController).to(TmdbController);

export { container };
