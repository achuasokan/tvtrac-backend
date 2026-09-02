import { inject, injectable } from "inversify";
import { TYPES } from "../../../di/types.js";
import { IDiscussionService } from "./discussion.service.interface.js";
import { IDiscussionRepository } from "../repositories/discussion.repository.interface.js";
import { TmdbCacheService } from "../../tmdb/services/tmdbCache.service.js";
import { TrackedItemModel } from "../../tracking/models/trackedItem.schema.js";
import { UpsertReactionDTO, CreateCommentDTO, GetCommentsQueryDTO, EpisodeSummaryDTO } from "../dtos/discussion.dto.js";
import { IEpisodeReaction } from "../models/episodeReaction.schema.js";
import { IEpisodeComment } from "../models/episodeComment.schema.js";

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
      // Server-side spoiler masking: if user is not authorized/opted-in, hide content
      const content = isSpoiler && !allowSpoilers ? null : c.content;
      const likeCount = actualCounts.get(String(c._id)) ?? 0;

      return {
        _id: String(c._id),
        user: c.user,
        content,
        isSpoiler,
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

    return this.discussionRepository.upsertReaction(userId, tmdbId, sNum, eNum, dto);
  }

  public async createComment(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number,
    dto: CreateCommentDTO
  ): Promise<IEpisodeComment> {
    if (!dto.content || !dto.content.trim()) {
      throw new Error("Comment content cannot be empty");
    }
    if (dto.content.trim().length > 2000) {
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

  public async deleteComment(commentId: string, userId: string): Promise<boolean> {
    return this.discussionRepository.deleteComment(commentId, userId);
  }

  public async toggleLike(
    commentId: string,
    userId: string
  ): Promise<{ isLiked: boolean; likeCount: number }> {
    return this.discussionRepository.toggleLike(commentId, userId);
  }
}
