export interface Match {
  id: string;
  league: string;
  leagueLogo?: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: "live" | "upcoming" | "finished";
  minute?: number;
  startTime?: string;
  servers: Server[];
  sport: "football" | "basketball" | "tennis" | "formula1";
  heroGradient: string[];
}

export interface Server {
  id: string;
  name: string;
  quality: string;
  url: string;
}

export interface Channel {
  id: string;
  name: string;
  category: string;
  currentProgram?: string;
  nextProgram?: string;
  language: string;
  quality: string;
  url: string;
  color: string;
}

export interface Movie {
  id: string;
  title: string;
  year: number;
  rating: string;
  imdb: number;
  duration: string;
  genre: string[];
  synopsis: string;
  quality: "4K" | "HD" | "FHD";
  url: string;
  color: string;
  isNew?: boolean;
  isTrending?: boolean;
}

export interface Series {
  id: string;
  title: string;
  seasons: number;
  episodes: number;
  year: number;
  rating: string;
  imdb: number;
  genre: string[];
  synopsis: string;
  quality: "4K" | "HD" | "FHD";
  color: string;
  isNew?: boolean;
  isTrending?: boolean;
  currentSeason?: number;
  currentEpisode?: number;
}

export const LIVE_MATCHES: Match[] = [
  {
    id: "m1",
    league: "UEFA Champions League",
    homeTeam: "Real Madrid",
    awayTeam: "Man City",
    homeScore: 2,
    awayScore: 1,
    status: "live",
    minute: 67,
    servers: [
      { id: "s1", name: "BRAVO", quality: "4K", url: "https://example.com/stream/m1/bravo" },
      { id: "s2", name: "ALPHA", quality: "HD", url: "https://example.com/stream/m1/alpha" },
      { id: "s3", name: "ECHO", quality: "FHD", url: "https://example.com/stream/m1/echo" },
    ],
    sport: "football",
    heroGradient: ["#1a3a6b", "#0B0F17"],
  },
  {
    id: "m2",
    league: "NBA - Playoffs",
    homeTeam: "Lakers",
    awayTeam: "Warriors",
    homeScore: 98,
    awayScore: 105,
    status: "live",
    minute: 3,
    servers: [
      { id: "s1", name: "BRAVO", quality: "4K", url: "https://example.com/stream/m2/bravo" },
      { id: "s2", name: "ALPHA", quality: "HD", url: "https://example.com/stream/m2/alpha" },
      { id: "s3", name: "ECHO", quality: "FHD", url: "https://example.com/stream/m2/echo" },
    ],
    sport: "basketball",
    heroGradient: ["#4a1a1a", "#0B0F17"],
  },
  {
    id: "m3",
    league: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeScore: 1,
    awayScore: 0,
    status: "live",
    minute: 45,
    servers: [
      { id: "s1", name: "BRAVO", quality: "4K", url: "https://example.com/stream/m3/bravo" },
      { id: "s2", name: "ALPHA", quality: "HD", url: "https://example.com/stream/m3/alpha" },
      { id: "s3", name: "ECHO", quality: "FHD", url: "https://example.com/stream/m3/echo" },
    ],
    sport: "football",
    heroGradient: ["#1a4a2a", "#0B0F17"],
  },
  {
    id: "m4",
    league: "Roland Garros",
    homeTeam: "Djokovic",
    awayTeam: "Alcaraz",
    homeScore: 1,
    awayScore: 2,
    status: "live",
    servers: [
      { id: "s1", name: "BRAVO", quality: "4K", url: "https://example.com/stream/m4/bravo" },
      { id: "s2", name: "ALPHA", quality: "HD", url: "https://example.com/stream/m4/alpha" },
    ],
    sport: "tennis",
    heroGradient: ["#3a2a1a", "#0B0F17"],
  },
];

export const UPCOMING_MATCHES: Match[] = [
  {
    id: "u1",
    league: "La Liga",
    homeTeam: "Barcelona",
    awayTeam: "Atletico Madrid",
    homeScore: 0,
    awayScore: 0,
    status: "upcoming",
    startTime: "Today 21:00",
    servers: [
      { id: "s1", name: "BRAVO", quality: "4K", url: "" },
      { id: "s2", name: "ALPHA", quality: "HD", url: "" },
    ],
    sport: "football",
    heroGradient: ["#1a1a4a", "#0B0F17"],
  },
  {
    id: "u2",
    league: "Formula 1 - Monaco GP",
    homeTeam: "Verstappen",
    awayTeam: "Hamilton",
    homeScore: 0,
    awayScore: 0,
    status: "upcoming",
    startTime: "Sun 14:00",
    servers: [
      { id: "s1", name: "BRAVO", quality: "4K", url: "" },
      { id: "s2", name: "ALPHA", quality: "HD", url: "" },
    ],
    sport: "formula1",
    heroGradient: ["#2a1a4a", "#0B0F17"],
  },
  {
    id: "u3",
    league: "Bundesliga",
    homeTeam: "Bayern Munich",
    awayTeam: "Dortmund",
    homeScore: 0,
    awayScore: 0,
    status: "upcoming",
    startTime: "Sat 18:30",
    servers: [
      { id: "s1", name: "BRAVO", quality: "4K", url: "" },
      { id: "s2", name: "ALPHA", quality: "HD", url: "" },
    ],
    sport: "football",
    heroGradient: ["#3a2a1a", "#0B0F17"],
  },
  {
    id: "u4",
    league: "NBA - Regular Season",
    homeTeam: "Celtics",
    awayTeam: "Bucks",
    homeScore: 0,
    awayScore: 0,
    status: "upcoming",
    startTime: "Thu 20:00",
    servers: [
      { id: "s1", name: "BRAVO", quality: "4K", url: "" },
    ],
    sport: "basketball",
    heroGradient: ["#1a3a3a", "#0B0F17"],
  },
];

export const CHANNELS: Channel[] = [
  { id: "c1", name: "beIN Sports 1", category: "Sports", currentProgram: "Premier League", language: "EN", quality: "HD", url: "", color: "#1a4a2a" },
  { id: "c2", name: "Sky Sports", category: "Sports", currentProgram: "Cricket Live", language: "EN", quality: "FHD", url: "", color: "#1a3a6b" },
  { id: "c3", name: "ESPN", category: "Sports", currentProgram: "NBA Countdown", language: "EN", quality: "4K", url: "", color: "#4a1a1a" },
  { id: "c4", name: "Fox Sports", category: "Sports", currentProgram: "NFL Analysis", language: "EN", quality: "HD", url: "", color: "#3a2a1a" },
  { id: "c5", name: "CNN International", category: "News", currentProgram: "World News", language: "EN", quality: "HD", url: "", color: "#1a2a4a" },
  { id: "c6", name: "BBC World News", category: "News", currentProgram: "Breaking News", language: "EN", quality: "HD", url: "", color: "#0a2a4a" },
  { id: "c7", name: "Al Jazeera", category: "News", currentProgram: "Inside Story", language: "AR", quality: "FHD", url: "", color: "#2a3a1a" },
  { id: "c8", name: "Netflix Live", category: "Entertainment", currentProgram: "Live Events", language: "EN", quality: "4K", url: "", color: "#4a0a0a" },
  { id: "c9", name: "Cartoon Network", category: "Kids", currentProgram: "Tom & Jerry", language: "EN", quality: "HD", url: "", color: "#1a1a4a" },
  { id: "c10", name: "Discovery", category: "Entertainment", currentProgram: "Planet Earth", language: "EN", quality: "4K", url: "", color: "#1a3a2a" },
  { id: "c11", name: "Eurosport 1", category: "Sports", currentProgram: "Cycling Tour", language: "EN", quality: "HD", url: "", color: "#2a1a3a" },
  { id: "c12", name: "National Geo", category: "Entertainment", currentProgram: "Wild Africa", language: "EN", quality: "FHD", url: "", color: "#3a1a1a" },
];

export const MOVIES: Movie[] = [
  { id: "mov1", title: "Dune: Part Two", year: 2024, rating: "PG-13", imdb: 8.5, duration: "2h 46m", genre: ["Sci-Fi", "Action"], synopsis: "Paul Atreides unites with Chani and the Fremen while seeking revenge against those who destroyed his family.", quality: "4K", url: "", color: "#2a1a0a", isNew: true, isTrending: true },
  { id: "mov2", title: "Oppenheimer", year: 2023, rating: "R", imdb: 8.4, duration: "3h 1m", genre: ["Drama", "History"], synopsis: "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.", quality: "4K", url: "", color: "#1a1a1a", isTrending: true },
  { id: "mov3", title: "The Batman", year: 2022, rating: "PG-13", imdb: 7.9, duration: "2h 56m", genre: ["Action", "Crime"], synopsis: "Batman ventures into Gotham City's underworld when a sadistic killer leaves behind a trail of cryptic clues.", quality: "FHD", url: "", color: "#0a0a2a" },
  { id: "mov4", title: "Interstellar", year: 2014, rating: "PG-13", imdb: 8.6, duration: "2h 49m", genre: ["Sci-Fi", "Drama"], synopsis: "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.", quality: "4K", url: "", color: "#0a1a2a" },
  { id: "mov5", title: "John Wick 4", year: 2023, rating: "R", imdb: 7.7, duration: "2h 49m", genre: ["Action", "Thriller"], synopsis: "John Wick uncovers a path to defeating The High Table, but before he can earn his freedom, he must face a new enemy.", quality: "4K", url: "", color: "#1a0a0a", isTrending: true },
  { id: "mov6", title: "Avatar: The Way of Water", year: 2022, rating: "PG-13", imdb: 7.6, duration: "3h 12m", genre: ["Sci-Fi", "Action"], synopsis: "Jake Sully lives with his newfound family formed on the extrasolar moon Pandora.", quality: "4K", url: "", color: "#0a1a1a" },
  { id: "mov7", title: "Killers of the Flower Moon", year: 2023, rating: "R", imdb: 7.6, duration: "3h 26m", genre: ["Crime", "Drama"], synopsis: "Members of the Osage Nation are murdered under mysterious circumstances in the 1920s, sparking a major FBI investigation.", quality: "FHD", url: "", color: "#1a1a0a", isNew: true },
  { id: "mov8", title: "Mission: Impossible", year: 2023, rating: "PG-13", imdb: 7.7, duration: "2h 43m", genre: ["Action", "Thriller"], synopsis: "Ethan Hunt and his IMF team must track down a terrifying new weapon that threatens all of humanity.", quality: "4K", url: "", color: "#0a2a1a" },
];

export const SERIES: Series[] = [
  { id: "ser1", title: "House of the Dragon", seasons: 2, episodes: 18, year: 2022, rating: "TV-MA", imdb: 8.4, genre: ["Fantasy", "Drama"], synopsis: "Set 200 years before Game of Thrones, this prequel follows the Targaryen dynasty.", quality: "4K", color: "#2a0a0a", isTrending: true, currentSeason: 2, currentEpisode: 7 },
  { id: "ser2", title: "The Last of Us", seasons: 2, episodes: 16, year: 2023, rating: "TV-MA", imdb: 8.7, genre: ["Drama", "Thriller"], synopsis: "Joel and Ellie journey across post-apocalyptic America in search of safety.", quality: "4K", color: "#1a0a1a", isNew: true, isTrending: true },
  { id: "ser3", title: "Succession", seasons: 4, episodes: 39, year: 2018, rating: "TV-MA", imdb: 8.9, genre: ["Drama"], synopsis: "The Roy family controls one of the biggest media and entertainment conglomerates in the world.", quality: "FHD", color: "#0a0a1a" },
  { id: "ser4", title: "Breaking Bad", seasons: 5, episodes: 62, year: 2008, rating: "TV-MA", imdb: 9.5, genre: ["Crime", "Drama"], synopsis: "A high school chemistry teacher turned meth cook spirals into a life of crime.", quality: "FHD", color: "#1a1a0a" },
  { id: "ser5", title: "Severance", seasons: 2, episodes: 18, year: 2022, rating: "TV-MA", imdb: 8.7, genre: ["Sci-Fi", "Thriller"], synopsis: "A biotech company separates employees' work and personal memories.", quality: "4K", color: "#0a1a1a", isNew: true },
  { id: "ser6", title: "The Bear", seasons: 3, episodes: 28, year: 2022, rating: "TV-MA", imdb: 8.6, genre: ["Drama", "Comedy"], synopsis: "A young chef works to transform his family's Chicago sandwich shop.", quality: "FHD", color: "#1a0a0a", isTrending: true },
];

export const SPORT_ICONS: Record<string, string> = {
  football: "soccer",
  basketball: "basketball",
  tennis: "tennis",
  formula1: "car-sports",
};

export const MOVIE_GENRES = ["All", "Action", "Drama", "Sci-Fi", "Comedy", "Thriller", "Crime", "History"];
export const SERIES_GENRES = ["All", "Drama", "Sci-Fi", "Fantasy", "Thriller", "Crime", "Comedy"];
export const CHANNEL_CATEGORIES = ["All", "Sports", "News", "Entertainment", "Kids"];
