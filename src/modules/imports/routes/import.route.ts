import { Router } from "express";
import { container } from "../../../di/container.js";
import { TYPES } from "../../../di/types.js";
import { ImportController } from "../controllers/import.controller.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";
import { uploadTvTimeFiles } from "../../../shared/utils/cloudinary.js";

const importRoute = Router();
const importController = container.get<ImportController>(TYPES.ImportController);

importRoute.use(authenticate);

// Reconnect: check if user has an active import job on the server
importRoute.get("/active", importController.getActiveJob);

// Start import: accepts multiple CSV and JSON files
importRoute.post("/tvtime", uploadTvTimeFiles.array("files", 10), importController.startTvTimeImport);

// Check job state & progress
importRoute.get("/tvtime/:jobId", importController.getJobStatus);

// Get user-scoped unresolved items for manual matching
importRoute.get("/tvtime/:jobId/unresolved", importController.getUnresolvedItems);

// Resolve individual unresolved candidate
importRoute.post("/tvtime/:jobId/unresolved/:unresolvedId/resolve", importController.resolveUnresolvedItem);

// Request cooperative cancellation
importRoute.post("/tvtime/:jobId/cancel", importController.cancelImport);

export default importRoute;
