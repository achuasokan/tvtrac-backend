export interface TvTimeImportItem {
  tvdbId?: string;
  imdbId?: string;
  title?: string;
  season: number;
  episode: number;
  watchedDate?: string;
}

export interface TvTimeMovieImportItem {
  tvdbId?: string;
  imdbId?: string;
  title?: string;
  year?: number;
  watchedDate?: string;
  userRating?: number;
}

export interface ImportListItemDTO {
  tvdbId?: string;
  imdbId?: string;
  title?: string;
  year?: number;
  mediaType?: 'movie' | 'tv';
  position: number;
}

export interface DetectedFile {
  name: string;
  type: 'shows' | 'movies' | 'lists' | 'list_csv' | 'mixed' | 'unsupported';
  itemCount: number;
  status: 'ready' | 'unsupported' | 'error';
  message?: string;
}

export interface ParsedListPayload {
  name: string;
  description?: string;
  totalItems: number;
  batches: Array<{
    name: string;
    description?: string;
    items: ImportListItemDTO[];
  }>;
}

export interface MultiFileParseResult {
  detectedFiles: DetectedFile[];
  episodes: {
    totalCount: number;
    showsCount: number;
    batches: TvTimeImportItem[][];
  };
  movies: {
    totalCount: number;
    batches: TvTimeMovieImportItem[][];
  };
  lists: {
    totalLists: number;
    totalItems: number;
    lists: ParsedListPayload[];
  };
  errorMessage?: string;
}

/**
 * Standard RFC 4180 compliant CSV parser.
 * Handles embedded commas, double quotes, and multi-line values.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i++; // Skip escaped quote
        } else {
          insideQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\r') {
        // Skip carriage return
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.length > 0 && currentRow.some((c) => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function parseValidDate(value?: any): string | undefined {
  if (!value) return undefined;
  const str = String(value).trim();
  if (!str) return undefined;

  const timestamp = Date.parse(str);
  if (isNaN(timestamp)) return undefined;

  return new Date(timestamp).toISOString();
}

function cleanId(val?: any): string | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim();
  if (!s || s === '-1' || s === '0') return undefined;
  return s;
}

function normalizeListName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function deriveSlugName(filename: string): string {
  let base = filename.replace(/\.csv$/i, '');
  base = base.replace(/^list[_\-\s]*/i, '');
  base = base.replace(/[_\-]+/g, ' ');
  return normalizeListName(base.toUpperCase());
}

export function normalizeHeader(h?: string): string {
  if (!h || typeof h !== 'string') return '';
  return h.toLowerCase().trim().replace(/[\s_\-\.]+/g, '');
}

export const ALIASES = {
  title: ['title', 'showname', 'show_name', 'series', 'seriesname', 'series_name', 'name', 'tvshowname', 'tv_show_name'],
  season: ['season', 'seasonnumber', 'season_number', 'seasonnum', 's'],
  episode: ['episode', 'episodenumber', 'episode_number', 'epnumber', 'ep_number', 'ep', 'e'],
  watchedAt: ['watchedat', 'watched_at', 'watcheddate', 'watched_date', 'watchdate', 'date', 'updatedat', 'updated_at', 'viewedat'],
  mediaType: ['mediatype', 'media_type', 'contenttype', 'kind'],
  actionType: ['type', 'action', 'event', 'status'],
  tvdbId: ['tvdbid', 'tvdb_id', 'thetvdbid', 'seriesid', 'id_tvdb', 'idtvdb'],
  imdbId: ['imdbid', 'imdb_id', 'id_imdb', 'idimdb'],
  tmdbId: ['tmdbid', 'tmdb_id', 'id_tmdb', 'idtmdb'],
  rating: ['rating', 'userrating', 'user_rating', 'score'],
  isWatched: ['iswatched', 'is_watched', 'watched'],
  year: ['year', 'releaseyear', 'release_year'],
  review: ['review', 'comment', 'notes'],
};

export function findHeaderIndex(headers?: (string | undefined)[], aliasList: string[] = []): number {
  if (!headers || !Array.isArray(headers)) return -1;
  const normalizedAliases = new Set(aliasList.map((a) => normalizeHeader(a)));
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (typeof h === 'string') {
      const norm = normalizeHeader(h);
      if (norm && normalizedAliases.has(norm)) {
        return i;
      }
    }
  }
  return -1;
}

export function isExplicitUnwatched(value?: any): boolean {
  if (value === undefined || value === null) return false;
  const s = String(value).trim().toLowerCase();
  return (
    s === 'false' ||
    s === '0' ||
    s === 'no' ||
    s === 'unwatched' ||
    s === 'f' ||
    s === 'n'
  );
}

export function parseRating(value?: any): number | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'null') return undefined;
  const num = Number(s);
  if (isNaN(num)) return undefined;
  if (num >= 1 && num <= 10) {
    return Math.round(num * 10) / 10;
  }
  return undefined;
}

export interface UnifiedCsvParseResult {
  episodes: TvTimeImportItem[];
  movies: TvTimeMovieImportItem[];
  ambiguousCount: number;
  error?: string;
}

export function parseUnifiedCsvContent(content: string, filename: string): UnifiedCsvParseResult {
  const episodes: TvTimeImportItem[] = [];
  const movies: TvTimeMovieImportItem[] = [];
  let ambiguousCount = 0;

  const trimmed = content.trim();
  const rows = parseCSV(trimmed);
  if (rows.length < 2) {
    return { episodes: [], movies: [], ambiguousCount: 0, error: `${filename} is empty or missing headers` };
  }

  const rawHeaders = rows[0] || [];
  const titleIdx = findHeaderIndex(rawHeaders, ALIASES.title);
  const seasonIdx = findHeaderIndex(rawHeaders, ALIASES.season);
  const episodeIdx = findHeaderIndex(rawHeaders, ALIASES.episode);
  const watchedAtIdx = findHeaderIndex(rawHeaders, ALIASES.watchedAt);
  const mediaTypeIdx = findHeaderIndex(rawHeaders, ALIASES.mediaType);
  const actionTypeIdx = findHeaderIndex(rawHeaders, ALIASES.actionType);
  const tvdbIdx = findHeaderIndex(rawHeaders, ALIASES.tvdbId);
  const imdbIdx = findHeaderIndex(rawHeaders, ALIASES.imdbId);
  const tmdbIdx = findHeaderIndex(rawHeaders, ALIASES.tmdbId);
  const ratingIdx = findHeaderIndex(rawHeaders, ALIASES.rating);
  const isWatchedIdx = findHeaderIndex(rawHeaders, ALIASES.isWatched);
  const yearIdx = findHeaderIndex(rawHeaders, ALIASES.year);

  if (titleIdx === -1 && tvdbIdx === -1 && imdbIdx === -1 && tmdbIdx === -1) {
    return { episodes: [], movies: [], ambiguousCount: 0, error: `Missing title or identifier column in ${filename}` };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    if (isWatchedIdx !== -1 && isExplicitUnwatched(row[isWatchedIdx])) {
      continue;
    }

    const title = titleIdx !== -1 ? row[titleIdx]?.trim() : undefined;
    const tvdbId = tvdbIdx !== -1 ? cleanId(row[tvdbIdx]) : undefined;
    const imdbId = imdbIdx !== -1 ? cleanId(row[imdbIdx]) : undefined;
    const tmdbId = tmdbIdx !== -1 ? cleanId(row[tmdbIdx]) : undefined;

    if (!title && !tvdbId && !imdbId && !tmdbId) {
      continue;
    }

    const seasonStr = seasonIdx !== -1 ? row[seasonIdx]?.trim() : undefined;
    const episodeStr = episodeIdx !== -1 ? row[episodeIdx]?.trim() : undefined;
    const hasSeason = seasonStr !== undefined && seasonStr !== '' && !isNaN(Number(seasonStr));
    const hasEpisode = episodeStr !== undefined && episodeStr !== '' && !isNaN(Number(episodeStr));
    const hasSeasonAndEpisode = hasSeason && hasEpisode;

    let rawMediaType: string | undefined = undefined;
    if (mediaTypeIdx !== -1 && row[mediaTypeIdx]) {
      rawMediaType = row[mediaTypeIdx].trim().toLowerCase();
    } else if (actionTypeIdx !== -1 && row[actionTypeIdx]) {
      const act = row[actionTypeIdx].trim().toLowerCase();
      if (['movie', 'film', 'episode', 'show', 'tv', 'series'].includes(act)) {
        rawMediaType = act;
      }
    }

    const watchedDate = watchedAtIdx !== -1 ? parseValidDate(row[watchedAtIdx]) : undefined;
    const userRating = ratingIdx !== -1 ? parseRating(row[ratingIdx]) : undefined;
    const rawYear = yearIdx !== -1 ? Number(row[yearIdx]) : undefined;
    const year = rawYear && !isNaN(rawYear) && rawYear > 1880 && rawYear < 2100 ? rawYear : undefined;

    const hasExplicitMovieEvidence = rawMediaType === 'movie' || rawMediaType === 'film';
    const hasExplicitEpisodeEvidence =
      rawMediaType === 'episode' || rawMediaType === 'show' || rawMediaType === 'tv' || rawMediaType === 'series';

    if (hasExplicitMovieEvidence) {
      movies.push({
        tvdbId,
        imdbId,
        title,
        year,
        watchedDate,
        userRating,
      });
      continue;
    }

    if (hasExplicitEpisodeEvidence) {
      if (hasSeasonAndEpisode) {
        episodes.push({
          tvdbId,
          imdbId,
          title,
          season: Number(seasonStr),
          episode: Number(episodeStr),
          watchedDate,
        });
      } else {
        ambiguousCount++;
      }
      continue;
    }

    if (hasSeasonAndEpisode) {
      episodes.push({
        tvdbId,
        imdbId,
        title,
        season: Number(seasonStr),
        episode: Number(episodeStr),
        watchedDate,
      });
      continue;
    }

    ambiguousCount++;
  }

  return { episodes, movies, ambiguousCount };
}

function parseShowsContent(content: string, filename: string): { episodes: TvTimeImportItem[]; error?: string } {
  const episodes: TvTimeImportItem[] = [];
  const trimmed = content.trim();

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      let showList: any[] = [];

      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && (parsed[0].seasons || parsed[0].episodes)) {
          showList = parsed;
        } else if (parsed.length > 0 && parsed[0].season !== undefined && parsed[0].episode !== undefined) {
          for (const item of parsed) {
            const season = Number(item.season ?? item.season_number);
            const episode = Number(item.episode ?? item.episode_number);
            if (isNaN(season) || isNaN(episode)) continue;
            if (item.is_watched === false || item.is_watched === 'false') continue;

            episodes.push({
              tvdbId: cleanId(item.tvdb_id || item.id?.tvdb),
              imdbId: cleanId(item.imdb_id || item.id?.imdb),
              title: item.title || item.show_name || item.name,
              season,
              episode,
              watchedDate: parseValidDate(item.watched_at || item.updated_at),
            });
          }
          return { episodes };
        } else {
          showList = parsed;
        }
      } else if (parsed.shows && Array.isArray(parsed.shows)) {
        showList = parsed.shows;
      } else if (parsed.tracked_shows && Array.isArray(parsed.tracked_shows)) {
        showList = parsed.tracked_shows;
      }

      for (const show of showList) {
        const tvdbId = cleanId(show.id?.tvdb || show.tvdb_id || show.thetvdb_id || show.series_id);
        const imdbId = cleanId(show.id?.imdb || show.imdb_id);
        const title = show.title || show.name || show.show_name || show.tv_show_name;

        if (Array.isArray(show.seasons)) {
          for (const season of show.seasons) {
            const seasonNum = Number(season.number ?? season.season_number ?? season.season ?? 0);
            if (Array.isArray(season.episodes)) {
              for (const ep of season.episodes) {
                if (ep.is_watched === false || ep.is_watched === 'false') continue;
                const epNum = Number(ep.number ?? ep.episode_number ?? ep.episode);
                if (isNaN(seasonNum) || isNaN(epNum)) continue;

                episodes.push({
                  tvdbId,
                  imdbId,
                  title,
                  season: seasonNum,
                  episode: epNum,
                  watchedDate: parseValidDate(ep.watched_at || ep.updated_at),
                });
              }
            }
          }
        } else if (Array.isArray(show.episodes)) {
          for (const ep of show.episodes) {
            if (ep.is_watched === false || ep.is_watched === 'false') continue;
            const seasonNum = Number(ep.season ?? ep.season_number ?? 1);
            const epNum = Number(ep.number ?? ep.episode_number ?? ep.episode);
            if (isNaN(seasonNum) || isNaN(epNum)) continue;

            episodes.push({
              tvdbId,
              imdbId,
              title,
              season: seasonNum,
              episode: epNum,
              watchedDate: parseValidDate(ep.watched_at || ep.updated_at),
            });
          }
        }
      }

      return { episodes };
    } catch (err: any) {
      return { episodes: [], error: `Invalid JSON in ${filename}: ${err?.message}` };
    }
  }

  const rows = parseCSV(trimmed);
  if (rows.length < 2) {
    return { episodes: [], error: `${filename} is empty or missing headers` };
  }

  const rawHeaders = rows[0] || [];
  const tvdbIdx = findHeaderIndex(rawHeaders, ALIASES.tvdbId);
  const imdbIdx = findHeaderIndex(rawHeaders, ALIASES.imdbId);
  const titleIdx = findHeaderIndex(rawHeaders, ALIASES.title);
  const seasonIdx = findHeaderIndex(rawHeaders, ALIASES.season);
  const episodeIdx = findHeaderIndex(rawHeaders, ALIASES.episode);
  const watchedAtIdx = findHeaderIndex(rawHeaders, ALIASES.watchedAt);
  const isWatchedIdx = findHeaderIndex(rawHeaders, ALIASES.isWatched);
  const mediaTypeIdx = findHeaderIndex(rawHeaders, ALIASES.mediaType);
  const actionTypeIdx = findHeaderIndex(rawHeaders, ALIASES.actionType);

  if (seasonIdx === -1 || episodeIdx === -1) {
    return { episodes: [], error: `Missing season or episode columns in ${filename}` };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    if (isWatchedIdx !== -1 && isExplicitUnwatched(row[isWatchedIdx])) {
      continue;
    }

    if (mediaTypeIdx !== -1 && row[mediaTypeIdx]) {
      const mt = row[mediaTypeIdx].toLowerCase().trim();
      if (mt === 'movie' || mt === 'film') {
        continue;
      }
    } else if (actionTypeIdx !== -1 && row[actionTypeIdx]) {
      const act = row[actionTypeIdx].toLowerCase().trim();
      if (act === 'movie' || act === 'film') {
        continue;
      }
    }

    const season = Number(row[seasonIdx]);
    const episode = Number(row[episodeIdx]);
    if (isNaN(season) || isNaN(episode)) continue;

    episodes.push({
      tvdbId: tvdbIdx !== -1 ? cleanId(row[tvdbIdx]) : undefined,
      imdbId: imdbIdx !== -1 ? cleanId(row[imdbIdx]) : undefined,
      title: titleIdx !== -1 ? row[titleIdx]?.trim() : undefined,
      season,
      episode,
      watchedDate: watchedAtIdx !== -1 ? parseValidDate(row[watchedAtIdx]) : undefined,
    });
  }

  return { episodes };
}

function parseMoviesContent(content: string, filename: string): { movies: TvTimeMovieImportItem[]; error?: string } {
  const movies: TvTimeMovieImportItem[] = [];
  const trimmed = content.trim();

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      let list: any[] = [];

      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed.movies && Array.isArray(parsed.movies)) {
        list = parsed.movies;
      } else if (parsed.tracked_movies && Array.isArray(parsed.tracked_movies)) {
        list = parsed.tracked_movies;
      }

      for (const item of list) {
        if (item.is_watched !== undefined && item.is_watched !== null) {
          if (item.is_watched === false || item.is_watched === 'false') {
            continue;
          }
        }

        const imdbId = cleanId(item.id?.imdb || item.imdb_id || (typeof item.id === 'string' && item.id.startsWith('tt') ? item.id : undefined));
        const tvdbId = cleanId(item.id?.tvdb || item.tvdb_id || item.movie_id);
        const title = item.title || item.name || item.movie_name;

        if (!imdbId && !tvdbId && !title) {
          continue;
        }

        let userRating: number | undefined = undefined;
        if (item.rating !== undefined && item.rating !== null && item.rating !== '') {
          const r = Number(item.rating);
          if (!isNaN(r) && r >= 1 && r <= 10) {
            userRating = Math.round(r);
          }
        }

        movies.push({
          imdbId,
          tvdbId,
          title: title ? String(title).trim() : undefined,
          watchedDate: parseValidDate(item.watched_at || item.watched_date),
          userRating,
        });
      }

      return { movies };
    } catch (err: any) {
      return { movies: [], error: `Invalid JSON in ${filename}: ${err?.message}` };
    }
  }

  const rows = parseCSV(trimmed);
  if (rows.length < 2) {
    return { movies: [], error: `${filename} is empty or missing headers` };
  }

  const rawHeaders = rows[0] || [];
  const headers = rawHeaders.map((h) => (h ? h.toLowerCase().replace(/[\s_-]/g, '') : ''));
  const imdbIdx = headers.findIndex((h) => ['imdbid'].includes(h));
  const tvdbIdx = headers.findIndex((h) => ['tvdbid', 'movieid'].includes(h));
  const titleIdx = headers.findIndex((h) => ['title', 'movietitle', 'name'].includes(h));
  const typeIdx = headers.findIndex((h) => ['type'].includes(h));
  const isWatchedIdx = headers.findIndex((h) => ['iswatched', 'watched'].includes(h));
  const watchedAtIdx = headers.findIndex((h) => ['watchedat', 'watcheddate'].includes(h));
  const ratingIdx = headers.findIndex((h) => ['rating', 'userrating'].includes(h));

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (typeIdx !== -1 && row[typeIdx] && row[typeIdx].toLowerCase() !== 'movie') {
      continue;
    }
    if (isWatchedIdx !== -1 && row[isWatchedIdx] && row[isWatchedIdx].toLowerCase() === 'false') {
      continue;
    }

    const imdbId = imdbIdx !== -1 ? cleanId(row[imdbIdx]) : undefined;
    const tvdbId = tvdbIdx !== -1 ? cleanId(row[tvdbIdx]) : undefined;
    const title = titleIdx !== -1 ? row[titleIdx]?.trim() : undefined;

    if (!imdbId && !tvdbId && !title) continue;

    let userRating: number | undefined = undefined;
    if (ratingIdx !== -1 && row[ratingIdx]) {
      const r = Number(row[ratingIdx]);
      if (!isNaN(r) && r >= 1 && r <= 10) {
        userRating = Math.round(r);
      }
    }

    movies.push({
      imdbId,
      tvdbId,
      title,
      watchedDate: watchedAtIdx !== -1 ? parseValidDate(row[watchedAtIdx]) : undefined,
      userRating,
    });
  }

  return { movies };
}

function parseListsJson(content: string, filename: string): {
  lists: Map<string, { description?: string; items: ImportListItemDTO[] }>;
  error?: string;
} {
  const result = new Map<string, { description?: string; items: ImportListItemDTO[] }>();
  const trimmed = content.trim();

  try {
    const parsed = JSON.parse(trimmed);
    let rawLists: any[] = [];

    if (Array.isArray(parsed)) {
      rawLists = parsed;
    } else if (parsed.lists && Array.isArray(parsed.lists)) {
      rawLists = parsed.lists;
    } else if (parsed.name) {
      rawLists = [parsed];
    }

    for (const rawList of rawLists) {
      const name = normalizeListName(rawList.name || 'Untitled List');
      const description = rawList.description ? String(rawList.description).trim() : undefined;
      const items: ImportListItemDTO[] = [];
      let currentPosition = 0;

      if (Array.isArray(rawList.items)) {
        for (const it of rawList.items) {
          let mediaType: 'movie' | 'tv' | undefined = undefined;
          const explicitType = String(it.media_type || it.type || '').toLowerCase().trim();
          if (explicitType === 'tv' || explicitType === 'show' || explicitType === 'series' || explicitType === 'episode') {
            mediaType = 'tv';
          } else if (explicitType === 'movie' || explicitType === 'film') {
            mediaType = 'movie';
          } else if (Array.isArray(it.seasons) || Array.isArray(it.episodes) || it.season !== undefined || it.episode !== undefined) {
            mediaType = 'tv';
          }

          const imdbId = cleanId(it.id?.imdb || it.imdb_id);
          const tvdbId = cleanId(it.id?.tvdb || it.tvdb_id);
          const title = it.title || it.name;
          const rawYear = Number(it.year || it.release_year || it.release_date?.slice?.(0, 4) || it.first_air_date?.slice?.(0, 4));
          const year = !isNaN(rawYear) && rawYear >= 1880 && rawYear <= 2100 ? rawYear : undefined;

          items.push({
            imdbId,
            tvdbId,
            title: title ? String(title).trim() : undefined,
            year,
            mediaType,
            position: currentPosition++,
          });
        }
      } else {
        if (Array.isArray(rawList.movies)) {
          for (const m of rawList.movies) {
            const imdbId = cleanId(m.id?.imdb || m.imdb_id);
            const tvdbId = cleanId(m.id?.tvdb || m.tvdb_id);
            const title = m.title || m.name;
            const rawYear = Number(m.year || m.release_year || m.release_date?.slice?.(0, 4));
            const year = !isNaN(rawYear) && rawYear >= 1880 && rawYear <= 2100 ? rawYear : undefined;

            items.push({
              imdbId,
              tvdbId,
              title: title ? String(title).trim() : undefined,
              year,
              mediaType: 'movie',
              position: currentPosition++,
            });
          }
        }
        if (Array.isArray(rawList.shows)) {
          for (const s of rawList.shows) {
            const imdbId = cleanId(s.id?.imdb || s.imdb_id);
            const tvdbId = cleanId(s.id?.tvdb || s.tvdb_id);
            const title = s.title || s.name;
            const rawYear = Number(s.year || s.release_year || s.first_air_date?.slice?.(0, 4));
            const year = !isNaN(rawYear) && rawYear >= 1880 && rawYear <= 2100 ? rawYear : undefined;

            items.push({
              imdbId,
              tvdbId,
              title: title ? String(title).trim() : undefined,
              year,
              mediaType: 'tv',
              position: currentPosition++,
            });
          }
        }
      }

      result.set(name, { description, items });
    }

    return { lists: result };
  } catch (err: any) {
    return { lists: result, error: `Invalid JSON in ${filename}: ${err?.message}` };
  }
}

function parseListCsv(content: string, filename: string): {
  listName: string;
  items: ImportListItemDTO[];
  error?: string;
} {
  const listName = deriveSlugName(filename);
  const items: ImportListItemDTO[] = [];
  const rows = parseCSV(content.trim());

  if (rows.length < 2) {
    return { listName, items, error: `${filename} is empty or missing headers` };
  }

  const rawHeaders = rows[0] || [];
  const imdbIdx = findHeaderIndex(rawHeaders, ALIASES.imdbId);
  const tvdbIdx = findHeaderIndex(rawHeaders, [...ALIASES.tvdbId, 'movieid', 'movie_id']);
  const titleIdx = findHeaderIndex(rawHeaders, ALIASES.title);
  const yearIdx = findHeaderIndex(rawHeaders, ALIASES.year);
  const typeIdx = findHeaderIndex(rawHeaders, [...ALIASES.mediaType, ...ALIASES.actionType]);
  const seasonIdx = findHeaderIndex(rawHeaders, ALIASES.season);
  const episodeIdx = findHeaderIndex(rawHeaders, ALIASES.episode);
  const isSpecialIdx = findHeaderIndex(rawHeaders, ['isspecial', 'is_special', 'special']);

  let currentPos = 0;
  const seenItems = new Map<string, ImportListItemDTO>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const imdbIdRaw = imdbIdx !== -1 ? cleanId(row[imdbIdx]) : undefined;
    const tvdbIdRaw = tvdbIdx !== -1 ? cleanId(row[tvdbIdx]) : undefined;
    const title = titleIdx !== -1 ? row[titleIdx]?.trim() : undefined;
    const rawYear = yearIdx !== -1 ? Number(row[yearIdx]) : undefined;
    const year = rawYear && !isNaN(rawYear) && rawYear >= 1880 && rawYear <= 2100 ? rawYear : undefined;

    if (!imdbIdRaw && !tvdbIdRaw && !title) continue;

    const hasSeason = seasonIdx !== -1 && row[seasonIdx] !== undefined && row[seasonIdx].trim() !== '' && !isNaN(Number(row[seasonIdx]));
    const hasEpisode = episodeIdx !== -1 && row[episodeIdx] !== undefined && row[episodeIdx].trim() !== '' && !isNaN(Number(row[episodeIdx]));
    const hasSpecial = isSpecialIdx !== -1 && row[isSpecialIdx] && row[isSpecialIdx].trim() !== '' && row[isSpecialIdx].toLowerCase() !== 'false';
    const hasEpisodeEvidence = hasSeason || hasEpisode || hasSpecial;

    let rawType: string | undefined = undefined;
    if (typeIdx !== -1 && row[typeIdx]) {
      rawType = row[typeIdx].toLowerCase().trim();
    }

    const isExplicitTvType = rawType ? ['episode', 'tv', 'show', 'series'].includes(rawType) : false;
    const isExplicitMovieType = rawType ? ['movie', 'film'].includes(rawType) : false;

    let mediaType: 'movie' | 'tv' | undefined = undefined;

    if (isExplicitMovieType && (hasSeason || hasEpisode)) {
      mediaType = undefined;
    } else if (isExplicitTvType || hasEpisodeEvidence) {
      mediaType = 'tv';
    } else if (isExplicitMovieType) {
      mediaType = 'movie';
    } else {
      mediaType = undefined;
    }

    const tvdbId = hasEpisodeEvidence || rawType === 'episode' ? undefined : tvdbIdRaw;
    const imdbId = imdbIdRaw;

    const normTitle = (title || '').toLowerCase().trim();
    const dedupKey = normTitle ? `${mediaType || 'unknown'}:${normTitle}:${year || ''}` : `${imdbId || ''}:${tvdbId || ''}`;

    if (dedupKey && seenItems.has(dedupKey)) {
      const existing = seenItems.get(dedupKey)!;
      if (!existing.imdbId && imdbId) existing.imdbId = imdbId;
      if (!existing.tvdbId && tvdbId) existing.tvdbId = tvdbId;
      if (!existing.year && year) existing.year = year;
      continue;
    }

    const newItem: ImportListItemDTO = {
      imdbId,
      tvdbId,
      title,
      year,
      mediaType,
      position: currentPos++,
    };

    if (dedupKey) {
      seenItems.set(dedupKey, newItem);
    }
    items.push(newItem);
  }

  return { listName, items };
}

export function parseTvTimeExportBundle(files: Array<{ name: string; content: string }>): MultiFileParseResult {
  const detectedFiles: DetectedFile[] = [];
  const allEpisodes: TvTimeImportItem[] = [];
  const allMovies: TvTimeMovieImportItem[] = [];

  const listsMap = new Map<string, { description?: string; items: ImportListItemDTO[] }>();

  for (const file of files) {
    const lowerName = file.name.toLowerCase();

    if (
      lowerName === 'activity_history.csv' ||
      lowerName.startsWith('favorites.') ||
      lowerName.includes('activity_history')
    ) {
      detectedFiles.push({
        name: file.name,
        type: 'unsupported',
        itemCount: 0,
        status: 'unsupported',
        message: 'Not supported yet (activity history / favorites reserved for future release)',
      });
      continue;
    }

    if (lowerName === 'lists.json') {
      const res = parseListsJson(file.content, file.name);
      if (res.error) {
        detectedFiles.push({
          name: file.name,
          type: 'lists',
          itemCount: 0,
          status: 'error',
          message: res.error,
        });
      } else {
        let totalItemsInFile = 0;
        res.lists.forEach((list, name) => {
          listsMap.set(name, list);
          totalItemsInFile += list.items.length;
        });
        detectedFiles.push({
          name: file.name,
          type: 'lists',
          itemCount: totalItemsInFile,
          status: 'ready',
        });
      }
      continue;
    }

    if (lowerName.startsWith('list_') && lowerName.endsWith('.csv')) {
      const res = parseListCsv(file.content, file.name);
      if (res.error) {
        detectedFiles.push({
          name: file.name,
          type: 'list_csv',
          itemCount: 0,
          status: 'error',
          message: res.error,
        });
      } else {
        const existingList = listsMap.get(res.listName);
        if (existingList) {
          const existingKeys = new Set(
            existingList.items.map((it) => `${it.imdbId || ''}:${it.tvdbId || ''}:${it.title?.toLowerCase() || ''}`)
          );
          let appendCount = 0;
          let nextPosition = existingList.items.length;

          for (const csvItem of res.items) {
            const key = `${csvItem.mediaType || ''}:${csvItem.imdbId || ''}:${csvItem.tvdbId || ''}:${csvItem.title?.toLowerCase().trim() || ''}`;
            const csvNormTitle = csvItem.title ? csvItem.title.toLowerCase().trim() : '';
            const existingItem = existingList.items.find(
              (it) =>
                (csvItem.imdbId && it.imdbId === csvItem.imdbId) ||
                (csvItem.tvdbId && it.tvdbId === csvItem.tvdbId) ||
                (csvNormTitle && it.title && csvNormTitle === it.title.toLowerCase().trim() && (!csvItem.mediaType || !it.mediaType || csvItem.mediaType === it.mediaType))
            );

            if (existingItem) {
              if (!existingItem.mediaType && csvItem.mediaType) {
                existingItem.mediaType = csvItem.mediaType;
              } else if (csvItem.mediaType && existingItem.mediaType !== csvItem.mediaType) {
                existingItem.mediaType = csvItem.mediaType;
              }
              if (!existingItem.imdbId && csvItem.imdbId) existingItem.imdbId = csvItem.imdbId;
              if (!existingItem.tvdbId && csvItem.tvdbId) existingItem.tvdbId = csvItem.tvdbId;
            } else if (!existingKeys.has(key)) {
              existingKeys.add(key);
              existingList.items.push({
                ...csvItem,
                position: nextPosition++,
              });
              appendCount++;
            }
          }

          detectedFiles.push({
            name: file.name,
            type: 'list_csv',
            itemCount: res.items.length,
            status: 'ready',
            message: `Merged with list "${res.listName}" (+${appendCount} additional items)`,
          });
        } else {
          listsMap.set(res.listName, { items: res.items });
          detectedFiles.push({
            name: file.name,
            type: 'list_csv',
            itemCount: res.items.length,
            status: 'ready',
          });
        }
      }
      continue;
    }

    if (lowerName === 'movies.json' || lowerName === 'movies.csv') {
      const res = parseMoviesContent(file.content, file.name);
      if (res.error) {
        detectedFiles.push({
          name: file.name,
          type: 'movies',
          itemCount: 0,
          status: 'error',
          message: res.error,
        });
      } else {
        allMovies.push(...res.movies);
        detectedFiles.push({
          name: file.name,
          type: 'movies',
          itemCount: res.movies.length,
          status: 'ready',
        });
      }
      continue;
    }

    if (lowerName === 'shows.json' || lowerName === 'shows.csv') {
      const res = parseShowsContent(file.content, file.name);
      if (res.error) {
        detectedFiles.push({
          name: file.name,
          type: 'shows',
          itemCount: 0,
          status: 'error',
          message: res.error,
        });
      } else {
        allEpisodes.push(...res.episodes);
        detectedFiles.push({
          name: file.name,
          type: 'shows',
          itemCount: res.episodes.length,
          status: 'ready',
        });
      }
      continue;
    }

    const trimmed = file.content.trim();
    const isCsv = lowerName.endsWith('.csv') || (!trimmed.startsWith('[') && !trimmed.startsWith('{') && trimmed.includes(','));

    if (isCsv) {
      const firstLine = trimmed.split(/\r?\n/)[0] || '';
      const headerCells = parseCSV(firstLine)[0] || [];

      const hasSeasonAlias = findHeaderIndex(headerCells, ALIASES.season) !== -1;
      const hasEpisodeAlias = findHeaderIndex(headerCells, ALIASES.episode) !== -1;
      const hasMediaTypeAlias = findHeaderIndex(headerCells, ALIASES.mediaType) !== -1;
      const hasTitleAlias = findHeaderIndex(headerCells, ALIASES.title) !== -1;
      const hasIdAlias =
        findHeaderIndex(headerCells, ALIASES.tvdbId) !== -1 ||
        findHeaderIndex(headerCells, ALIASES.imdbId) !== -1 ||
        findHeaderIndex(headerCells, ALIASES.tmdbId) !== -1;

      const hasListNameAlias = findHeaderIndex(headerCells, ['listname', 'list_name']) !== -1;
      if (hasListNameAlias) {
        const res = parseListCsv(file.content, file.name);
        if (res.error) {
          detectedFiles.push({
            name: file.name,
            type: 'list_csv',
            itemCount: 0,
            status: 'error',
            message: res.error,
          });
        } else {
          listsMap.set(res.listName, { items: res.items });
          detectedFiles.push({
            name: file.name,
            type: 'list_csv',
            itemCount: res.items.length,
            status: 'ready',
          });
        }
        continue;
      }

      if (
        (hasSeasonAlias && hasEpisodeAlias) ||
        (hasMediaTypeAlias && hasTitleAlias) ||
        (hasTitleAlias && (hasSeasonAlias || hasEpisodeAlias)) ||
        (hasIdAlias && (hasSeasonAlias || hasEpisodeAlias))
      ) {
        const res = parseUnifiedCsvContent(file.content, file.name);
        if (res.error) {
          detectedFiles.push({
            name: file.name,
            type: 'mixed',
            itemCount: 0,
            status: 'error',
            message: res.error,
          });
        } else {
          allEpisodes.push(...res.episodes);
          allMovies.push(...res.movies);
          const totalItems = res.episodes.length + res.movies.length;
          let detectedType: 'shows' | 'movies' | 'mixed' = 'shows';
          if (res.episodes.length > 0 && res.movies.length > 0) {
            detectedType = 'mixed';
          } else if (res.movies.length > 0) {
            detectedType = 'movies';
          }

          if (totalItems > 0) {
            detectedFiles.push({
              name: file.name,
              type: detectedType,
              itemCount: totalItems,
              status: 'ready',
              message: res.ambiguousCount > 0 ? `${res.ambiguousCount} ambiguous row(s) skipped` : undefined,
            });
          } else {
            detectedFiles.push({
              name: file.name,
              type: detectedType,
              itemCount: 0,
              status: 'unsupported',
              message:
                res.ambiguousCount > 0
                  ? `All ${res.ambiguousCount} row(s) were ambiguous (missing media_type or season/episode numbers)`
                  : 'No valid records found in file',
            });
          }
        }
        continue;
      }
    }

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      if (trimmed.includes('"seasons"') || trimmed.includes('"episodes"')) {
        const res = parseShowsContent(file.content, file.name);
        allEpisodes.push(...res.episodes);
        detectedFiles.push({
          name: file.name,
          type: 'shows',
          itemCount: res.episodes.length,
          status: 'ready',
        });
        continue;
      } else if (trimmed.includes('"movies"') || trimmed.includes('movie_results')) {
        const res = parseMoviesContent(file.content, file.name);
        allMovies.push(...res.movies);
        detectedFiles.push({
          name: file.name,
          type: 'movies',
          itemCount: res.movies.length,
          status: 'ready',
        });
        continue;
      }
    }

    if (isCsv) {
      const res = parseUnifiedCsvContent(file.content, file.name);
      if (!res.error && (res.episodes.length > 0 || res.movies.length > 0)) {
        allEpisodes.push(...res.episodes);
        allMovies.push(...res.movies);
        const totalItems = res.episodes.length + res.movies.length;
        const detectedType =
          res.episodes.length > 0 && res.movies.length > 0 ? 'mixed' : res.movies.length > 0 ? 'movies' : 'shows';
        detectedFiles.push({
          name: file.name,
          type: detectedType,
          itemCount: totalItems,
          status: 'ready',
        });
        continue;
      }
    }

    detectedFiles.push({
      name: file.name,
      type: 'unsupported',
      itemCount: 0,
      status: 'unsupported',
      message: 'Unrecognized file format or structure',
    });
  }

  const deduplicatedEpisodes: TvTimeImportItem[] = [];
  const seenEpisodeKeys = new Set<string>();
  const showsSet = new Set<string>();

  for (const ep of allEpisodes) {
    const key = `${ep.tvdbId || ep.title}:${ep.season}:${ep.episode}`;
    if (!seenEpisodeKeys.has(key)) {
      seenEpisodeKeys.add(key);
      deduplicatedEpisodes.push(ep);
      if (ep.tvdbId || ep.title) {
        showsSet.add(ep.tvdbId || ep.title!);
      }
    }
  }

  const deduplicatedMovies: TvTimeMovieImportItem[] = [];
  const seenMovieKeys = new Set<string>();

  for (const m of allMovies) {
    const key = `${m.imdbId || m.tvdbId || m.title?.toLowerCase()}`;
    if (!seenMovieKeys.has(key)) {
      seenMovieKeys.add(key);
      deduplicatedMovies.push(m);
    }
  }

  const episodeBatches: TvTimeImportItem[][] = [];
  const BATCH_SIZE = 20;
  for (let i = 0; i < deduplicatedEpisodes.length; i += BATCH_SIZE) {
    episodeBatches.push(deduplicatedEpisodes.slice(i, i + BATCH_SIZE));
  }

  const movieBatches: TvTimeMovieImportItem[][] = [];
  for (let i = 0; i < deduplicatedMovies.length; i += BATCH_SIZE) {
    movieBatches.push(deduplicatedMovies.slice(i, i + BATCH_SIZE));
  }

  const parsedLists: ParsedListPayload[] = [];
  let totalListItems = 0;

  listsMap.forEach((listData, listName) => {
    totalListItems += listData.items.length;
    const listBatches: Array<{ name: string; description?: string; items: ImportListItemDTO[] }> = [];

    for (let i = 0; i < listData.items.length; i += BATCH_SIZE) {
      listBatches.push({
        name: listName,
        description: listData.description,
        items: listData.items.slice(i, i + BATCH_SIZE),
      });
    }

    parsedLists.push({
      name: listName,
      description: listData.description,
      totalItems: listData.items.length,
      batches: listBatches,
    });
  });

  return {
    detectedFiles,
    episodes: {
      totalCount: deduplicatedEpisodes.length,
      showsCount: showsSet.size,
      batches: episodeBatches,
    },
    movies: {
      totalCount: deduplicatedMovies.length,
      batches: movieBatches,
    },
    lists: {
      totalLists: parsedLists.length,
      totalItems: totalListItems,
      lists: parsedLists,
    },
  };
}
