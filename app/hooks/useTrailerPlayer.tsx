/**
 * CineLog — trailer playback controller.
 *
 * Any screen can call `open(title)` and render `element`; the trailer is only
 * fetched once a viewer actually asks for it.
 */

import React, { useCallback, useState } from "react";

import { TrailerModal } from "@/components/media/TrailerModal";
import { useTrailer } from "@/lib/cinelog/queries";
import type { MediaType, Trailer } from "@/lib/cinelog/types";

interface TrailerTarget {
  type: MediaType;
  tmdbId: number;
  title: string;
}

export interface TrailerPlayer {
  open: (target: TrailerTarget) => void;
  close: () => void;
  element: React.ReactElement;
}

export function useTrailerPlayer(preloaded?: Trailer | null): TrailerPlayer {
  const [target, setTarget] = useState<TrailerTarget | null>(null);

  const { data, isLoading } = useTrailer(
    target?.type ?? "movie",
    target?.tmdbId ?? null,
    // A detail page already has the trailer from its own payload.
    Boolean(target) && !preloaded,
  );

  const open = useCallback((next: TrailerTarget) => setTarget(next), []);
  const close = useCallback(() => setTarget(null), []);

  const element = (
    <TrailerModal
      visible={target !== null}
      onClose={close}
      title={target?.title ?? ""}
      trailer={preloaded ?? data ?? null}
      isLoading={!preloaded && isLoading}
    />
  );

  return { open, close, element };
}
