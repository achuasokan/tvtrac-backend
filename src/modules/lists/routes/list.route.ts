import { Router } from "express";
import { container } from "../../../di/container.js";
import { TYPES } from "../../../di/types.js";
import { ListController } from "../controllers/list.controller.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";

const listRouter = Router();
const listController = container.get<ListController>(TYPES.ListController);

// All list routes require authentication
listRouter.use(authenticate);

listRouter.post("/", listController.createList);
listRouter.get("/", listController.getUserLists);
listRouter.put("/:id", listController.updateList);
listRouter.put("/:id/reorder", listController.reorderList);
listRouter.post("/:id/items", listController.addToList);
listRouter.delete("/:id/items", listController.removeFromList);
listRouter.delete("/:id", listController.deleteList);

export default listRouter;
