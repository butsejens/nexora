# Gratis deploy voor CineLog

Deze repo is al klaar om gratis online te draaien met:

- Frontend: Vercel of Netlify
- Backend/API: Render free tier
- Domein: elk `.io`-domein dat je zelf koopt

## 1. Frontend gratis deployen

### Vercel

1. Push de repo naar GitHub.
2. Open Vercel en kies "Add Project".
3. Selecteer deze repo.
4. Gebruik deze instellingen:

```bash
Install Command: npm install
Build Command: npm -w app run web:export
Output Directory: app/dist
```

5. Deploy.

> De repo bevat al `vercel.json` zodat deep links correct werken.

### Netlify

1. Push de repo naar GitHub.
2. Open Netlify en kies "New site from Git".
3. Kies deze repo.
4. Publish directory: `app/dist`
5. Deploy.

> De repo bevat al `netlify.toml` voor SPA redirects.

## 2. Backend gratis deployen

Er is al een `render.yaml` in de repo die een free web service voor de Node API configureert.

1. Log in op Render.
2. Kies "New" → "Blueprint".
3. Kies deze repo.
4. Render leest automatisch `render.yaml`.
5. Voeg ten minste deze env vars toe:

```bash
TMDB_API_KEY=...
NODE_ENV=production
PORT=10000
```

## 3. App naar de backend laten wijzen

In de app-config zet je de public API base op de Render URL:

```bash
EXPO_PUBLIC_API_BASE=https://jouw-render-url.onrender.com
```

Optional:

```bash
EXPO_PUBLIC_API_BASES=https://jouw-render-url.onrender.com
```

## 4. `.io` domein koppelen

1. Koop een `.io` domein bij een registrar.
2. Zet in Vercel/Netlify de domeinnaam als custom domain.
3. Voeg de DNS-records toe zoals door de host gevraagd wordt.

Belangrijk: het `.io`-domein is alleen het adres. De hosting blijft gratis via Vercel/Netlify/Render.

## 5. Wat gratis werkt

- Frontend static export: gratis op Vercel / Netlify
- API backend: gratis op Render
- Geen betaalde app store nodig
- Web browser toegang is gratis

## 6. Rebuild check

Deze repo is lokaal geverifieerd met:

```bash
cd /Users/jens/Downloads/nexora && npm -w app run web:export
```

De build was succesvol en exporteerde de statische routes naar `app/dist`.
