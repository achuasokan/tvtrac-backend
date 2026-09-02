import { IEpisodeReaction } from "../models/episodeReaction.schema.js";
import { IEpisodeComment } from "../models/episodeComment.schema.js";
import { UpsertReactionDTO, CreateCommentDTO, GetCommentsQueryDTO } from "../dtos/discussion.dto.js";

export interface IDiscussionRepository {
  upsertReaction(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number,
    dto: UpsertReactionDTO
  ): Promise<IEpisodeReaction>;

  getUserReaction(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number
  ): Promise<IEpisodeReaction | null>;

  getEpisodeReactionSummary(
    tmdbId: string,
    season: number,
    episode: number
  ): Promise<{
    emotionStats: Record<string, number>;
    totalEmotions: number;
    ratingStats: { averageRating: number | null; totalRatings: number };
    mvpVotes: Array<{ characterId: number; count: number }>;
  }>;

  createComment(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number,
    dto: CreateCommentDTO
  ): Promise<IEpisodeComment>;

  deleteComment(commentId: string, userId: string): Promise<boolean>;

  getCommentById(commentId: string): Promise<IEpisodeComment | null>;

  getComments(
    tmdbId: string,
    season: number,
    episode: number,
    options: GetCommentsQueryDTO
  ): Promise<{ comments: IEpisodeComment[]; nextCursor: string | null; hasMore: boolean }>;

  getUserLikedCommentIds(commentIds: string[], userId: string): Promise<Set<string>>;

  getActualLikeCounts(commentIds: string[]): Promise<Map<string, number>>;

  toggleLike(
    commentId: string,
    userId: string
  ): Promise<{ isLiked: boolean; likeCount: number }>;

  getCommentCount(tmdbId: string, season: number, episode: number): Promise<number>;
}
