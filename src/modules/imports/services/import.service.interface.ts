export interface IImportService {
  startTvTimeImport(
    userId: string,
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>
  ): Promise<{ jobId: string; importId: string }>;

  getJobStatus(
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
  }>;

  getUnresolvedItems(userId: string, jobId: string): Promise<any[]>;

  resolveUnresolvedItem(
    userId: string,
    jobId: string,
    unresolvedId: string,
    selectedCandidate: { tmdbId: number; mediaType: 'movie' | 'tv'; title?: string }
  ): Promise<{ success: boolean; message: string }>;

  cancelImport(userId: string, jobId: string): Promise<{ success: boolean; message: string }>;

  getActiveJob(userId: string): Promise<{ jobId: string } | null>;
}
