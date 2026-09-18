import { Request, Response } from "express";
import { injectable, inject } from "inversify";
import { TYPES } from "../../../di/types.js";
import { IImportService } from "../services/import.service.interface.js";
import { HTTP_STATUS } from "../../../shared/constants/http-status.js";

@injectable()
export class ImportController {
  constructor(
    @inject(TYPES.ImportService) private importService: IImportService
  ) {}

  public startTvTimeImport = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId as string;
      if (!userId) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "No files uploaded. Please provide CSV or JSON files." });
      }

      const result = await this.importService.startTvTimeImport(userId, files);
      return res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: "Import job queued successfully",
        jobId: result.jobId,
        importId: result.importId,
      });
    } catch (err: any) {
      console.error("[ImportController] startTvTimeImport error:", err);
      const isConflict = err.message && err.message.includes("in progress");
      return res.status(isConflict ? HTTP_STATUS.CONFLICT : HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: err.message || "Failed to start TV Time import",
      });
    }
  };

  public getJobStatus = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId as string;
      if (!userId) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });
      }

      const jobId = String(req.params.jobId);
      const status = await this.importService.getJobStatus(userId, jobId);
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: status,
      });
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: err.message });
      }
      if (err.message.includes("Unauthorized")) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({ error: err.message });
      }
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: err.message || "Failed to fetch import job status" });
    }
  };

  public getUnresolvedItems = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId as string;
      if (!userId) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });
      }

      const jobId = String(req.params.jobId);
      const items = await this.importService.getUnresolvedItems(userId, jobId);
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: items,
      });
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: err.message });
      }
      if (err.message.includes("Unauthorized")) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({ error: err.message });
      }
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: err.message || "Failed to fetch unresolved items" });
    }
  };

  public resolveUnresolvedItem = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId as string;
      if (!userId) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });
      }

      const jobId = String(req.params.jobId);
      const unresolvedId = String(req.params.unresolvedId);
      const { candidate } = req.body;

      if (!candidate || !candidate.tmdbId || !candidate.mediaType) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "Candidate tmdbId and mediaType are required" });
      }

      const result = await this.importService.resolveUnresolvedItem(
        userId,
        jobId,
        unresolvedId,
        candidate
      );

      return res.status(HTTP_STATUS.OK).json(result);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: err.message });
      }
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: err.message || "Failed to resolve item" });
    }
  };

  public cancelImport = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId as string;
      if (!userId) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });
      }

      const jobId = String(req.params.jobId);
      const result = await this.importService.cancelImport(userId, jobId);
      return res.status(HTTP_STATUS.OK).json(result);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ error: err.message });
      }
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: err.message || "Failed to cancel import" });
    }
  };
}
