# Domain migration: nexorahome.be → CineLog

Doel: ontkoppel `nexorahome.be` van Shopify en verbind het domein met je CineLog-webhosting (Vercel of Netlify) en backend op Render.

BELANGRIJK: ik kan geen DNS-records voor je veranderen zonder toegang tot je registrar. Deze gids bevat precieze, copy-paste-ready DNS-waarden en CLI-commando's zodat je het snel zelf kunt doen.

---

## 0) Voorbereiding
- Zorg dat je inloggegevens hebt voor je domein-registrar (Namecheap, Porkbun, Cloudflare, etc.).
- Zorg dat je GitHub repo up-to-date is en gepusht.
- Beslis frontend-hosting: **Vercel** of **Netlify**.

---

## 1) Stap 1 — Verwijder domein uit Shopify
1. Log in op je Shopify admin.
2. Ga naar `Online Store > Domains`.
3. Verwijder of maak `nexorahome.be` los van Shopify (Remove connection / Disconnect domain).
4. Shopify gebruikt meestal deze DNS-waarden; wees zeker dat je ze verwijdert:
   - A record: `23.227.38.65`
   - CNAME for `www`: `shops.myshopify.com`

> Nadat je het domein loskoppelt mogen er geen Shopify A/CNAME records meer aanwezig zijn.

---

## 2) Stap 2 — Kies host en voeg domein toe (Vercel of Netlify)

A. Vercel (aanbevolen voor eenvoudige setup)
1. Maak een account op https://vercel.com en importeer je GitHub repo.
2. In Project Settings → Domains voeg je `nexorahome.be` en `www.nexorahome.be` toe.
3. Vercel toont DNS records om bij je registrar te zetten.

Typische DNS entries voor Vercel (copy-paste voorbeeld):
- Apex (`nexorahome.be`) → A record: `76.76.21.21`
- `www` → CNAME: `<your-project>.vercel.app` (of `cname.vercel-dns.com` zoals Vercel aangeeft)

B. Netlify
1. Maak account op https://app.netlify.com, kies "New site from Git" en importeer de repo.
2. Site settings → Domain management → Add custom domain: `nexorahome.be`.
3. Netlify toont DNS records.

Typische DNS entries voor Netlify (copy-paste voorbeeld):
- Apex (`nexorahome.be`) → A records:
  - `75.2.60.5`
  - `104.198.14.52`
- `www` → CNAME: `<your-site>.netlify.app`

> Gebruik altijd de records die jouw hostingprovider bij het domein toevoegt in de UI; ze kunnen per account verschillen.

---

## 3) Stap 3 — DNS updates bij je registrar
1. Login bij je registrar (Namecheap/Porkbun/Cloudflare/...)
2. Ga naar DNS/Manage DNS voor `nexorahome.be`.
3. Verwijder bestaande Shopify A/CNAME-records (23.227.38.65 en shops.myshopify.com).
4. Voeg de A / CNAME records toe zoals hierboven voor de host die je gekozen hebt.
5. Wacht op DNS-propagatie (meestal < 60 min; in uitzonderlijke gevallen tot 24 uur).

Tip: gebruik `dig` of `nslookup` om te testen:

```bash
# controleer apex A records
dig +short A nexorahome.be
# controleer www CNAME
dig +short CNAME www.nexorahome.be
```

---

## 4) Stap 4 — Deploy frontend
1. Build lokaal (optioneel) om te verifiëren:

```bash
npm install
npm -w app run web:export
# statische site staat in app/dist
```

2. Deploy via Vercel (CLI option):

```bash
npm i -g vercel
vercel login
# vanuit repo root
vercel --prod --confirm
```

Of Netlify (CLI option):

```bash
npm i -g netlify-cli
netlify login
# maak of koppel site
netlify init
# of deploy handmatig
netlify deploy --prod --dir=app/dist
```

3. In de hosting dashboard: onder Site Settings → Domain voeg `nexorahome.be` toe (als dat nog niet gebeurde). Laat hosting automatisch HTTPS (Let's Encrypt) uitgeven.

---

## 5) Stap 5 — Backend op Render
1. Log in op https://render.com en maak een Web Service met root `server` (of gebruik Blueprint / import via GitHub).
2. Zorg dat `render.yaml` in de repo aanwezig is (deze repo bevat al `render.yaml`).
3. In Render UI: Environment sektion voeg toe:
   - `TMDB_API_KEY` (je TMDB sleutel)
   - `NODE_ENV=production`
   - `PORT=10000`
4. Public URL van de API ziet er zo uit: `https://<your-service>.onrender.com`.

---

## 6) Stap 6 — Maak frontend naar backend wijzen
- In Vercel/Netlify project settings → Environment variables voeg toe:
  - `EXPO_PUBLIC_API_BASE` = `https://<your-service>.onrender.com`
  - (optioneel) `EXPO_PUBLIC_API_BASES` = same

Of editeer `app/.env` / `.env.production` voordat je buildt (niet committen met gevoelige keys).

---

## 7) Stap 7 — Verifiëren
1. Open `https://nexorahome.be` in browser.
2. Controleer HTTPS aanwezig en geldig (slot icoon).
3. Controleer de app laadt en data van API komt (open devtools → Network → kijk of requests gaan naar je Render URL).

Gebruik deze commando's om snel te testen:

```bash
# check DNS
dig +short A nexorahome.be
dig +short CNAME www.nexorahome.be

# check homepage HTTP status
curl -I https://nexorahome.be

# check API connectivity (voorbeeld)
curl -I https://<your-service>.onrender.com/health
```

---

## 8) Veelvoorkomende issues
- SSL niet actief: controleer dat hosting provider `nexorahome.be` heeft geverifieerd. Voor Vercel/Netlify kan dat automatisch duren enkele minuten.
- Redirect probleem (apex vs www): stel forwarding in bij registrar of configureer `www` CNAME naar root en maak redirect van root naar www via hosting.
- Shopify caching: nadat je loskoppelt kan Shopify nog korte periode redirects cachen. Wacht tot DNS propagatie.

---

## 9) Hulp die ik kan bieden
- Ik kan exact de DNS-tekst voor je genereren om te plakken in je registrar, zodra je kiest: Vercel of Netlify.
- Ik kan de exacte `vercel` / `netlify` CLI-commando's runnen die je kan kopiëren en uitvoeren.
- Ik kan bijdragen aan de Render setup-instructies of zelfs een PR maken in je repo met CI-variabelen (maar ik heb jouw provider credentials nodig).

---

Als je wilt dat ik nu de DNS-tekst klaarmaak, kies eerst: **Vercel** of **Netlify** als frontend host. 

Vertel ook of je wilt dat ik de CLI-commando's maak voor Vercel of Netlify, zodat jij ze kunt plakken en uitvoeren.
