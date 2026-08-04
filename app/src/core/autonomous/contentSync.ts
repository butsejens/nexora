import { queryClient } from "@/lib/query-client";
import {
  getTrendingAll,
  getPopularMovies,
  getPopularTv,
  getTopRatedMovies,
  getTopRatedTv,
  getNowPlayingMovies,
} from "@/lib/tmdb";
import { buildAutonomousCategories } from "./categoryBuilder";
import { getCachedOrFetch, revalidateInBackground } from "./cacheManager";
import { logAutonomousEvent } from "./autonomousLogger";

const CONTENT_CACHE_KEY = "autonomous:content:v1";

type Payload = {
  trending: Awaited<ReturnType<typeof getTrendingAll>>;
  popularMovies: Awaited<ReturnType<typeof getPopularMovies>>;
  popularSeries: Awaited<ReturnType<typeof getPopularTv>>;
  topRatedMovies: Awaited<ReturnType<typeof getTopRatedMovies>>;
  topRatedSeries: Awaited<ReturnType<typeof getTopRatedTv>>;
  newReleases: Awaited<ReturnType<typeof getNowPlayingMovies>>;
};

async function fetchPayload(): Promise<Payload> {
  const [
    trending,
    popularMovies,
    popularSeries,
    topRatedMovies,
    topRatedSeries,
    newReleases,
  ] = await Promise.all([
    getTrendingAll(),
    getPopularMovies(),
    getPopularTv(),
    getTopRatedMovies(),
    getTopRatedTv(),
    getNowPlayingMovies(),
  ]);
  return {
    trending,
    popularMovies,
    popularSeries,
    topRatedMovies,
    topRatedSeries,
    newReleases,
  };
}

export async function syncAutonomousContent(): Promise<Payload> {
  const payload = await getCachedOrFetch<Payload>({
    key: CONTENT_CACHE_KEY,
    fetcher: fetchPayload,
  });
  void revalidateInBackground({ key: CONTENT_CACHE_KEY, fetcher: fetchPayload });
  return payload;
}

export async function prefetchAutonomousContent(): Promise<void> {
  try {
    const payload = await syncAutonomousContent();
    const categories = buildAutonomousCategories({
      trending: payload.trending,
      popular: [...payload.popularMovies, ...payload.popularSeries],
      "top-rated": [...payload.topRatedMovies, ...payload.topRatedSeries],
      "new-releases": payload.newReleases,
      action: payload.trending,
      drama: payload.topRatedMovies,
      comedy: payload.popularSeries,
      horror: payload.newReleases,
      "sci-fi": payload.topRatedSeries,
    });

    queryClient.setQueryData(["tmdb", "trending"], categories.trending);
    queryClient.setQueryData(["tmdb", "popular-movies"], payload.popularMovies);
    queryClient.setQueryData(["tmdb", "popular-tv"], payload.popularSeries);
    queryClient.setQueryData(["tmdb", "top-rated-movies"], payload.topRatedMovies);
    queryClient.setQueryData(["tmdb", "top-rated-tv"], payload.topRatedSeries);
    queryClient.setQueryData(["tmdb", "now-playing"], payload.newReleases);

    logAutonomousEvent("info", "content", "autonomous-prefetch-complete", {
      trending: categories.trending.length,
      popular: categories.popular.length,
    });
  } catch (error) {
    logAutonomousEvent("warn", "content", "autonomous-prefetch-failed", {
      error: String((error as any)?.message || error || "unknown"),
    });
  }
}

