import { IEpisodeReaction } from "../models/episodeReaction.schema.js";
import { IEpisodeComment } from "../models/episodeComment.schema.js";
import { IMovieReaction } from "../models/movieReaction.schema.js";
import { IMovieComment } from "../models/movieComment.schema.js";
import {
  UpsertReactionDTO,
  UpsertMovieReactionDTO,
  CreateCommentDTO,
  GetCommentsQueryDTO,
  EpisodeSummaryDTO,
  MovieSummaryDTO,
} from "../dtos/discussion.dto.js";

export interface IDiscussionService {
  getEpisodeSummary(
    tmdbId: string,
    season: number,
    episode: number,
    userId?: string
  ): Promise<EpisodeSummaryDTO>;

  getComments(
    tmdbId: string,
    season: number,
    episode: number,
    query: GetCommentsQueryDTO,
    userId?: string
  ): Promise<{
    comments: Array<any>;
    nextCursor: string | null;
    hasMore: boolean;
    isWatchedByMe: boolean;
  }>;

  upsertReaction(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number,
    dto: UpsertReactionDTO
  ): Promise<IEpisodeReaction>;

  createComment(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number,
    dto: CreateCommentDTO
  ): Promise<IEpisodeComment>;

  uploadMedia(
    userId: string,
    file: Express.Multer.File
  ): Promise<{ mediaId: string; previewUrl: string; type: 'image' }>;

  attachGif(
    userId: string,
    providerId: string
  ): Promise<{ mediaId: string; previewUrl: string; type: 'gif' }>;

  revealComment(
    commentId: string,
    userId: string
  ): Promise<any>;

  deleteComment(commentId: string, userId: string): Promise<boolean>;

  toggleLike(
    commentId: string,
    userId: string
  ): Promise<{ isLiked: boolean; likeCount: number }>;

  processPendingMediaCleanup(): Promise<{ cleanedDeletions: number; cleanedOrphans: number }>;

  getMovieSummary(
    tmdbId: string,
    userId?: string
  ): Promise<MovieSummaryDTO>;

  getMovieComments(
    tmdbId: string,
    query: GetCommentsQueryDTO,
    userId?: string
  ): Promise<{
    comments: Array<any>;
    nextCursor: string | null;
    hasMore: boolean;
    isWatchedByMe: boolean;
  }>;

  upsertMovieReaction(
    userId: string,
    tmdbId: string,
    dto: UpsertMovieReactionDTO
  ): Promise<IMovieReaction>;

  createMovieComment(
    userId: string,
    tmdbId: string,
    dto: CreateCommentDTO
  ): Promise<IMovieComment>;
}
