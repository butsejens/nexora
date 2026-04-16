/**
 * Search Tab Screen
 */

import { SearchTab } from "@/features/search/SearchTab";
import React from "react";
import { router } from "expo-router";
import { usePageOnlyDebug } from "@/hooks/usePageOnlyDebug";

export default function SearchScreen() {
  usePageOnlyDebug("search-tab");
  return (
    <SearchTab
      onSelectResult={(result) => {
        switch (result.type) {
          case "series":
          case "movie": {
            const rawId = result.id;
            const prefix = result.type === "movie" ? "tmdb_m_" : "tmdb_s_";
            const detailId = rawId.startsWith("tmdb_")
              ? rawId
              : `${prefix}${rawId}`;
            router.push({
              pathname: "/detail",
              params: { id: detailId, type: result.type, title: result.title },
            });
            break;
          }
          default:
            break;
        }
      }}
    />
  );
}
