import "reflect-metadata";
import { Container } from "inversify";
import { TYPES } from "./types.js";

import { IAuthRepository } from "../modules/auth/repositories/auth.repoistory.interface.js";
import { AuthRepository } from "../modules/auth/repositories/auth.repository.js";
import { IAuthService } from "../modules/auth/services/auth.service.interface.js";
import { AuthService } from "../modules/auth/services/auth.service.js";
import { AuthController } from "../modules/auth/controllers/auth.controller.js";
import { TmdbService } from "../modules/tmdb/services/tmdb.service.js";
import { TmdbCacheService } from "../modules/tmdb/services/tmdbCache.service.js";
import { TmdbController } from "../modules/tmdb/controllers/tmdb.controller.js";

import { TrackingService } from "../modules/tracking/services/tracking.service.js";
import { TrackingController } from "../modules/tracking/controllers/tracking.controller.js";

import { IListRepository } from "../modules/lists/repositories/list.repository.interface.js";
import { ListRepository } from "../modules/lists/repositories/list.repository.js";
import { IListService } from "../modules/lists/services/list.service.interface.js";
import { ListService } from "../modules/lists/services/list.service.js";
import { ListController } from "../modules/lists/controllers/list.controller.js";

import { IUserRepository } from "../modules/users/repositories/user.repository.interface.js";
import { UserRepository } from "../modules/users/repositories/user.repository.js";
import { IUserService } from "../modules/users/services/user.service.interface.js";
import { UserService } from "../modules/users/services/user.service.js";
import { UserCategorizationService } from "../modules/users/services/userCategorization.service.js";
import { UserController } from "../modules/users/controllers/user.controller.js";

const container = new Container();

container.bind<IAuthRepository>(TYPES.AuthRepository).to(AuthRepository);
container.bind<IAuthService>(TYPES.AuthService).to(AuthService);
container.bind<AuthController>(TYPES.AuthController).to(AuthController);
container.bind<TmdbService>(TYPES.TmdbService).to(TmdbService);
container.bind<TmdbCacheService>(TYPES.TmdbCacheService).to(TmdbCacheService);
container.bind<TmdbController>(TYPES.TmdbController).to(TmdbController);
container.bind<TrackingService>(TYPES.TrackingService).to(TrackingService);
container.bind<TrackingController>(TYPES.TrackingController).to(TrackingController);

container.bind<IListRepository>(TYPES.ListRepository).to(ListRepository);
container.bind<IListService>(TYPES.ListService).to(ListService);
container.bind<ListController>(TYPES.ListController).to(ListController);

container.bind<IUserRepository>(TYPES.UserRepository).to(UserRepository);
container.bind<IUserService>(TYPES.UserService).to(UserService);
container.bind<UserCategorizationService>(TYPES.UserCategorizationService).to(UserCategorizationService);
container.bind<UserController>(TYPES.UserController).to(UserController);

export { container };
