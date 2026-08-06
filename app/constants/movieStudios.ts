/**
 * Curated real movie studios / production companies for the Studios tab.
 * IDs verified against the live TMDB /company/{id} and /discover/movie
 * (with_companies) endpoints.
 */
export type MovieStudio = {
  id: number;
  name: string;
  color1: string;
  color2: string;
};

export const MOVIE_STUDIOS: readonly MovieStudio[] = [
  { id: 420, name: "Marvel Studios", color1: "#ED1D24", color2: "#7A0000" },
  { id: 429, name: "DC", color1: "#0078F0", color2: "#00274D" },
  { id: 2, name: "Walt Disney Pictures", color1: "#1A237E", color2: "#0D1547" },
  { id: 3, name: "Pixar", color1: "#0077B6", color2: "#023E8A" },
  { id: 174, name: "Warner Bros. Pictures", color1: "#004C97", color2: "#001F3F" },
  { id: 33, name: "Universal Pictures", color1: "#2B2B2B", color2: "#0A0A0A" },
  { id: 4, name: "Paramount Pictures", color1: "#0B5FA5", color2: "#063A66" },
  { id: 34, name: "Sony Pictures", color1: "#3A3A3A", color2: "#101010" },
  { id: 25, name: "20th Century Studios", color1: "#1B1B3A", color2: "#000000" },
  { id: 1, name: "Lucasfilm", color1: "#8B6E2F", color2: "#4A3A16" },
  { id: 521, name: "DreamWorks Animation", color1: "#6A1B9A", color2: "#38006B" },
  { id: 923, name: "Legendary Pictures", color1: "#4A4A4A", color2: "#1E1E1E" },
  { id: 3172, name: "Blumhouse Productions", color1: "#7A0000", color2: "#2E0000" },
  { id: 41077, name: "A24", color1: "#111111", color2: "#000000" },
  { id: 6704, name: "Illumination", color1: "#E64A19", color2: "#BF360C" },
  { id: 10342, name: "Studio Ghibli", color1: "#2E7D32", color2: "#1B5E20" },
  { id: 178464, name: "Netflix", color1: "#E50914", color2: "#831010" },
  { id: 21, name: "Metro-Goldwyn-Mayer", color1: "#B8860B", color2: "#3A2E00" },
  { id: 12, name: "New Line Cinema", color1: "#00838F", color2: "#003D40" },
  { id: 14, name: "Miramax", color1: "#C9A227", color2: "#5A1A1A" },
  { id: 210099, name: "Amazon MGM Studios", color1: "#00A8E1", color2: "#003B4D" },
  { id: 10146, name: "Focus Features", color1: "#6A0DAD", color2: "#2E004F" },
  { id: 1632, name: "Lionsgate", color1: "#B71C1C", color2: "#3A0000" },
  { id: 56, name: "Amblin Entertainment", color1: "#1565C0", color2: "#0B3C71" },
  { id: 79, name: "Village Roadshow Pictures", color1: "#00695C", color2: "#00332D" },
  { id: 3287, name: "Screen Gems", color1: "#4A148C", color2: "#1A0033" },
  { id: 559, name: "TriStar Pictures", color1: "#37474F", color2: "#101820" },
  { id: 7295, name: "Relativity Media", color1: "#E65100", color2: "#3D1500" },
  { id: 491, name: "Summit Entertainment", color1: "#263238", color2: "#0D1418" },
  { id: 11461, name: "Bad Robot", color1: "#C62828", color2: "#300000" },
] as const;
