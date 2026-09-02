import { injectable } from "inversify";
import { Types } from "mongoose";
import { IDiscussionRepository } from "./discussion.repository.interface.js";
import { EpisodeReactionModel, IEpisodeReaction } from "../models/episodeReaction.schema.js";
import { EpisodeCommentModel, IEpisodeComment } from "../models/episodeComment.schema.js";
import { CommentLikeModel } from "../models/commentLike.schema.js";
import { UpsertReactionDTO, CreateCommentDTO, GetCommentsQueryDTO } from "../dtos/discussion.dto.js";

@injectable()
export class DiscussionRepository implements IDiscussionRepository {
  public async upsertReaction(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number,
    dto: UpsertReactionDTO
  ): Promise<IEpisodeReaction> {
    const filter = {
      user: new Types.ObjectId(userId),
      tmdbId: String(tmdbId),
      season: Number(season),
      episode: Number(episode),
    };

    const update: any = {};
    if (dto.emotion !== undefined) update.emotion = dto.emotion;
    if (dto.characterId !== undefined) update.characterId = dto.characterId;
    if (dto.rating !== undefined) update.rating = dto.rating;

    const reaction = await EpisodeReactionModel.findOneAndUpdate(
      filter,
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return reaction;
  }

  public async getUserReaction(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number
  ): Promise<IEpisodeReaction | null> {
    return EpisodeReactionModel.findOne({
      user: new Types.ObjectId(userId),
      tmdbId: String(tmdbId),
      season: Number(season),
      episode: Number(episode),
    }).lean();
  }

  public async getEpisodeReactionSummary(
    tmdbId: string,
    season: number,
    episode: number
  ): Promise<{
    emotionStats: Record<string, number>;
    totalEmotions: number;
    ratingStats: { averageRating: number | null; totalRatings: number };
    mvpVotes: Array<{ characterId: number; count: number }>;
  }> {
    const match = {
      tmdbId: String(tmdbId),
      season: Number(season),
      episode: Number(episode),
    };

    const [emotionAgg, ratingAgg, mvpAgg] = await Promise.all([
      // Emotion Breakdown
      EpisodeReactionModel.aggregate([
        { $match: { ...match, emotion: { $ne: null } } },
        { $group: { _id: "$emotion", count: { $sum: 1 } } },
      ]),
      // Rating Stats
      EpisodeReactionModel.aggregate([
        { $match: { ...match, rating: { $ne: null } } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalRatings: { $sum: 1 },
          },
        },
      ]),
      // MVP Votes
      EpisodeReactionModel.aggregate([
        { $match: { ...match, characterId: { $ne: null } } },
        { $group: { _id: "$characterId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const emotionStats: Record<string, number> = {
      mindblown: 0,
      loved: 0,
      funny: 0,
      epic: 0,
      tense: 0,
      shocked: 0,
      emotional: 0,
      confused: 0,
      angry: 0,
      boring: 0,
    };
    let totalEmotions = 0;
    for (const item of emotionAgg) {
      if (item._id && emotionStats[item._id] !== undefined) {
        emotionStats[item._id] = item.count;
        totalEmotions += item.count;
      }
    }

    const ratingStats = {
      averageRating: ratingAgg.length > 0 ? Math.round(ratingAgg[0].averageRating * 10) / 10 : null,
      totalRatings: ratingAgg.length > 0 ? ratingAgg[0].totalRatings : 0,
    };

    const mvpVotes = mvpAgg.map((m) => ({
      characterId: Number(m._id),
      count: m.count,
    }));

    return {
      emotionStats,
      totalEmotions,
      ratingStats,
      mvpVotes,
    };
  }

  public async createComment(
    userId: string,
    tmdbId: string,
    season: number,
    episode: number,
    dto: CreateCommentDTO
  ): Promise<IEpisodeComment> {
    const comment = await EpisodeCommentModel.create({
      user: new Types.ObjectId(userId),
      tmdbId: String(tmdbId),
      season: Number(season),
      episode: Number(episode),
      content: dto.content.trim(),
      isSpoiler: Boolean(dto.isSpoiler),
      likeCount: 0,
    });

    return comment.populate("user", "username name avatar profileImage");
  }

  public async deleteComment(commentId: string, userId: string): Promise<boolean> {
    const comment = await EpisodeCommentModel.findOneAndDelete({
      _id: new Types.ObjectId(commentId),
      user: new Types.ObjectId(userId),
    });

    if (comment) {
      // Clean up like records for deleted comment
      await CommentLikeModel.deleteMany({ commentId: new Types.ObjectId(commentId) });
      return true;
    }
    return false;
  }

  public async getCommentById(commentId: string): Promise<IEpisodeComment | null> {
    return EpisodeCommentModel.findById(commentId).populate("user", "username name avatar profileImage");
  }

  public async getComments(
    tmdbId: string,
    season: number,
    episode: number,
    options: GetCommentsQueryDTO
  ): Promise<{ comments: IEpisodeComment[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 50);
    const sort = options.sort === "newest" ? "newest" : "top";

    const baseQuery: any = {
      tmdbId: String(tmdbId),
      season: Number(season),
      episode: Number(episode),
    };

    // If hideSpoilers is true, deterministic filter excludes all spoiler comments
    if (options.hideSpoilers) {
      baseQuery.isSpoiler = false;
    }

    // Handle Cursor Decoding
    if (options.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(options.cursor, "base64").toString("utf-8"));
        if (sort === "newest" && decoded.createdAt && decoded._id) {
          const cursorDate = new Date(decoded.createdAt);
          const cursorId = new Types.ObjectId(decoded._id);
          baseQuery.$or = [
            { createdAt: { $lt: cursorDate } },
            { createdAt: cursorDate, _id: { $lt: cursorId } },
          ];
        } else if (sort === "top" && decoded.likeCount !== undefined && decoded._id) {
          const cursorLikes = Number(decoded.likeCount);
          const cursorId = new Types.ObjectId(decoded._id);
          baseQuery.$or = [
            { likeCount: { $lt: cursorLikes } },
            { likeCount: cursorLikes, _id: { $lt: cursorId } },
          ];
        }
      } catch (err) {
        console.warn("[DiscussionRepository] Failed to decode cursor:", err);
      }
    }

    // Sort definition
    const sortDef: any = sort === "newest"
      ? { createdAt: -1, _id: -1 }
      : { likeCount: -1, _id: -1 };

    // Query limit + 1 to check if there is a next page
    const items = await EpisodeCommentModel.find(baseQuery)
      .sort(sortDef)
      .limit(limit + 1)
      .populate("user", "username name avatar profileImage")
      .lean();

    const hasMore = items.length > limit;
    const comments = hasMore ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasMore && comments.length > 0) {
      const lastItem = comments[comments.length - 1];
      if (lastItem) {
        const cursorPayload =
          sort === "newest"
            ? { createdAt: (lastItem.createdAt as Date).toISOString(), _id: String(lastItem._id) }
            : { likeCount: lastItem.likeCount, _id: String(lastItem._id) };
        nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString("base64");
      }
    }

    return {
      comments: comments as IEpisodeComment[],
      nextCursor,
      hasMore,
    };
  }

  public async getUserLikedCommentIds(commentIds: string[], userId: string): Promise<Set<string>> {
    if (!userId || commentIds.length === 0) return new Set();

    const likes = await CommentLikeModel.find({
      userId: new Types.ObjectId(userId),
      commentId: { $in: commentIds.map((id) => new Types.ObjectId(id)) },
    }).lean();

    return new Set(likes.map((l) => String(l.commentId)));
  }

  public async getActualLikeCounts(commentIds: string[]): Promise<Map<string, number>> {
    if (commentIds.length === 0) return new Map();
    const oids = commentIds.map((id) => new Types.ObjectId(id));
    const counts = await CommentLikeModel.aggregate([
      { $match: { commentId: { $in: oids } } },
      { $group: { _id: "$commentId", count: { $sum: 1 } } },
    ]);
    const map = new Map<string, number>();
    counts.forEach((c: any) => map.set(String(c._id), c.count));
    return map;
  }

  public async toggleLike(
    commentId: string,
    userId: string
  ): Promise<{ isLiked: boolean; likeCount: number }> {
    const cId = new Types.ObjectId(commentId);
    const uId = new Types.ObjectId(userId);

    // 1. Check if like exists
    const existing = await CommentLikeModel.findOne({ commentId: cId, userId: uId });

    if (existing) {
      // Unlike: remove any likes for this user on this comment
      await CommentLikeModel.deleteMany({ commentId: cId, userId: uId });
    } else {
      // Like: create single like record (safely ignoring any race duplicates)
      try {
        await CommentLikeModel.create({ commentId: cId, userId: uId });
      } catch (err: any) {
        // Already exists due to duplicate key race condition
      }
    }

    // 2. Exactly synchronize likeCount with actual documents in CommentLikeModel
    const actualLikeCount = await CommentLikeModel.countDocuments({ commentId: cId });
    await EpisodeCommentModel.findByIdAndUpdate(cId, { $set: { likeCount: actualLikeCount } });

    return { isLiked: !existing, likeCount: actualLikeCount };
  }

  public async getCommentCount(tmdbId: string, season: number, episode: number): Promise<number> {
    return EpisodeCommentModel.countDocuments({
      tmdbId: String(tmdbId),
      season: Number(season),
      episode: Number(episode),
    });
  }
}
