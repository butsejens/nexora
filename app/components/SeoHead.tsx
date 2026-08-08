/**
 * CineLog — per-route document metadata.
 *
 * Expo Router manages the document head on web, so titles and Open Graph tags
 * have to be declared per screen rather than once in `+html.tsx`. Sharing a
 * movie link then previews that movie rather than the generic app card.
 */

import React from "react";
import Head from "expo-router/head";

const SITE = "CineLog";
const TAGLINE = "Discover. Track. Watch.";
const DEFAULT_DESCRIPTION =
  "Discover movies and series, build your watchlist, track what you watch and find your next favorite with CineLog.";
const DEFAULT_IMAGE = "/og-image.png";

export interface SeoHeadProps {
  /** Page name; omit on the home screen to use the brand title. */
  title?: string;
  description?: string;
  /** Absolute or root-relative share image, e.g. a TMDB backdrop. */
  image?: string | null;
}

export function SeoHead({ title, description, image }: SeoHeadProps) {
  const documentTitle = title ? `${title} — ${SITE}` : `${SITE} — ${TAGLINE}`;
  const documentDescription = description?.trim() || DEFAULT_DESCRIPTION;
  const shareImage = image || DEFAULT_IMAGE;

  return (
    <Head>
      <title>{documentTitle}</title>
      <meta name="description" content={documentDescription} />
      <meta property="og:title" content={documentTitle} />
      <meta property="og:description" content={documentDescription} />
      <meta property="og:image" content={shareImage} />
      <meta name="twitter:title" content={documentTitle} />
      <meta name="twitter:description" content={documentDescription} />
      <meta name="twitter:image" content={shareImage} />
    </Head>
  );
}
