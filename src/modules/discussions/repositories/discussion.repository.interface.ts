import { IEpisodeReaction } from "../models/episodeReaction.schema.js";
import { IEpisodeComment, IEpisodeCommentMediaProjection } from "../models/episodeComment.schema.js";
import { IDiscussionMedia } from "../models/discussionMedia.schema.js";
import { UpsertReactionDTO, CreateCommentDTO, GetCommentsQueryDTO } from "../dtos/discussion.dto.js";
import { Types } from "mongoose";

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

  createPendingMedia(data: {
    userId: string;
    type: 'image' | 'gif';
    provider: 'cloudinary' | 'giphy';
    url: string;
    publicId?: string;
    providerId?: string;
  }): Promise<IDiscussionMedia>;

  atomicallyAttachMedia(
    mediaId: string,
    userId: string,
    commentId: string | Types.ObjectId
  ): Promise<IDiscussionMedia | null>;

  findMediaByCommentId(commentId: string): Promise<IDiscussionMedia | null>;

  markMediaForDeletion(commentId: string): Promise<IDiscussionMedia | null>;

  findPendingDeletionMedia(): Promise<IDiscussionMedia[]>;

  findOrphanMedia(olderThanHours: number): Promise<IDiscussionMedia[]>;

  markMediaDeleted(mediaId: string): Promise<boolean>;

  createComment(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number,
    dto: CreateCommentDTO
  ): Promise<IEpisodeComment>;

  deleteComment(commentId: string, userId: string): Promise<IEpisodeComment | null>;

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
