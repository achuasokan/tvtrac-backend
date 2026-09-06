import { inject, injectable } from "inversify";
import { TYPES } from "../../../di/types.js";
import { IDiscussionService } from "./discussion.service.interface.js";
import { IDiscussionRepository } from "../repositories/discussion.repository.interface.js";
import { TmdbCacheService } from "../../tmdb/services/tmdbCache.service.js";
import { TrackedItemModel } from "../../tracking/models/trackedItem.schema.js";
import {
  UpsertReactionDTO,
  UpsertMovieReactionDTO,
  CreateCommentDTO,
  GetCommentsQueryDTO,
  EpisodeSummaryDTO,
  MovieSummaryDTO,
} from "../dtos/discussion.dto.js";
import { IEpisodeReaction } from "../models/episodeReaction.schema.js";
import { IEpisodeComment } from "../models/episodeComment.schema.js";
import { IMovieReaction } from "../models/movieReaction.schema.js";
import { IMovieComment } from "../models/movieComment.schema.js";
import { cloudinary } from "../../../shared/utils/cloudinary.js";

@injectable()
export class DiscussionService implements IDiscussionService {
  constructor(
    @inject(TYPES.DiscussionRepository) private discussionRepository: IDiscussionRepository,
    @inject(TYPES.TmdbCacheService) private tmdbCacheService: TmdbCacheService
  ) {}

  private async isEpisodeWatchedByUser(
    userId: string | undefined,
    tmdbId: string,
    season: number,
    episode: number
  ): Promise<boolean> {
    if (!userId) return false;

    const tracked = await TrackedItemModel.findOne({
      user: userId,
      tmdbId: String(tmdbId),
      mediaType: "tv",
    }).lean();

    if (!tracked || !tracked.watchedEpisodes) return false;

    return tracked.watchedEpisodes.some(
      (ep: any) => ep.season === Number(season) && ep.episode === Number(episode)
    );
  }

  private async getCanonicalEpisodeCast(
    tmdbId: string,
    season: number,
    episode: number
  ): Promise<Array<{ id: number; name: string; actorName: string; profilePath: string | null }>> {
    try {
      const episodeData = await this.tmdbCacheService.getCachedEpisodeDetails(
        String(tmdbId),
        String(season),
        String(episode)
      );

      const castMap = new Map<number, { id: number; name: string; actorName: string; profilePath: string | null }>();

      // 1. Guest stars from episode
      if (episodeData?.guest_stars && Array.isArray(episodeData.guest_stars)) {
        for (const star of episodeData.guest_stars) {
          if (star.id && star.character) {
            castMap.set(star.id, {
              id: star.id,
              name: star.character,
              actorName: star.name || star.original_name,
              profilePath: star.profile_path || null,
            });
          }
        }
      }

      // 2. Main series cast from show credits
      const showDetails = await this.tmdbCacheService.getCachedTitleDetails("tv", String(tmdbId));
      if (showDetails?.credits?.cast && Array.isArray(showDetails.credits.cast)) {
        for (const member of showDetails.credits.cast) {
          if (member.id && member.character && !castMap.has(member.id)) {
            castMap.set(member.id, {
              id: member.id,
              name: member.character,
              actorName: member.name || member.original_name,
              profilePath: member.profile_path || null,
            });
          }
        }
      }

      return Array.from(castMap.values());
    } catch (err) {
      console.warn("[DiscussionService] Failed to load episode cast for validation:", err);
      return [];
    }
  }

  public async getEpisodeSummary(
    tmdbId: string,
    season: number,
    episode: number,
    userId?: string
  ): Promise<EpisodeSummaryDTO> {
    const sNum = Number(season);
    const eNum = Number(episode);

    const [rawSummary, totalComments, isWatched, userReaction, canonicalCast] = await Promise.all([
      this.discussionRepository.getEpisodeReactionSummary(tmdbId, sNum, eNum),
      this.discussionRepository.getCommentCount(tmdbId, sNum, eNum),
      this.isEpisodeWatchedByUser(userId, tmdbId, sNum, eNum),
      userId ? this.discussionRepository.getUserReaction(userId, tmdbId, sNum, eNum) : Promise.resolve(null),
      this.getCanonicalEpisodeCast(tmdbId, sNum, eNum),
    ]);

    const castLookup = new Map(canonicalCast.map((c) => [c.id, c]));

    // Calculate total MVP votes for percentages
    const totalMvpVotes = rawSummary.mvpVotes.reduce((acc, curr) => acc + curr.count, 0);

    const mvpLeaderboard = rawSummary.mvpVotes.map((vote) => {
      const canonical = castLookup.get(vote.characterId);
      return {
        characterId: vote.characterId,
        name: canonical?.name || "Unknown Character",
        actorName: canonical?.actorName || "",
        profilePath: canonical?.profilePath || null,
        voteCount: vote.count,
        percentage: totalMvpVotes > 0 ? Math.round((vote.count / totalMvpVotes) * 100) : 0,
      };
    });

    return {
      emotionStats: {
        mindblown: rawSummary.emotionStats.mindblown || 0,
        loved: rawSummary.emotionStats.loved || 0,
        funny: rawSummary.emotionStats.funny || 0,
        epic: rawSummary.emotionStats.epic || 0,
        tense: rawSummary.emotionStats.tense || 0,
        shocked: rawSummary.emotionStats.shocked || 0,
        emotional: rawSummary.emotionStats.emotional || 0,
        confused: rawSummary.emotionStats.confused || 0,
        angry: rawSummary.emotionStats.angry || 0,
        boring: rawSummary.emotionStats.boring || 0,
        total: rawSummary.totalEmotions,
      },
      ratingStats: rawSummary.ratingStats,
      mvpLeaderboard,
      totalComments,
      userReaction: userReaction
        ? {
            emotion: userReaction.emotion || null,
            characterId: userReaction.characterId || null,
            rating: userReaction.rating || null,
            platform: userReaction.platform || null,
          }
        : null,
      isWatchedByMe: isWatched,
    };
  }

  public async getComments(
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
  }> {
    const sNum = Number(season);
    const eNum = Number(episode);

    const isWatched = await this.isEpisodeWatchedByUser(userId, tmdbId, sNum, eNum);

    const result = await this.discussionRepository.getComments(tmdbId, sNum, eNum, query);

    const commentIds = result.comments.map((c: any) => String(c._id));
    const [likedSet, actualCounts] = await Promise.all([
      userId
        ? this.discussionRepository.getUserLikedCommentIds(commentIds, userId)
        : Promise.resolve(new Set<string>()),
      this.discussionRepository.getActualLikeCounts(commentIds),
    ]);

    const allowSpoilers = isWatched || query.reveal === true;

    const sanitizedComments = result.comments.map((c: any) => {
      const isSpoiler = Boolean(c.isSpoiler);
      const allowContent = !isSpoiler || allowSpoilers;
      const content = allowContent ? c.content : null;
      const likeCount = actualCounts.get(String(c._id)) ?? 0;

      const hasMedia = Boolean(c.media?.url);
      const media = allowContent && c.media ? {
        type: c.media.type,
        url: c.media.url,
      } : null;
      const isMediaMasked = isSpoiler && !allowSpoilers && hasMedia;

      return {
        _id: String(c._id),
        user: c.user,
        content,
        media,
        isSpoiler,
        isMediaMasked,
        likeCount,
        isLikedByMe: likedSet.has(String(c._id)),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    return {
      comments: sanitizedComments,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      isWatchedByMe: isWatched,
    };
  }

  public async upsertReaction(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number,
    dto: UpsertReactionDTO
  ): Promise<IEpisodeReaction> {
    const sNum = Number(season);
    const eNum = Number(episode);

    // Validation 1: Rating range
    if (dto.rating !== undefined && dto.rating !== null) {
      const r = Number(dto.rating);
      if (isNaN(r) || r < 1 || r > 10) {
        throw new Error("Rating must be a number between 1 and 10");
      }
      dto.rating = Math.round(r);
    }

    // Validation 2: Emotion enum
    if (dto.emotion !== undefined && dto.emotion !== null) {
      const validEmotions = ["mindblown", "loved", "funny", "epic", "tense", "shocked", "emotional", "confused", "angry", "boring"];
      if (!validEmotions.includes(dto.emotion)) {
        throw new Error("Invalid emotion reaction");
      }
    }

    // Validation 3: Canonical Character ID verification
    if (dto.characterId !== undefined && dto.characterId !== null) {
      const cId = Number(dto.characterId);
      const cast = await this.getCanonicalEpisodeCast(tmdbId, sNum, eNum);
      const isValidCharacter = cast.some((member) => member.id === cId);

      if (!isValidCharacter && cast.length > 0) {
        throw new Error("Selected character does not belong to this episode");
      }
      dto.characterId = cId;
    }

    // Validation 4: Platform sanitization
    if (dto.platform !== undefined && dto.platform !== null) {
      dto.platform = String(dto.platform).trim().slice(0, 100);
      if (dto.platform.length === 0) dto.platform = null;
    }

    return this.discussionRepository.upsertReaction(userId, tmdbId, sNum, eNum, dto);
  }

  public async uploadMedia(
    userId: string,
    file: Express.Multer.File
  ): Promise<{ mediaId: string; previewUrl: string; type: 'image' }> {
    if (!file) {
      throw new Error("No image file provided");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("Image file size exceeds maximum limit of 10MB");
    }

    const pendingMedia = await this.discussionRepository.createPendingMedia({
      userId,
      type: 'image',
      provider: 'cloudinary',
      url: file.path,
      publicId: file.filename,
    });

    return {
      mediaId: pendingMedia._id.toString(),
      previewUrl: pendingMedia.url,
      type: 'image',
    };
  }

  public async attachGif(
    userId: string,
    providerId: string
  ): Promise<{ mediaId: string; previewUrl: string; type: 'gif' }> {
    if (!providerId || typeof providerId !== "string") {
      throw new Error("GIPHY provider ID is required");
    }

    const trimmedId = providerId.trim();
    if (!/^[a-zA-Z0-9_-]{6,50}$/.test(trimmedId)) {
      throw new Error("Invalid GIPHY provider ID format");
    }

    const canonicalUrl = `https://i.giphy.com/media/${trimmedId}/200.gif`;

    const pendingMedia = await this.discussionRepository.createPendingMedia({
      userId,
      type: 'gif',
      provider: 'giphy',
      url: canonicalUrl,
      providerId: trimmedId,
    });

    return {
      mediaId: pendingMedia._id.toString(),
      previewUrl: pendingMedia.url,
      type: 'gif',
    };
  }

  public async createComment(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number,
    dto: CreateCommentDTO
  ): Promise<IEpisodeComment> {
    const hasContent = Boolean(dto.content && dto.content.trim().length > 0);
    const hasMedia = Boolean(dto.mediaId && dto.mediaId.trim().length > 0);

    if (!hasContent && !hasMedia) {
      throw new Error("Comment must contain either text or a media attachment");
    }

    if (hasContent && dto.content!.trim().length > 2000) {
      throw new Error("Comment exceeds maximum length of 2000 characters");
    }

    return this.discussionRepository.createComment(
      userId,
      tmdbId,
      Number(season),
      Number(episode),
      dto
    );
  }

  public async revealComment(commentId: string, userId: string): Promise<any> {
    let comment: any = await this.discussionRepository.getCommentById(commentId);
    if (!comment) {
      comment = await this.discussionRepository.getMovieCommentById(commentId);
    }
    if (!comment) {
      throw new Error("Comment not found");
    }

    return {
      _id: String(comment._id),
      content: comment.content,
      media: comment.media ? {
        type: comment.media.type,
        url: comment.media.url,
      } : null,
      isSpoiler: Boolean(comment.isSpoiler),
      isMediaMasked: false,
    };
  }

  public async deleteComment(commentId: string, userId: string): Promise<boolean> {
    let deletedComment: any = await this.discussionRepository.deleteComment(commentId, userId);
    if (!deletedComment) {
      deletedComment = await this.discussionRepository.deleteMovieComment(commentId, userId);
    }
    if (!deletedComment) {
      return false;
    }

    // If deleted comment had Cloudinary media, trigger non-blocking async cleanup
    if (deletedComment.media?.provider === 'cloudinary') {
      await this.discussionRepository.markMediaForDeletion(commentId);
      const mediaDoc = await this.discussionRepository.findMediaByCommentId(commentId);
      if (mediaDoc && mediaDoc.publicId) {
        setImmediate(async () => {
          try {
            await cloudinary.uploader.destroy(mediaDoc.publicId!);
            await this.discussionRepository.markMediaDeleted(mediaDoc._id.toString());
          } catch (err) {
            console.error("[CloudinaryDelete] Non-blocking destroy error:", err);
          }
        });
      }
    }

    return true;
  }

  public async processPendingMediaCleanup(): Promise<{ cleanedDeletions: number; cleanedOrphans: number }> {
    let cleanedDeletions = 0;
    let cleanedOrphans = 0;

    // 1. Retry pending deletions
    const pendingDeletions = await this.discussionRepository.findPendingDeletionMedia();
    for (const item of pendingDeletions) {
      if (item.provider === 'cloudinary' && item.publicId) {
        try {
          await cloudinary.uploader.destroy(item.publicId);
          await this.discussionRepository.markMediaDeleted(item._id.toString());
          cleanedDeletions++;
        } catch (err) {
          console.error("[MediaCleanup] Retry destroy failed:", err);
        }
      }
    }

    // 2. Clean orphan pending uploads older than 24h
    const orphans = await this.discussionRepository.findOrphanMedia(24);
    for (const orphan of orphans) {
      if (orphan.provider === 'cloudinary' && orphan.publicId) {
        try {
          await cloudinary.uploader.destroy(orphan.publicId);
        } catch (err) {
          console.error("[MediaCleanup] Orphan destroy failed:", err);
        }
      }
      await this.discussionRepository.markMediaDeleted(orphan._id.toString());
      cleanedOrphans++;
    }

    return { cleanedDeletions, cleanedOrphans };
  }

  public async toggleLike(
    commentId: string,
    userId: string
  ): Promise<{ isLiked: boolean; likeCount: number }> {
    return this.discussionRepository.toggleLike(commentId, userId);
  }

  private async isMovieWatchedByUser(
    userId: string | undefined,
    tmdbId: string
  ): Promise<boolean> {
    if (!userId) return false;

    const tracked = await TrackedItemModel.findOne({
      user: userId,
      tmdbId: String(tmdbId),
      mediaType: "movie",
    }).lean();

    return Boolean(tracked);
  }

  private async getCanonicalMovieCast(
    tmdbId: string
  ): Promise<Array<{ id: number; name: string; actorName: string; profilePath: string | null }>> {
    try {
      const movieDetails = await this.tmdbCacheService.getCachedTitleDetails("movie", String(tmdbId));
      const castList = movieDetails?.credits?.cast;
      if (!castList || !Array.isArray(castList)) return [];

      return castList.map((member: any) => ({
        id: member.id,
        name: member.character || member.name,
        actorName: member.name || member.original_name,
        profilePath: member.profile_path || null,
      }));
    } catch (err) {
      console.warn("[DiscussionService] Failed to load movie cast for validation:", err);
      return [];
    }
  }

  public async getMovieSummary(
    tmdbId: string,
    userId?: string
  ): Promise<MovieSummaryDTO> {
    const [rawSummary, totalComments, isWatched, userReaction, canonicalCast] = await Promise.all([
      this.discussionRepository.getMovieReactionSummary(tmdbId),
      this.discussionRepository.getMovieCommentCount(tmdbId),
      this.isMovieWatchedByUser(userId, tmdbId),
      userId ? this.discussionRepository.getUserMovieReaction(userId, tmdbId) : Promise.resolve(null),
      this.getCanonicalMovieCast(tmdbId),
    ]);

    const castLookup = new Map(canonicalCast.map((c) => [c.id, c]));
    const totalMvpVotes = rawSummary.mvpVotes.reduce((acc, curr) => acc + curr.count, 0);

    const mvpLeaderboard = rawSummary.mvpVotes.map((vote) => {
      const canonical = castLookup.get(vote.characterId);
      return {
        characterId: vote.characterId,
        name: canonical?.name || "Unknown Character",
        actorName: canonical?.actorName || "",
        profilePath: canonical?.profilePath || null,
        voteCount: vote.count,
        percentage: totalMvpVotes > 0 ? Math.round((vote.count / totalMvpVotes) * 100) : 0,
      };
    });

    return {
      ratingStats: rawSummary.ratingStats,
      mvpLeaderboard,
      totalComments,
      userReaction: userReaction ? {
        characterId: userReaction.characterId ?? null,
        rating: userReaction.rating ?? null,
        platform: userReaction.platform ?? null,
      } : null,
      isWatchedByMe: isWatched,
    };
  }

  public async getMovieComments(
    tmdbId: string,
    query: GetCommentsQueryDTO,
    userId?: string
  ): Promise<{
    comments: Array<any>;
    nextCursor: string | null;
    hasMore: boolean;
    isWatchedByMe: boolean;
  }> {
    const isWatched = await this.isMovieWatchedByUser(userId, tmdbId);
    const result = await this.discussionRepository.getMovieComments(tmdbId, query);

    const commentIds = result.comments.map((c) => String(c._id));
    const [likedSet, actualCounts] = await Promise.all([
      userId ? this.discussionRepository.getUserLikedCommentIds(commentIds, userId) : Promise.resolve(new Set<string>()),
      this.discussionRepository.getActualLikeCounts(commentIds),
    ]);

    const sanitizedComments = result.comments.map((c) => {
      const likeCount = actualCounts.has(String(c._id)) ? actualCounts.get(String(c._id))! : c.likeCount;
      const isSpoiler = Boolean(c.isSpoiler);
      const isMediaMasked = isSpoiler && !isWatched && !query.reveal;

      return {
        _id: c._id,
        user: c.user,
        content: isSpoiler && !isWatched && !query.reveal ? null : c.content,
        media: isMediaMasked
          ? (c.media ? { type: c.media.type, url: "" } : null)
          : c.media,
        isSpoiler,
        isMediaMasked,
        likeCount,
        isLikedByMe: likedSet.has(String(c._id)),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    return {
      comments: sanitizedComments,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      isWatchedByMe: isWatched,
    };
  }

  public async upsertMovieReaction(
    userId: string,
    tmdbId: string,
    dto: UpsertMovieReactionDTO
  ): Promise<IMovieReaction> {
    // Validation 1: Rating range
    if (dto.rating !== undefined && dto.rating !== null) {
      const r = Number(dto.rating);
      if (isNaN(r) || r < 1 || r > 10) {
        throw new Error("Rating must be a number between 1 and 10");
      }
      dto.rating = Math.round(r);
    }

    // Validation 2: Canonical Character ID verification
    if (dto.characterId !== undefined && dto.characterId !== null) {
      const cId = Number(dto.characterId);
      const cast = await this.getCanonicalMovieCast(tmdbId);
      const isValidCharacter = cast.some((member) => member.id === cId);

      if (!isValidCharacter && cast.length > 0) {
        throw new Error("Selected character does not belong to this movie");
      }
      dto.characterId = cId;
    }

    // Validation 3: Platform sanitization
    if (dto.platform !== undefined && dto.platform !== null) {
      dto.platform = String(dto.platform).trim().slice(0, 100);
      if (dto.platform.length === 0) dto.platform = null;
    }

    return this.discussionRepository.upsertMovieReaction(userId, tmdbId, dto);
  }

  public async createMovieComment(
    userId: string,
    tmdbId: string,
    dto: CreateCommentDTO
  ): Promise<IMovieComment> {
    const hasContent = dto.content && dto.content.trim().length > 0;
    const hasMedia = dto.mediaId && dto.mediaId.trim().length > 0;

    if (!hasContent && !hasMedia) {
      throw new Error("A comment must have either text content or an attached media item");
    }

    if (dto.content && dto.content.length > 2000) {
      throw new Error("Comment text cannot exceed 2000 characters");
    }

    return this.discussionRepository.createMovieComment(userId, tmdbId, dto);
  }
}
