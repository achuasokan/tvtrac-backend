import { IUnresolvedImportItem } from "../models/unresolved-import.schema.js";

export interface IUnresolvedImportRepository {
  saveBatch(items: Partial<IUnresolvedImportItem>[]): Promise<void>;
  getByJob(userId: string, jobId: string): Promise<IUnresolvedImportItem[]>;
  getById(userId: string, jobId: string, unresolvedId: string): Promise<IUnresolvedImportItem | null>;
  markResolved(
    userId: string,
    jobId: string,
    unresolvedId: string,
    resolvedTmdbId: string,
    resolvedMediaType: 'movie' | 'tv'
  ): Promise<IUnresolvedImportItem | null>;
}
