# Nexora Security Hardening

## 1) API keys versleutelen

Gebruik een sterke passphrase (bij voorkeur opgeslagen in macOS Keychain) en zet die als environment variabele:

- `export NEXORA_SECRETS_PASSPHRASE="<sterke-passphrase>"`

Versleutel je lokale env-bestanden:

- `npm run secrets:encrypt`

Ontsleutel wanneer nodig op je eigen toestel:

- `npm run secrets:decrypt`

Aanbevolen workflow:

1. Bewaar alleen `.env.enc` als je encrypted secrets wilt delen.
2. Laat `.env` lokaal en nooit in git.
3. Rotatie: wijzig keys regelmatig in provider dashboards.

## 2) MacBook-only beveiliging voor release-acties

Gevoelige scripts (`ota:*`, `release:apk`) draaien nu eerst een host-check via:

- `scripts/require-macbook.mjs`

Standaard toegestane hostnamen:

- `MacBook-Pro-van-jens`
- `MacBook-Pro-van-jens.local`

Je kunt dit beheren met:

- `NEXORA_ALLOWED_HOSTS="host1,host2"`

Tijdelijke override (niet aanbevolen):

- `NEXORA_ALLOW_NON_MACBOOK=1`

## 2b) Strikte .env policy

Nieuwe checks:

- `npm run security:env-check`
- `npm run security:env-check:release`

Release-scripts vereisen nu standaard dat encrypted env-bestanden aanwezig zijn (`.env.enc`) voor app en server.

Tijdelijke override (noodmodus):

- `NEXORA_ALLOW_PLAINTEXT_ONLY=1`

Extra strict mode (ook voor dev/start):

- `NEXORA_STRICT_ENV_POLICY=1`

## 3) Belangrijke realiteit

Volledige anti-copy bescherming van client-code is niet 100% mogelijk. Wat je wél nu hebt:

- API keys staan niet hardcoded in app code
- Keys kunnen encrypted bewaard worden
- Release/OTA acties zijn host-beperkt

Voor extra hardening kun je nog toevoegen:

- GitHub branch protection + required reviews
- Secret scanning in CI
- Signed commits (GPG/SSH)
- Mobile app integrity (Play Integrity / App Attest)

## 4) Auto-versie + auto-push + OTA per wijziging

In deze repo is een post-commit hook voorzien die automatisch een nieuwe patch-versie maakt,
checks draait, commit/push uitvoert en OTA publiceert.

Installatie (eenmalig):

- `npm run hooks:install`

Manueel triggeren:

- `npm run release:auto`

Uitschakelen:

- `NEXORA_DISABLE_AUTO_RELEASE=1`

## 5) Volledig automatische secrets-flow

Nieuwe helper:

- [scripts/secrets-auto.mjs](scripts/secrets-auto.mjs)

Commands:

- `npm run secrets:auto:init`  → passphrase in Keychain initialiseren
- `npm run secrets:auto:ensure` → .env automatisch decrypten uit .env.enc indien nodig
- `npm run secrets:auto:lock`   → .env encrypten naar .env.enc en plaintext .env verwijderen

`dev`, `server`, `app` scripts draaien nu automatisch `secrets:auto:ensure`.
