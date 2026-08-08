import { Router } from "express";
import { container } from "../../../di/container.js";
import { TYPES } from "../../../di/types.js";
import { AuthController } from "../controllers/auth.controller.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";

const authRouter = Router();
const authController = container.get<AuthController>(TYPES.AuthController);

authRouter.post("/google", authController.googleLogin);
authRouter.post("/logout", authController.logout);
authRouter.post("/refresh", authController.refreshToken);
authRouter.get("/me", authenticate, authController.getCurrentUser);

export default authRouter;
