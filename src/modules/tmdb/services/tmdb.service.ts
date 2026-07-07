import { injectable } from "inversify";
import axios from "axios";

@injectable()
export class TmdbService {
  private readonly baseUrl = "https://api.themoviedb.org/3";
  private readonly apiKey = process.env.TMDB_API_KEY;

  private async fetchFromTmdb(endpoint: string, queryParams: Record<string, string> = {}) {
    if (!this.apiKey) {
      throw new Error("TMDB API Key is missing");
    }

    let headers: Record<string, string> = {
      "Accept": "application/json"
    };

    const params: Record<string, string> = { ...queryParams };

    if (this.apiKey.startsWith("ey")) {
       headers["Authorization"] = `Bearer ${this.apiKey}`;
    } else {
       params["api_key"] = this.apiKey;
    }

    let retries = 3;
    while (retries > 0) {
      try {
        const response = await axios.get(`${this.baseUrl}${endpoint}`, {
          headers,
          params,
          timeout: 5000,
        });
        return response.data;
      } catch (error: any) {
        retries--;
        const isNetworkError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || !error.response;
        
        if (retries === 0 || !isNetworkError) {
          const errorMsg = error.response?.data?.status_message || error.message;
          throw new Error(`TMDB API Error: ${errorMsg}`);
        }
        
        // Wait 500ms before retrying
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  async getTrending() {
    return this.fetchFromTmdb("/trending/all/day", { language: "en-US" });
  }

  async getTrendingTv(page: string = "1") {
    return this.fetchFromTmdb("/trending/tv/day", { language: "en-US", page });
  }

  async getTrendingMovies(page: string = "1") {
    return this.fetchFromTmdb("/trending/movie/day", { language: "en-US", page });
  }

  async discoverByNetwork(providerId: string, page: string = "1", filterType: string = "tv") {
    let endpoint = "/discover/tv";
    const params: Record<string, string> = {
      with_watch_providers: providerId,
      watch_region: "US",
      language: "en-US",
      sort_by: "popularity.desc",
      page,
    };

    if (filterType === "movies") {
      endpoint = "/discover/movie";
    } else if (filterType === "animation") {
      params.with_genres = "16";
    } else if (filterType === "anime") {
      params.with_genres = "16";
      params.with_original_language = "ja";
    }

    return this.fetchFromTmdb(endpoint, params);
  }

  async discoverByGenreName(
    genreName: string, 
    page: string = "1", 
    type: string = "movie",
    sortBy: string = "popularity.desc",
    minRating?: string,
    yearFrom?: string,
    yearTo?: string,
    language?: string
  ) {
    // TMDB Genre ID mappings
    const genreMaps: Record<string, { movie?: string, tv?: string, company?: string }> = {
      "Action": { movie: "28", tv: "10759" }, // TV uses "Action & Adventure"
      "Comedy": { movie: "35", tv: "35" },
      "Sci-Fi": { movie: "878", tv: "10765" }, // TV uses "Sci-Fi & Fantasy"
      "Horror": { movie: "27", tv: "9648" }, // TMDB lacks TV Horror, using Mystery
      "Romance": { movie: "10749", tv: "18" }, // TMDB lacks TV Romance, using Drama
      "Drama": { movie: "18", tv: "18" },
      "Animation": { movie: "16", tv: "16" },
      "Documentary": { movie: "99", tv: "99" },
      "Marvel": { company: "420" }, // Marvel Studios
      "DC": { company: "429|9993|128064|173511" }, // DC Entertainment / DC Comics / DC Films / DC Studios
      "Disney": { company: "2" }, // Walt Disney Pictures
      "Pixar": { company: "3" }, // Pixar
      "Star Wars": { company: "1" }, // Lucasfilm
      "A24": { company: "41077" },
      "HBO": { company: "3268" },
      "James Bond": { company: "7576" }, // Eon Productions
      "Universal": { company: "33" },
      "WB": { company: "17|174" }
    };

    const map = genreMaps[genreName];
    if (!map) {
      throw new Error(`Genre '${genreName}' not recognized.`);
    }

    const endpoint = type === "tv" ? "/discover/tv" : "/discover/movie";
    
    let actualSortBy = sortBy;
    if (type === "tv") {
      if (actualSortBy.includes("primary_release_date")) {
        actualSortBy = actualSortBy.replace("primary_release_date", "first_air_date");
      }
      if (actualSortBy.includes("revenue")) {
        actualSortBy = "popularity.desc"; // TV shows don't have revenue sort
      }
    }

    const params: Record<string, string> = {
      language: "en-US",
      sort_by: actualSortBy,
      page
    };

    if (map.company) {
      params.with_companies = map.company;
    } else {
      params.with_genres = type === "tv" ? map.tv! : map.movie!;
    }

    if (minRating) {
      params["vote_average.gte"] = minRating;
      // Require at least some votes to avoid obscure titles
      params["vote_count.gte"] = "50";
    }

    if (yearFrom && yearTo && yearFrom === yearTo) {
      if (type === "tv") {
        params["first_air_date_year"] = yearFrom;
      } else {
        params["primary_release_year"] = yearFrom;
      }
    } else {
      if (type === "tv") {
        if (yearFrom) params["first_air_date.gte"] = `${yearFrom}-01-01`;
        if (yearTo) params["first_air_date.lte"] = `${yearTo}-12-31`;
      } else {
        if (yearFrom) params["primary_release_date.gte"] = `${yearFrom}-01-01`;
        if (yearTo) params["primary_release_date.lte"] = `${yearTo}-12-31`;
      }
    }

    if (language) {
      params["with_original_language"] = language;
    }

    return this.fetchFromTmdb(endpoint, params);
  }

  async search(query: string) {
    return this.fetchFromTmdb("/search/multi", {
      query,
      include_adult: "false",
      language: "en-US",
      page: "1",
    });
  }

  async getTitleDetails(mediaType: string, id: string) {
    if (mediaType !== "tv" && mediaType !== "movie") {
      throw new Error("Invalid media type");
    }
    return this.fetchFromTmdb(`/${mediaType}/${id}`, {
      append_to_response: "credits,videos,similar,watch/providers",
      language: "en-US",
    });
  }

  async getSeasonDetails(tvId: string, seasonNumber: string) {
    return this.fetchFromTmdb(`/tv/${tvId}/season/${seasonNumber}`, {
      language: "en-US",
    });
  }

  async getEpisodeDetails(tvId: string, seasonNumber: string, episodeNumber: string) {
    return this.fetchFromTmdb(`/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`, {
      language: "en-US",
      append_to_response: "credits,videos,images",
    });
  }

  async getPersonDetails(personId: string) {
    return this.fetchFromTmdb(`/person/${personId}`, {
      append_to_response: "combined_credits",
      language: "en-US",
    });
  }
}
