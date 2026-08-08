import React, { type PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

/**
 * HTML shell for the web build: SEO and Open Graph metadata, PWA manifest hooks
 * and a dark page background so the first paint matches the app rather than
 * flashing white.
 */

const TITLE = "CineLog — Discover. Track. Watch.";
const DESCRIPTION =
  "Discover movies and series, build your watchlist, track what you watch and find your next favorite with CineLog.";
const THEME_COLOR = "#08090B";

/**
 * Applied before React mounts so the very first frame is already dark, and so
 * the app fills the viewport on mobile browsers with a dynamic toolbar.
 */
const BOOT_STYLES = `
  html, body, #root {
    height: 100%;
    background-color: ${THEME_COLOR};
    color-scheme: dark;
  }
  body {
    margin: 0;
    overscroll-behavior-y: none;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  /* Keep keyboard focus visible without painting rings on mouse clicks. */
  :focus-visible {
    outline: 2px solid #E8112D;
    outline-offset: 2px;
  }
`;

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="theme-color" content={THEME_COLOR} />
        <meta name="application-name" content="CineLog" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="CineLog" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content="/assets/images/icon.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />

        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="CineLog" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/assets/images/icon.png" />
        <link rel="manifest" href="/manifest.json" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: BOOT_STYLES }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
