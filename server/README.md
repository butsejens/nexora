# Nexora Server (AI + Sports)

## Local run
```bash
cd server
npm install
cp .env.example .env
# edit .env and add keys if needed (ESPN sports source werkt zonder key)
npm run dev
```

Health check:
- http://localhost:8080/health

## AI providers (including free options)
Nexora probeert providers in volgorde en pakt de eerste die werkt:
1. `OLLAMA_MODEL` (lokaal, gratis)
2. `DEEPSEEK_API_KEY`
3. `OPENROUTER_API_KEY`
4. `GROQ_API_KEY`
5. `OPENAI_API_KEY`

Voor gratis lokaal gebruik (aanrader):
- Installeer Ollama
- Start een model, bv. `ollama run llama3.1:8b-instruct`
- Zet in `.env`: `OLLAMA_MODEL=llama3.1:8b-instruct`

Voor OpenRouter free models:
- Zet `OPENROUTER_API_KEY`
- Gebruik een free model id met `:free`, bv. `openai/gpt-oss-20b:free`

## Deploy (Render quick)
- Create a new Web Service from this repo
- Root Directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Add env vars: AI provider keys of choice (`OLLAMA_MODEL` local, or `DEEPSEEK_API_KEY` / `OPENROUTER_API_KEY` / `GROQ_API_KEY` / `OPENAI_API_KEY`) and `APISPORTS_KEY` (optional sports fallback)

## Deploy zonder lokale server (aanrader)
Gebruik Render free tier zodat je app altijd een backend heeft.

1. Push deze repo naar GitHub.
2. In Render kies je **Blueprint** deploy (leest automatisch `render.yaml` in repo root).
3. Service naam: `nexora-api` (automatisch).
4. Stel in Render Environment de variabelen in die je nodig hebt:
	- Minimaal: `APP_TZ=Europe/Brussels`
	- Voor films/series: `TMDB_API_KEY`
	- Voor AI: minstens één van `OPENROUTER_API_KEY` / `GROQ_API_KEY` / `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`
	- Optioneel sports fallback: `APISPORTS_KEY`

Na deploy: zet in `app/.env`:

```bash
EXPO_PUBLIC_API_BASE=https://<jouw-render-url>
EXPO_PUBLIC_API_BASES=https://<jouw-render-url>,http://localhost:8080
```

Daarna hoef je lokaal alleen nog de app te starten (`npm run app`).
