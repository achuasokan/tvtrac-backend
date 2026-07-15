import { Router } from "express";
import { container } from "../../../di/container.js";
import { UserController } from "../controllers/user.controller.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";
import { upload } from "../../../shared/utils/cloudinary.js";

import { TYPES } from "../../../di/types.js";

const userRouter = Router();
const userController = container.get<UserController>(TYPES.UserController);

userRouter.use(authenticate);

userRouter.get("/profile", userController.getProfile);
userRouter.patch("/profile", userController.updateProfileDetails);
userRouter.patch("/profile/avatar", upload.single("avatar"), userController.uploadAvatar);
userRouter.delete("/profile/avatar", userController.deleteAvatar);
userRouter.patch("/profile/cover-photo", upload.single("coverPhoto"), userController.uploadCoverPhoto);
userRouter.delete("/profile/cover-photo", userController.deleteCoverPhoto);
userRouter.post("/favorites", userController.toggleFavorite);
userRouter.delete("/favorites", userController.toggleFavorite);
userRouter.post("/watchlist", userController.toggleWatchlist);
userRouter.delete("/watchlist", userController.toggleWatchlist);
userRouter.get("/watchlist/shows/categorized", userController.getCategorizedShows);
userRouter.get("/watchlist/movies/categorized", userController.getCategorizedMovies);

export default userRouter;
