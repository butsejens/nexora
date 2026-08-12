/** CineLog — textes de l'interface en français. Clé = texte source anglais. */

export const FR: Record<string, string> = {
  // ── Navigation ─────────────────────────────────────────────────────────────
  Home: "Accueil",
  Movies: "Films",
  Series: "Séries",
  Search: "Recherche",
  Watchlist: "À voir",
  Profile: "Profil",
  Settings: "Paramètres",
  "Main navigation": "Navigation principale",
  "CineLog home": "Accueil CineLog",
  "Go back": "Retour",
  Guest: "Invité",

  // ── Accueil ────────────────────────────────────────────────────────────────
  "Featured today": "À la une aujourd'hui",
  "Trending Now": "Tendances du moment",
  "Popular Movies": "Films populaires",
  "Popular Series": "Séries populaires",
  "New Releases": "Nouveautés",
  "In cinemas now": "Au cinéma en ce moment",
  "Top Rated": "Les mieux notés",
  "Continue Watching": "Reprendre",
  "Pick up where you left off": "Reprenez où vous en étiez",
  "Recommended For You": "Recommandé pour vous",
  "Based on what you watch, rate and save":
    "D'après ce que vous regardez, notez et enregistrez",
  "Rate a few titles and this gets personal":
    "Notez quelques titres et cela devient personnel",
  "Because You Watched {{title}}": "Parce que vous avez vu {{title}}",
  "Browse by Genre": "Parcourir par genre",
  "See all": "Tout voir",
  "See all in {{title}}": "Tout voir dans {{title}}",
  "Scroll {{title}} left": "Faire défiler {{title}} vers la gauche",
  "Scroll {{title}} right": "Faire défiler {{title}} vers la droite",

  // ── Films & séries ─────────────────────────────────────────────────────────
  Popular: "Populaire",
  Trending: "Tendance",
  "Now Playing": "À l'affiche",
  Upcoming: "Prochainement",
  "New Series": "Nouvelles séries",
  Genres: "Genres",
  "All genres": "Tous les genres",
  "Movie collections": "Collections de films",
  "Movie genres": "Genres de films",
  "Series collections": "Collections de séries",
  "Series genres": "Genres de séries",
  "Browse every film": "Parcourir tous les films",
  "Browse every show": "Parcourir toutes les séries",
  "{{label}} films": "Films {{label}}",
  "{{label}} shows": "Séries {{label}}",
  "No films here yet": "Aucun film ici pour le moment",
  "No shows here yet": "Aucune série ici pour le moment",
  "Try another collection or genre to keep discovering.":
    "Essayez une autre collection ou un autre genre pour continuer à explorer.",
  Movie: "Film",

  // ── Page de détail ─────────────────────────────────────────────────────────
  Play: "Lecture",
  "Plays the best available stream": "Lit le meilleur flux disponible",
  "Now playing": "Lecture en cours",
  "Unable to open player": "Impossible d'ouvrir le lecteur",
  "No stream source is available.": "Aucune source de streaming n'est disponible.",
  "All stream providers failed to load.": "Tous les fournisseurs de streaming n'ont pas pu se charger.",
  Cancel: "Annuler",
  "Watch Trailer": "Voir la bande-annonce",
  "Plays the trailer inside CineLog": "Lit la bande-annonce dans CineLog",
  "Add to Watchlist": "Ajouter à ma liste",
  "In Watchlist": "Dans ma liste",
  "More info": "Plus d'infos",
  "Saves this title for later": "Enregistre ce titre pour plus tard",
  "Removes this title from your watchlist": "Retire ce titre de votre liste",
  Cast: "Distribution",
  "Similar Movies": "Films similaires",
  "Similar Series": "Séries similaires",
  "More Like This": "Dans le même genre",
  Seasons: "Saisons",
  "Season {{number}}": "Saison {{number}}",
  "Select a season": "Choisir une saison",
  "Up next": "À suivre",
  "Episodes unavailable": "Épisodes indisponibles",
  "We couldn't load this season right now. Please try again.":
    "Nous n'avons pas pu charger cette saison. Veuillez réessayer.",
  "No episode details published for this season yet.":
    "Aucun détail d'épisode publié pour cette saison.",
  "We couldn't open that film": "Impossible d'ouvrir ce film",
  "We couldn't open that show": "Impossible d'ouvrir cette série",
  "The link looks incomplete. Head back and pick a title again.":
    "Le lien semble incomplet. Revenez en arrière et choisissez un autre titre.",
  "Created by {{name}}": "Créé par {{name}}",
  "Dir. {{name}}": "Réal. {{name}}",
  "{{count}} Episodes": "{{count}} épisodes",

  // ── Suivi & notes ──────────────────────────────────────────────────────────
  "Want to Watch": "À voir",
  "Currently Watching": "En cours",
  Watched: "Vu",
  Watching: "En cours",
  "Your rating": "Votre note",
  Remove: "Retirer",
  "Remove your rating": "Retirer votre note",
  "Rate this title from 1 to 10": "Notez ce titre de 1 à 10",
  "Tap a number to rate this title": "Touchez un chiffre pour noter ce titre",
  "You rated this {{score}}/10": "Vous avez mis {{score}}/10",
  "Average {{rating}}": "Moyenne {{rating}}",
  "from {{count}} ratings": "sur {{count}} notes",

  // ── Recherche ──────────────────────────────────────────────────────────────
  "Search movies, series, actors...":
    "Rechercher des films, séries, acteurs...",
  "Search CineLog": "Rechercher dans CineLog",
  "Clear search": "Effacer la recherche",
  "Recent Searches": "Recherches récentes",
  "Popular Searches": "Recherches populaires",
  "Clear recent searches": "Effacer les recherches récentes",
  Clear: "Effacer",
  All: "Tout",
  People: "Personnes",
  "Search result types": "Types de résultats",
  "Find your next favorite": "Trouvez votre prochain coup de cœur",
  "Search thousands of movies, series and people.":
    "Cherchez parmi des milliers de films, séries et personnes.",
  'No results for "{{query}}"': 'Aucun résultat pour "{{query}}"',
  "Check the spelling, or try a different title, actor or director.":
    "Vérifiez l'orthographe, ou essayez un autre titre, acteur ou réalisateur.",
  "No people found": "Aucune personne trouvée",
  "Try an actor or director's full name.":
    "Essayez le nom complet d'un acteur ou d'un réalisateur.",

  // ── Ma liste ───────────────────────────────────────────────────────────────
  "Everything you save lands here": "Tout ce que vous enregistrez arrive ici",
  "{{count}} titles saved": "{{count}} titres enregistrés",
  "{{count}} title saved": "{{count}} titre enregistré",
  "Recently Added": "Ajouts récents",
  Rating: "Note",
  "Release Date": "Date de sortie",
  Alphabetical: "Alphabétique",
  "Sort by": "Trier par",
  "Watchlist type": "Type de liste",
  "Watchlist sorting": "Tri de la liste",
  "Your watchlist is empty": "Votre liste est vide",
  "Start discovering movies and series to build your list.":
    "Commencez à explorer les films et séries pour remplir votre liste.",
  Explore: "Explorer",
  "Nothing in this filter": "Rien dans ce filtre",
  "You haven't saved any films yet.":
    "Vous n'avez encore enregistré aucun film.",
  "You haven't saved any shows yet.":
    "Vous n'avez encore enregistré aucune série.",

  // ── Profil ─────────────────────────────────────────────────────────────────
  "Movies Watched": "Films vus",
  "Series Watched": "Séries vues",
  "Hours Watched": "Heures vues",
  "Recently Watched": "Vu récemment",
  "Favorite Movies": "Films favoris",
  "Favorite Series": "Séries favorites",
  "Your Ratings": "Vos notes",
  "Sign in to sync your library across devices":
    "Connectez-vous pour synchroniser votre bibliothèque",
  "Your CineLog story starts here": "Votre histoire CineLog commence ici",
  "Rate a film, favourite a show or tick off an episode and this page fills up.":
    "Notez un film, ajoutez une série aux favoris ou cochez un épisode et cette page se remplira.",

  // ── Paramètres ─────────────────────────────────────────────────────────────
  "Tune how CineLog looks, what it tells you and what it remembers.":
    "Réglez l'apparence de CineLog, ce qu'il vous dit et ce qu'il retient.",
  Appearance: "Apparence",
  Theme: "Thème",
  Dark: "Sombre",
  Light: "Clair",
  System: "Système",
  "CineLog is designed dark-first; light mode keeps contrast accessible.":
    "CineLog est conçu en mode sombre ; le mode clair garde un contraste accessible.",
  Language: "Langue",
  Notifications: "Notifications",
  "New releases": "Nouveautés",
  "Tell me when something I follow lands":
    "Me prévenir quand un titre que je suis sort",
  Recommendations: "Recommandations",
  "Weekly picks based on what I watch":
    "Sélection hebdomadaire selon ce que je regarde",
  "Watchlist reminders": "Rappels de ma liste",
  "Nudge me about titles I saved but haven't watched":
    "Me rappeler les titres enregistrés mais pas encore vus",
  Privacy: "Confidentialité",
  "Watch history": "Historique de visionnage",
  "Let what you watch shape your recommendations":
    "Laisser ce que vous regardez orienter vos recommandations",
  "Profile visibility": "Visibilité du profil",
  "Let other viewers find your CineLog profile":
    "Permettre aux autres de trouver votre profil CineLog",
  "Clear watch history": "Effacer l'historique",
  "This removes everything you've watched, your episode ticks and Continue Watching.":
    "Cela supprime tout ce que vous avez vu, vos épisodes cochés et Reprendre.",
  "Clear history": "Effacer l'historique",
  Account: "Compte",
  "Change password": "Changer le mot de passe",
  "Password reset sent": "Lien de réinitialisation envoyé",
  "We've emailed a reset link to {{email}}.":
    "Nous avons envoyé un lien de réinitialisation à {{email}}.",
  "Got it": "Compris",
  Close: "Fermer",
  "Delete account data": "Supprimer les données du compte",
  "This erases your watchlist, favourites, ratings and history from this device and signs you out.":
    "Cela efface votre liste, vos favoris, vos notes et votre historique de cet appareil et vous déconnecte.",
  "Delete everything": "Tout supprimer",
  Logout: "Se déconnecter",
  "Not signed in": "Non connecté",

  // ── Compte ─────────────────────────────────────────────────────────────────
  "Welcome back": "Bon retour",
  "Sign in to sync your watchlist, ratings and progress across devices.":
    "Connectez-vous pour synchroniser votre liste, vos notes et votre progression.",
  "Sign in": "Se connecter",
  "Create your CineLog": "Créez votre CineLog",
  "One account keeps your watchlist, ratings and viewing history together.":
    "Un seul compte réunit votre liste, vos notes et votre historique.",
  "Create account": "Créer un compte",
  "Reset your password": "Réinitialiser votre mot de passe",
  "We'll email you a link to choose a new password.":
    "Nous vous enverrons un lien pour choisir un nouveau mot de passe.",
  "Send reset link": "Envoyer le lien",
  Name: "Nom",
  "How should we call you?": "Comment devons-nous vous appeler ?",
  Email: "E-mail",
  Password: "Mot de passe",
  "At least 8 characters": "Au moins 8 caractères",
  "Check your inbox for the reset link.":
    "Consultez votre boîte de réception pour le lien.",
  "Create an account": "Créer un compte",
  "Forgot password?": "Mot de passe oublié ?",
  "Back to sign in": "Retour à la connexion",
  "Continue without an account": "Continuer sans compte",

  // ── Erreurs & états vides ──────────────────────────────────────────────────
  "Something went wrong": "Une erreur est survenue",
  "We couldn't load this content right now. Please try again.":
    "Nous n'avons pas pu charger ce contenu. Veuillez réessayer.",
  "Try again": "Réessayer",
  "CineLog hit a snag": "CineLog a rencontré un problème",
  "Something unexpected happened while rendering this screen. Reloading usually fixes it.":
    "Un imprévu s'est produit lors de l'affichage de cet écran. Recharger suffit généralement.",
  "This page doesn't exist": "Cette page n'existe pas",
  "The link may be out of date. Let's get you back to discovering.":
    "Le lien est peut-être obsolète. Retournons à la découverte.",
  "Go to Home": "Aller à l'accueil",
  "No trailer yet": "Pas encore de bande-annonce",
  "This title doesn't have a trailer published on CineLog's source.":
    "Aucune bande-annonce n'est publiée pour ce titre chez la source de CineLog.",
  Trailer: "Bande-annonce",
  "Close trailer": "Fermer la bande-annonce",
  "No credits to show": "Aucun crédit à afficher",
  "We don't have any titles for this person yet.":
    "Nous n'avons encore aucun titre pour cette personne.",
  "Known For": "Connu pour",
  "Born {{date}}": "Né(e) le {{date}}",
  "Died {{date}}": "Décédé(e) le {{date}}",

  // ── Pied de page & mentions légales ────────────────────────────────────────
  "Discover. Track. Watch.": "Découvrir. Suivre. Regarder.",
  Legal: "Mentions légales",
  "Legal & Privacy": "Mentions légales & confidentialité",
  "Movie and series data provided by The Movie Database (TMDB). CineLog is not endorsed or certified by TMDB.":
    "Données des films et séries fournies par The Movie Database (TMDB). CineLog n'est ni approuvé ni certifié par TMDB.",

  // ── Genres ─────────────────────────────────────────────────────────────────
  Action: "Action",
  Adventure: "Aventure",
  Animation: "Animation",
  Comedy: "Comédie",
  Crime: "Policier",
  Documentary: "Documentaire",
  Drama: "Drame",
  Fantasy: "Fantastique",
  Horror: "Horreur",
  Mystery: "Mystère",
  Romance: "Romance",
  "Sci-Fi": "Science-fiction",
  Thriller: "Thriller",

  // ── Les noms de langue restent dans leur langue ───────────────────────────
  English: "English",
  Nederlands: "Nederlands",
  Français: "Français",
  "you@example.com": "you@example.com",
  "Not found": "Introuvable",

  // ── Libellés d'accessibilité ─────────────────────────────────────────────
  "Open your CineLog profile, {{name}}":
    "Ouvrir votre profil CineLog, {{name}}",
  "Photo of {{name}}": "Photo de {{name}}",
  "{{title}} poster": "Affiche de {{title}}",
  "Still from {{title}}": "Image de {{title}}",
  "Watch the {{title}} trailer": "Voir la bande-annonce de {{title}}",
  "Save {{title}} to your watchlist": "Ajouter {{title}} à votre liste",
  "Remove {{title}} from your watchlist": "Retirer {{title}} de votre liste",
  "Rate {{score}} out of 10": "Noter {{score}} sur 10",
  "Rated {{rating}} out of 10": "Noté {{rating}} sur 10",
  "Mark episode {{number}}, {{title}}, as watched":
    "Marquer l'épisode {{number}}, {{title}}, comme vu",
  "Mark episode {{number}}, {{title}}, as unwatched":
    "Marquer l'épisode {{number}}, {{title}}, comme non vu",

  // ── Mentions légales ─────────────────────────────────────────────────────
  "About CineLog": "À propos de CineLog",
  "CineLog is a discovery and tracking app for movies and series. It helps you find titles, build a watchlist, rate what you've seen and keep track of where you are in a show. CineLog does not host, stream or distribute any video content.":
    "CineLog est une application pour découvrir et suivre des films et séries. Elle vous aide à trouver des titres, constituer une liste, noter ce que vous avez vu et retenir où vous en êtes dans une série. CineLog n'héberge, ne diffuse et ne distribue aucune vidéo.",
  "Content and attribution": "Contenu et attribution",
  "Titles, artwork, cast information, ratings and trailers come from The Movie Database (TMDB). CineLog uses the TMDB API but is not endorsed or certified by TMDB. All artwork and metadata remain the property of their respective rights holders.":
    "Les titres, visuels, distributions, notes et bandes-annonces proviennent de The Movie Database (TMDB). CineLog utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB. Tous les visuels et métadonnées restent la propriété de leurs détenteurs de droits respectifs.",
  Trailers: "Bandes-annonces",
  "Trailers are played through YouTube's official embedded player. Playback is subject to YouTube's terms of service and privacy policy.":
    "Les bandes-annonces sont lues via le lecteur intégré officiel de YouTube. La lecture est soumise aux conditions d'utilisation et à la politique de confidentialité de YouTube.",
  "Your data": "Vos données",
  "Your watchlist, favourites, ratings, viewing history and episode progress are stored on your device. When you sign in, they can also be synced to your account so they follow you between devices. You can clear your history or delete all of your data at any time from Settings.":
    "Votre liste, vos favoris, vos notes, votre historique et votre progression par épisode sont stockés sur votre appareil. Si vous vous connectez, ils peuvent aussi être synchronisés avec votre compte pour vous suivre d'un appareil à l'autre. Vous pouvez effacer votre historique ou supprimer toutes vos données à tout moment dans les Paramètres.",
  Contact: "Contact",
  "Questions about your data or this notice can be raised through the support channel listed in the app store entry for CineLog.":
    "Les questions sur vos données ou sur cet avis peuvent être posées via le canal d'assistance indiqué sur la fiche CineLog de la boutique d'applications.",
  "{{count}} Season": "{{count}} saison",
  "{{count}} Seasons": "{{count}} saisons",
  "{{title}} is out today": "{{title}} sort aujourd'hui",
  "It's on your watchlist — time to watch.":
    "C'est dans votre liste — il est temps de regarder.",
  "New picks for you": "De nouvelles suggestions",
  "We lined up fresh recommendations based on your taste.":
    "Nous avons préparé de nouvelles recommandations selon vos goûts.",
  "Still on your watchlist": "Toujours dans votre liste",
  "{{count}} titles are waiting for you.": "{{count}} titres vous attendent.",
  "Movie#type": "Film",
  "Series#type": "Série",
};
