import { Worker, Job } from "bullmq";
import axios from "axios";
import { Types } from "mongoose";
import { redisClient, workerRedisClient } from "../../../config/redis.js";
import { env } from "../../../config/env.js";
import logger from "../../../shared/logger.js";
import { deleteRawFromCloudinary } from "../../../shared/utils/cloudinary.js";
import { container } from "../../../di/container.js";
import { TYPES } from "../../../di/types.js";
import { TrackingService } from "../../tracking/services/tracking.service.js";
import { IListService } from "../../lists/services/list.service.interface.js";
import { IUnresolvedImportRepository } from "../repositories/unresolved-import.repository.interface.js";
import { IUnresolvedImportItem, IUnresolvedCandidate } from "../models/unresolved-import.schema.js";
import { parseTvTimeExportBundle } from "../utils/tvTimeParser.js";
import {
  TVTIME_IMPORT_QUEUE_NAME,
  TvTimeImportJobData,
  TvTimeImportJobProgress,
} from "../queues/import.queue.js";

/**
 * Check if job has been requested for cooperative cancellation
 */
async function isJobCancelled(importId: string): Promise<boolean> {
  const flag = await redisClient.get(`import:cancel:${importId}`);
  return !!flag;
}

/**
 * TV Time Import Worker Processor
 */
export async function processTvTimeImport(job: Job<TvTimeImportJobData>): Promise<any> {
  const { importId, userId, files } = job.data;
  logger.info(`[ImportWorker] Starting import job ${job.id} (importId: ${importId}) for user: ${userId}`);

  const trackingService = container.get<TrackingService>(TYPES.TrackingService);
  const listService = container.get<IListService>(TYPES.ListService);
  const unresolvedRepo = container.get<IUnresolvedImportRepository>(TYPES.UnresolvedImportRepository);

  let processed = 0;
  let imported = 0;
  let duplicates = 0;
  let unresolved = 0;
  let failed = 0;

  // Granular category accounting
  let processedEpisodes = 0;
  let importedEpisodes = 0;

  let processedMovies = 0;
  let importedMovies = 0;

  let processedListItems = 0;
  let importedListItems = 0;
  let duplicateListItems = 0;
  let importedListsCount = 0;

  const unresolvedAccumulator = new Map<string, Partial<IUnresolvedImportItem>>();

  try {
    // Check initial cancellation
    if (await isJobCancelled(importId)) {
      logger.info(`[ImportWorker] Job ${importId} was cancelled before downloading files`);
      return { status: "cancelled", processed: 0 };
    }

    // 1. Download raw CSV/JSON files from Cloudinary
    await job.updateProgress({
      processed: 0,
      total: 0,
      imported: 0,
      duplicates: 0,
      unresolved: 0,
      failed: 0,
      currentStep: "Downloading uploaded source files from Cloudinary...",
    } as TvTimeImportJobProgress);

    const filePayloads: Array<{ name: string; content: string }> = [];
    for (const f of files) {
      try {
        const res = await axios.get(f.url, {
          responseType: "text",
          timeout: 30000,
        });
        filePayloads.push({
          name: f.originalName,
          content: typeof res.data === "string" ? res.data : JSON.stringify(res.data),
        });
      } catch (err: any) {
        logger.error(`[ImportWorker] Failed to download file from Cloudinary: ${f.originalName}`, { error: err.message });
        throw new Error(`Failed to retrieve file ${f.originalName} from storage`);
      }
    }

    // 2. Parse bundle using RFC 4180 parser and content-first classifier
    await job.updateProgress({
      processed: 0,
      total: 0,
      imported: 0,
      duplicates: 0,
      unresolved: 0,
      failed: 0,
      currentStep: "Parsing and classifying TV Time export...",
    } as TvTimeImportJobProgress);

    const parseResult = parseTvTimeExportBundle(filePayloads);
    const totalEpisodes = parseResult.episodes.totalCount;
    const totalMovies = parseResult.movies.totalCount;
    const totalListItems = parseResult.lists.totalItems;
    const totalRows = totalEpisodes + totalMovies + totalListItems;

    logger.info(`[ImportWorker] Parsed ${totalRows} total source items (episodes: ${totalEpisodes}, movies: ${totalMovies}, listItems: ${totalListItems})`);

    const updateProgress = async (step: string) => {
      await job.updateProgress({
        processed,
        total: totalRows,
        imported,
        duplicates,
        unresolved,
        failed,
        currentStep: step,
        episodes: {
          processed: processedEpisodes,
          total: totalEpisodes,
          imported: importedEpisodes,
        },
        movies: {
          processed: processedMovies,
          total: totalMovies,
          imported: importedMovies,
        },
        lists: {
          processed: processedListItems,
          total: totalListItems,
          imported: importedListItems,
          duplicates: duplicateListItems,
          listsCount: importedListsCount,
        },
      } as TvTimeImportJobProgress);
    };

    await updateProgress("Starting batch processing...");

    // 3. Process Episodes Batches
    const epBatches = parseResult.episodes.batches;
    if (epBatches.length > 0) {
      for (let b = 0; b < epBatches.length; b++) {
        if (await isJobCancelled(importId)) {
          logger.info(`[ImportWorker] Checkpoint cancellation detected at episode batch ${b + 1}`);
          return { status: "cancelled", processed, imported, duplicates, unresolved, failed };
        }

        const batch = epBatches[b];
        if (!batch || batch.length === 0) continue;
        try {
          const res = await trackingService.importTvTimeBatch(userId, batch);
          const batchProcessed = res.processed || batch.length;
          const batchImported = res.importedEpisodes || 0;
          const batchUnmatched = Array.isArray(res.unmatched) ? res.unmatched.length : 0;
          const batchFailed = Array.isArray(res.failed) ? res.failed.length : 0;
          const batchDuplicates = Math.max(0, batchProcessed - (batchImported + batchUnmatched + batchFailed));

          processed += batchProcessed;
          imported += batchImported;
          duplicates += batchDuplicates;
          unresolved += batchUnmatched;
          failed += batchFailed;

          processedEpisodes += batchProcessed;
          importedEpisodes += batchImported;

          if (Array.isArray(res.unmatched)) {
            for (const u of res.unmatched) {
              const key = `tv:${(u.title || '').toLowerCase().trim()}:${u.season || ''}:${u.episode || ''}`;
              if (!unresolvedAccumulator.has(key)) {
                unresolvedAccumulator.set(key, {
                  userId: new Types.ObjectId(userId),
                  jobId: importId,
                  sourceTitle: u.title || `TVDB ${u.tvdbId || 'Unknown'}`,
                  sourceMediaType: 'tv',
                  sourceExternalIds: { tvdbId: u.tvdbId },
                  candidates: [],
                  reason: u.reason || 'TV show or episode not matched on TMDB',
                  status: 'unresolved',
                  occurrences: 1,
                });
              } else {
                const item = unresolvedAccumulator.get(key)!;
                item.occurrences = (item.occurrences || 1) + 1;
              }
            }
          }
        } catch (err: any) {
          logger.error(`[ImportWorker] Episode batch ${b + 1} failed: ${err.message}`);
          processed += batch.length;
          failed += batch.length;
        }

        await updateProgress(`Importing TV Episodes (${processed}/${totalRows})...`);
      }
    }

    // 4. Process Movies Batches
    const movieBatches = parseResult.movies.batches;
    if (movieBatches.length > 0) {
      for (let b = 0; b < movieBatches.length; b++) {
        if (await isJobCancelled(importId)) {
          logger.info(`[ImportWorker] Checkpoint cancellation detected at movie batch ${b + 1}`);
          return { status: "cancelled", processed, imported, duplicates, unresolved, failed };
        }

        const batch = movieBatches[b];
        if (!batch || batch.length === 0) continue;
        try {
          const res = await trackingService.importMovieBatch(userId, batch);
          const batchProcessed = res.processed || batch.length;
          const batchImported = res.importedMovies || 0;
          const batchUnmatched = Array.isArray(res.unmatched) ? res.unmatched.length : 0;
          const batchFailed = Array.isArray(res.failed) ? res.failed.length : 0;
          const batchDuplicates = Math.max(0, batchProcessed - (batchImported + batchUnmatched + batchFailed));

          processed += batchProcessed;
          imported += batchImported;
          duplicates += batchDuplicates;
          unresolved += batchUnmatched;
          failed += batchFailed;

          processedMovies += batchProcessed;
          importedMovies += batchImported;

          if (Array.isArray(res.unmatched)) {
            for (const u of res.unmatched) {
              const key = `movie:${(u.title || '').toLowerCase().trim()}:${u.imdbId || ''}`;
              if (!unresolvedAccumulator.has(key)) {
                unresolvedAccumulator.set(key, {
                  userId: new Types.ObjectId(userId),
                  jobId: importId,
                  sourceTitle: u.title || u.imdbId || 'Unknown Movie',
                  sourceMediaType: 'movie',
                  sourceExternalIds: { imdbId: u.imdbId, tvdbId: u.tvdbId },
                  candidates: [],
                  reason: u.reason || 'Movie not matched on TMDB',
                  status: 'unresolved',
                  occurrences: 1,
                });
              } else {
                const item = unresolvedAccumulator.get(key)!;
                item.occurrences = (item.occurrences || 1) + 1;
              }
            }
          }
        } catch (err: any) {
          logger.error(`[ImportWorker] Movie batch ${b + 1} failed: ${err.message}`);
          processed += batch.length;
          failed += batch.length;
        }

        await updateProgress(`Importing Watched Movies (${processed}/${totalRows})...`);
      }
    }

    // 5. Process Custom Lists Batches
    const parsedLists = parseResult.lists.lists;
    if (parsedLists.length > 0) {
      for (const listPayload of parsedLists) {
        for (const batch of listPayload.batches) {
          if (!batch || !batch.items || batch.items.length === 0) continue;
          if (await isJobCancelled(importId)) {
            logger.info(`[ImportWorker] Checkpoint cancellation detected at list: ${listPayload.name}`);
            return { status: "cancelled", processed, imported, duplicates, unresolved, failed };
          }

          try {
            const res = await listService.importBatch(userId, batch);
            const batchProcessed = res.processed || batch.items.length;
            const batchImported = res.importedItems || 0;
            const batchDuplicates = res.duplicatesCount || 0;
            const batchFailed = Array.isArray(res.failed) ? res.failed.length : 0;
            const batchUnmatched = Array.isArray(res.unmatched) ? res.unmatched.length : 0;

            processed += batchProcessed;
            imported += batchImported;
            duplicates += batchDuplicates;
            unresolved += batchUnmatched;
            failed += batchFailed;

            processedListItems += batchProcessed;
            importedListItems += batchImported;
            duplicateListItems += batchDuplicates;
            importedListsCount = parsedLists.length;

            // Handle ambiguous items quarantined for manual resolution
            if (Array.isArray(res.unresolvedGroups)) {
              for (const g of res.unresolvedGroups) {
                const normTitle = (g.title || '').toLowerCase().trim();
                const fullKey = `list:${listPayload.name}:${g.mediaType || 'unknown'}:${normTitle}:${g.titleYear || ''}`;
                const existing = unresolvedAccumulator.get(fullKey);

                const mappedCandidates: IUnresolvedCandidate[] = Array.isArray(g.candidates)
                  ? g.candidates.map((c) => ({
                      tmdbId: Number(c.id),
                      mediaType: c.mediaType,
                      title: c.title,
                      releaseYear: c.year,
                      posterPath: c.posterPath,
                      voteAverage: c.voteAverage,
                      voteCount: c.voteCount,
                    }))
                  : [];

                if (existing) {
                  existing.occurrences = (existing.occurrences || 1) + (g.occurrences || 1);
                  if ((!existing.candidates || existing.candidates.length === 0) && mappedCandidates.length > 0) {
                    existing.candidates = mappedCandidates;
                  }
                  if (!existing.targetListId && res.listId) {
                    existing.targetListId = res.listId;
                    existing.targetListName = listPayload.name;
                  }
                } else {
                  unresolvedAccumulator.set(fullKey, {
                    userId: new Types.ObjectId(userId),
                    jobId: importId,
                    sourceTitle: g.title,
                    sourceYear: g.titleYear,
                    sourceMediaType: g.mediaType || 'unknown',
                    candidates: mappedCandidates,
                    reason: 'Multiple title candidates require manual matching',
                    status: 'unresolved',
                    occurrences: g.occurrences || 1,
                    targetListId: res.listId,
                    targetListName: listPayload.name,
                    positions: g.positions || [],
                  });
                }
              }
            }
          } catch (err: any) {
            logger.error(`[ImportWorker] List batch import error (${listPayload.name}): ${err.message}`);
            processed += batch.items.length;
            failed += batch.items.length;
          }

          await updateProgress(`Importing Custom Lists (${processed}/${totalRows})...`);
        }
      }
    }

    // 6. Persist grouped unresolved items to MongoDB
    if (unresolvedAccumulator.size > 0) {
      const itemsToPersist = Array.from(unresolvedAccumulator.values());
      await unresolvedRepo.saveBatch(itemsToPersist);
      logger.info(`[ImportWorker] Persisted ${itemsToPersist.length} unresolved groups for manual matching`);
    }

    // 7. Mark final progress
    await job.updateProgress({
      processed,
      total: totalRows,
      imported,
      duplicates,
      unresolved,
      failed,
      currentStep: "Completed",
      episodes: {
        processed: processedEpisodes,
        total: totalEpisodes,
        imported: importedEpisodes,
      },
      movies: {
        processed: processedMovies,
        total: totalMovies,
        imported: importedMovies,
      },
      lists: {
        processed: processedListItems,
        total: totalListItems,
        imported: importedListItems,
        duplicates: duplicateListItems,
        listsCount: importedListsCount,
      },
    } as TvTimeImportJobProgress);

    logger.info(`[ImportWorker] Finished job ${job.id}. Processed: ${processed}/${totalRows}, Imported: ${imported}, Duplicates: ${duplicates}, Unresolved: ${unresolved}, Failed: ${failed}`);

    return {
      status: "completed",
      importId,
      total: totalRows,
      processed,
      imported,
      duplicates,
      unresolved,
      failed,
      completedAt: new Date().toISOString(),
    };
  } finally {
    // 8. Idempotent Cloudinary Cleanup: always delete temporary raw source files
    logger.info(`[ImportWorker] Cleaning up ${files.length} temporary Cloudinary files for import ${importId}...`);
    for (const f of files) {
      await deleteRawFromCloudinary(f.publicId);
    }

    // 9. Release single-active-import user lock and cancellation flag in Redis
    await redisClient.del(`import:user:active:${userId}`);
    await redisClient.del(`import:cancel:${importId}`);
  }
}

/**
 * TV Time Import Worker Instance
 */
export const tvTimeImportWorker = new Worker<TvTimeImportJobData, any, string>(
  TVTIME_IMPORT_QUEUE_NAME,
  processTvTimeImport,
  {
    connection: workerRedisClient,
    concurrency: env.IMPORT_WORKER_CONCURRENCY,
    limiter: {
      max: 35, // Rate limit: max 35 batches/reqs per sec to respect TMDB API
      duration: 1000,
    },
  }
);

tvTimeImportWorker.on("completed", (job) => {
  logger.info(`[BullMQ Worker] Job ${job.id} completed successfully`);
});

tvTimeImportWorker.on("failed", (job, err) => {
  logger.error(`[BullMQ Worker] Job ${job?.id} failed:`, { error: err.message });
});
