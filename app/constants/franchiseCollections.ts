/**
 * Curated TMDB franchise "collection" IDs used to power the Collectie tab
 * and the rotating FeaturedCollectionRail picks on the movies screen.
 * IDs verified against the live TMDB /collection/{id} endpoint.
 */
export type FranchiseCollection = {
  id: number;
  name: string;
};

export const FRANCHISE_COLLECTIONS: readonly FranchiseCollection[] = [
  { id: 86311, name: "The Avengers" },
  { id: 1241, name: "Harry Potter" },
  { id: 10, name: "Star Wars" },
  { id: 645, name: "James Bond" },
  { id: 119, name: "The Lord of the Rings" },
  { id: 263, name: "The Dark Knight" },
  { id: 9485, name: "Fast & Furious" },
  { id: 404609, name: "John Wick" },
  { id: 87359, name: "Mission: Impossible" },
  { id: 131635, name: "The Hunger Games" },
  { id: 328, name: "Jurassic Park" },
  { id: 748, name: "X-Men" },
  { id: 295, name: "Pirates of the Caribbean" },
  { id: 84, name: "Indiana Jones" },
  { id: 2344, name: "The Matrix" },
  { id: 8650, name: "Transformers" },
  { id: 556, name: "Spider-Man (Raimi)" },
  { id: 531241, name: "Spider-Man: Homecoming" },
  { id: 2602, name: "Scream" },
  { id: 656, name: "Saw" },
  { id: 10194, name: "Toy Story" },
  { id: 2150, name: "Shrek" },
  { id: 86066, name: "Despicable Me" },
  { id: 528, name: "Terminator" },
  { id: 8091, name: "Alien" },
  { id: 131292, name: "Iron Man" },
  { id: 131295, name: "Captain America" },
  { id: 131296, name: "Thor" },
  { id: 284433, name: "Guardians of the Galaxy" },
  { id: 529892, name: "Black Panther" },
  { id: 618529, name: "Doctor Strange" },
  { id: 422834, name: "Ant-Man" },
  { id: 448150, name: "Deadpool" },
  { id: 391860, name: "Kingsman" },
  { id: 313086, name: "The Conjuring" },
  { id: 1575, name: "Rocky" },
  { id: 5039, name: "Rambo" },
  { id: 304, name: "Ocean's" },
  { id: 121938, name: "The Hobbit" },
  { id: 173710, name: "Planet of the Apes" },
  { id: 8354, name: "Ice Age" },
  { id: 87118, name: "Cars" },
  { id: 137697, name: "Finding Nemo" },
  { id: 91361, name: "Halloween" },
  { id: 435259, name: "Fantastic Beasts" },
  { id: 86027, name: "Aladdin" },
  { id: 33514, name: "Twilight" },
  { id: 31562, name: "The Bourne" },
  { id: 14740, name: "Madagascar" },
  { id: 468222, name: "The Incredibles" },
  { id: 89137, name: "How to Train Your Dragon" },
  { id: 77816, name: "Kung Fu Panda" },
  { id: 8580, name: "The Karate Kid" },
  { id: 382685, name: "Now You See Me" },
  { id: 228446, name: "Insidious" },
  { id: 521226, name: "A Quiet Place" },
  { id: 8945, name: "Mad Max" },
  { id: 86055, name: "Men in Black" },
  { id: 283579, name: "Divergent" },
  { id: 295130, name: "The Maze Runner" },
  { id: 386382, name: "Frozen" },
  { id: 325470, name: "The Lego Movie" },
  { id: 1084247, name: "Zootopia" },
] as const;

export const FRANCHISE_COLLECTION_IDS: readonly number[] =
  FRANCHISE_COLLECTIONS.map((collection) => collection.id);
