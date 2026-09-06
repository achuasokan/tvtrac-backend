export interface UpsertReactionDTO {
  emotion?: 'mindblown' | 'loved' | 'funny' | 'epic' | 'tense' | 'shocked' | 'emotional' | 'confused' | 'angry' | 'boring' | null;
  characterId?: number | null;
  rating?: number | null;
  platform?: string | null;
}

export interface CreateCommentDTO {
  content?: string;
  isSpoiler?: boolean;
  mediaId?: string;
}

export interface AttachGifDTO {
  providerId: string;
}

export interface GetCommentsQueryDTO {
  sort?: 'top' | 'newest';
  cursor?: string;
  limit?: number;
  hideSpoilers?: boolean;
  reveal?: boolean;
}

export interface EpisodeSummaryDTO {
  emotionStats: {
    mindblown: number;
    loved: number;
    funny: number;
    epic: number;
    tense: number;
    shocked: number;
    emotional: number;
    confused: number;
    angry: number;
    boring: number;
    total: number;
  };
  ratingStats: {
    averageRating: number | null;
    totalRatings: number;
  };
  mvpLeaderboard: Array<{
    characterId: number;
    name: string;
    actorName: string;
    profilePath: string | null;
    voteCount: number;
    percentage: number;
  }>;
  totalComments: number;
  userReaction?: {
    emotion?: string | null;
    characterId?: number | null;
    rating?: number | null;
    platform?: string | null;
  } | null;
  isWatchedByMe: boolean;
}
