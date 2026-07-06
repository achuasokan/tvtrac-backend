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

  async discoverByNetwork(networkId: string, page: string = "1") {
    return this.fetchFromTmdb("/discover/tv", {
      with_networks: networkId,
      language: "en-US",
      sort_by: "popularity.desc",
      page,
    });
  }

  async search(query: string) {
    return this.fetchFromTmdb("/search/multi", {
      query,
      include_adult: "false",
      language: "en-US",
      page: "1",
    });
  }
}
