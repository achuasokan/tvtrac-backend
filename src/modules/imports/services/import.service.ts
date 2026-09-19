import { injectable, inject } from "inversify";
import { TYPES } from "../../../di/types.js";
import { redisClient } from "../../../config/redis.js";
import logger from "../../../shared/logger.js";
import { uploadRawToCloudinary, deleteRawFromCloudinary } from "../../../shared/utils/cloudinary.js";
import { IImportService } from "./import.service.interface.js";
import { tvTimeImportQueue, TvTimeImportJobFileRef } from "../queues/import.queue.js";
import { IUnresolvedImportRepository } from "../repositories/unresolved-import.repository.interface.js";
import { IListService } from "../../lists/services/list.service.interface.js";
import { TrackingService } from "../../tracking/services/tracking.service.js";

@injectable()
export class ImportService implements IImportService {
  constructor(
    @inject(TYPES.UnresolvedImportRepository) private unresolvedRepo: IUnresolvedImportRepository,
    @inject(TYPES.ListService) private listService: IListService,
    @inject(TYPES.TrackingService) private trackingService: TrackingService
  ) {}

  public async startTvTimeImport(
    userId: string,
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>
  ): Promise<{ jobId: string; importId: string }> {
    if (!files || files.length === 0) {
      throw new Error("No files uploaded for import");
    }

    const importId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 1. Enforce single active import per user via atomic Redis lock (2 hour TTL)
    const lockKey = `import:user:active:${userId}`;
    const acquired = await redisClient.set(lockKey, importId, "EX", 7200, "NX");

    if (!acquired) {
      const activeJobId = await redisClient.get(lockKey);
      if (activeJobId) {
        const existingJob = await tvTimeImportQueue.getJob(activeJobId);
        const state = existingJob ? await existingJob.getState() : null;
        if (state === "active" || state === "waiting" || state === "delayed") {
          throw new Error("Another TV Time import is currently in progress for your account. Please wait for it to finish or cancel it.");
        }
      }
      // If previous lock was stale, claim lock
      await redisClient.set(lockKey, importId, "EX", 7200);
    }

    // 2. Upload source files to Cloudinary as raw temporary assets
    const uploadedFiles: TvTimeImportJobFileRef[] = [];
    try {
      for (const file of files) {
        const result = await uploadRawToCloudinary(file.buffer, file.originalname);
        uploadedFiles.push({
          publicId: result.publicId,
          url: result.secureUrl,
          originalName: file.originalname,
        });
      }
    } catch (err: any) {
      logger.error("[ImportService] Failed to upload source files to Cloudinary:", { error: err.message });
      // Rollback any files that succeeded before failure
      for (const f of uploadedFiles) {
        await deleteRawFromCloudinary(f.publicId);
      }
      await redisClient.del(lockKey);
      throw new Error(`Failed to store uploaded files in Cloudinary: ${err.message}`);
    }

    // 3. Enqueue small BullMQ job with only metadata references
    try {
      const job = await tvTimeImportQueue.add("tvtime-import", {
        importId,
        userId,
        files: uploadedFiles,
      });

      // Update user lock value to point to actual BullMQ job ID
      await redisClient.set(lockKey, job.id!, "EX", 7200);

      logger.info(`[ImportService] Enqueued BullMQ job ${job.id} for user ${userId} with ${uploadedFiles.length} files`);
      return { jobId: job.id!, importId };
    } catch (err: any) {
      logger.error("[ImportService] Failed to enqueue BullMQ job:", { error: err.message });
      for (const f of uploadedFiles) {
        await deleteRawFromCloudinary(f.publicId);
      }
      await redisClient.del(lockKey);
      throw new Error("Failed to queue background import job");
    }
  }

  public async getJobStatus(
    userId: string,
    jobId: string
  ): Promise<{
    jobId: string;
    state: string;
    progress: any;
    failedReason?: string | null;
    result?: any;
    createdAt?: string;
    finishedOn?: string | null;
    files?: Array<{ name: string }>;
  }> {
    const job = await tvTimeImportQueue.getJob(jobId);
    if (!job) {
      throw new Error("Import job not found");
    }

    // User-scoping security: verify job owner
    if (job.data.userId !== userId) {
      throw new Error("Unauthorized access to import job");
    }

    const state = await job.getState();
    const progress = job.progress || {
      processed: 0,
      total: 0,
      imported: 0,
      duplicates: 0,
      unresolved: 0,
      failed: 0,
      currentStep: state === "completed" ? "Completed" : "Queued...",
    };

    return {
      jobId: job.id!,
      state,
      progress,
      failedReason: job.failedReason || null,
      result: job.returnvalue || null,
      createdAt: new Date(job.timestamp).toISOString(),
      finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      files: (job.data?.files || []).map((f: any) => ({
        name: f.originalName,
      })),
    };
  }

  public async getUnresolvedItems(userId: string, jobId: string): Promise<any[]> {
    const job = await tvTimeImportQueue.getJob(jobId);
    if (!job) {
      throw new Error("Import job not found");
    }

    if (job.data.userId !== userId) {
      throw new Error("Unauthorized access to import job");
    }

    // Fetch items scoped strictly to authenticated user and import ID
    return await this.unresolvedRepo.getByJob(userId, job.data.importId);
  }

  public async resolveUnresolvedItem(
    userId: string,
    jobId: string,
    unresolvedId: string,
    selectedCandidate: { tmdbId: number; mediaType: 'movie' | 'tv'; title?: string }
  ): Promise<{ success: boolean; message: string }> {
    const job = await tvTimeImportQueue.getJob(jobId);
    if (!job) {
      throw new Error("Import job not found");
    }

    if (job.data.userId !== userId) {
      throw new Error("Unauthorized access to import job");
    }

    const item = await this.unresolvedRepo.getById(userId, job.data.importId, unresolvedId);
    if (!item) {
      throw new Error("Unresolved item not found");
    }

    if (item.status === "resolved") {
      return { success: true, message: "Item has already been resolved" };
    }

    // 1. If item came from a custom list, add to target list
    if (item.targetListId) {
      const pos = item.positions && item.positions.length > 0 ? item.positions[0] : undefined;
      await this.listService.addToList(
        userId,
        item.targetListId,
        String(selectedCandidate.tmdbId),
        selectedCandidate.mediaType,
        pos
      );
    } else {
      // 2. If it was from watched tracking, mark watched
      await this.trackingService.toggleWatchedStatus(
        userId,
        String(selectedCandidate.tmdbId),
        selectedCandidate.mediaType
      );
    }

    // 3. Mark unresolved item as resolved in MongoDB
    await this.unresolvedRepo.markResolved(
      userId,
      job.data.importId,
      unresolvedId,
      String(selectedCandidate.tmdbId),
      selectedCandidate.mediaType
    );

    return { success: true, message: "Item resolved and imported successfully" };
  }

  public async cancelImport(userId: string, jobId: string): Promise<{ success: boolean; message: string }> {
    const job = await tvTimeImportQueue.getJob(jobId);
    if (!job) {
      throw new Error("Import job not found");
    }

    if (job.data.userId !== userId) {
      throw new Error("Unauthorized access to import job");
    }

    // Set cooperative cancellation flag in Redis (1 hour TTL)
    await redisClient.set(`import:cancel:${job.data.importId}`, "1", "EX", 3600);
    logger.info(`[ImportService] Cancellation requested for import ${job.data.importId} (job ${jobId})`);

    return { success: true, message: "Cancellation signal sent. Worker will safely stop at the next checkpoint." };
  }

  public async getActiveJob(userId: string): Promise<{ jobId: string } | null> {
    const lockKey = `import:user:active:${userId}`;
    const jobId = await redisClient.get(lockKey);
    if (!jobId) return null;

    try {
      const job = await tvTimeImportQueue.getJob(jobId);
      if (!job || job.data.userId !== userId) return null;

      const state = await job.getState();
      // Only reconnect to genuinely in-progress jobs
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return { jobId };
      }
      // Also return completed jobs so the import page can show results
      if (state === 'completed' || state === 'failed') {
        return { jobId };
      }
      return null;
    } catch {
      return null;
    }
  }
}
