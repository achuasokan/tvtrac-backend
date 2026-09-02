import { IEpisodeReaction } from "../models/episodeReaction.schema.js";
import { IEpisodeComment } from "../models/episodeComment.schema.js";
import { UpsertReactionDTO, CreateCommentDTO, GetCommentsQueryDTO, EpisodeSummaryDTO } from "../dtos/discussion.dto.js";

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

  deleteComment(commentId: string, userId: string): Promise<boolean>;

  toggleLike(
    commentId: string,
    userId: string
  ): Promise<{ isLiked: boolean; likeCount: number }>;
}
