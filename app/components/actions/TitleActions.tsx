/**
 * CineLog — title action buttons.
 *
 * Watchlist, favourite, trailer and watch-state controls. Each one keeps its own
 * store subscription so pressing it re-renders the button rather than the page.
 */

import React, { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { Button, IconButton } from "@/components/ui/Button";
import { GenrePill } from "@/components/ui/GenrePill";
import { COLORS, SPACING } from "@/constants/theme";
import { SafeHaptics } from "@/lib/safeHaptics";
import type { LibraryEntryRef, WatchState } from "@/lib/cinelog/types";
import { useLibrary } from "@/store/library-store";

export interface WatchlistButtonProps {
  item: LibraryEntryRef;
  variant?: "button" | "icon";
  size?: "sm" | "md" | "lg";
}

export function WatchlistButton({
  item,
  variant = "button",
  size = "md",
}: WatchlistButtonProps) {
  const saved = useLibrary((state) => state.isInWatchlist(item.id));
  const toggle = useLibrary((state) => state.toggleWatchlist);

  const onPress = useCallback(() => {
    toggle(item);
    void SafeHaptics.selection();
  }, [item, toggle]);

  const label = saved ? "In Watchlist" : "Add to Watchlist";

  if (variant === "icon") {
    return (
      <IconButton
        icon={saved ? "checkmark" : "add"}
        label={
          saved
            ? `Remove ${item.title} from your watchlist`
            : `Save ${item.title} to your watchlist`
        }
        onPress={onPress}
        active={saved}
      />
    );
  }

  return (
    <Button
      label={label}
      icon={saved ? "checkmark" : "add"}
      onPress={onPress}
      variant="secondary"
      size={size}
      accessibilityHint={
        saved
          ? "Removes this title from your watchlist"
          : "Saves this title for later"
      }
    />
  );
}

export interface FavoriteButtonProps {
  item: LibraryEntryRef;
}

export function FavoriteButton({ item }: FavoriteButtonProps) {
  const favorited = useLibrary((state) => state.isFavorite(item.id));
  const toggle = useLibrary((state) => state.toggleFavorite);

  const onPress = useCallback(() => {
    toggle(item);
    void SafeHaptics.impactLight();
  }, [item, toggle]);

  return (
    <IconButton
      icon={favorited ? "heart" : "heart-outline"}
      label={
        favorited
          ? `Remove ${item.title} from your favourites`
          : `Mark ${item.title} as a favourite`
      }
      onPress={onPress}
      active={favorited}
    />
  );
}

export interface TrailerButtonProps {
  onPress: () => void;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}

export function TrailerButton({
  onPress,
  size = "md",
  disabled,
}: TrailerButtonProps) {
  return (
    <Button
      label="Watch Trailer"
      icon="play"
      onPress={onPress}
      size={size}
      disabled={disabled}
      accessibilityHint="Plays the trailer inside CineLog"
    />
  );
}

const WATCH_STATES: { value: WatchState; label: string }[] = [
  { value: "want_to_watch", label: "Want to Watch" },
  { value: "watching", label: "Currently Watching" },
  { value: "watched", label: "Watched" },
];

export interface WatchStateSelectorProps {
  item: LibraryEntryRef;
}

/** Three-way tracking control: Want to Watch / Currently Watching / Watched. */
export function WatchStateSelector({ item }: WatchStateSelectorProps) {
  const current = useLibrary((state) => state.getWatchState(item.id));
  const setWatchState = useLibrary((state) => state.setWatchState);

  return (
    <View style={styles.stateRow} accessibilityRole="radiogroup">
      {WATCH_STATES.map((option) => (
        <GenrePill
          key={option.value}
          label={option.label}
          selected={current === option.value}
          onPress={() => {
            setWatchState(item, option.value);
            void SafeHaptics.selection();
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
  },
});
