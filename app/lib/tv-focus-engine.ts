/**
 * TV Focus Engine — centralized focus management for Android TV.
 *
 * Provides:
 *  - Focus memory: remembers last-focused element per screen/row
 *  - Focus recovery: restores focus when it's lost after re-renders
 *  - Sidebar state management: tracks whether sidebar is expanded
 */
import { useRef, useCallback, useEffect, useState } from "react";
import { findNodeHandle, UIManager, Platform } from "react-native";

// ── Focus Memory Store ─────────────────────────────────────────────────────
const focusMemory: Record<string, number> = {};

export function saveFocusIndex(key: string, index: number) {
  focusMemory[key] = index;
}

export function getFocusIndex(key: string): number {
  return focusMemory[key] ?? 0;
}

// ── Request Focus on a React ref ───────────────────────────────────────────
export function requestFocusOnRef(ref: React.RefObject<any>) {
  if (!ref.current) return;
  const tag = findNodeHandle(ref.current);
  if (tag && Platform.OS === "android") {
    UIManager.dispatchViewManagerCommand(tag, "requestFocus" as any, []);
    // Fallback: use setNativeProps if dispatchViewManagerCommand doesn't work
    try {
      ref.current?.setNativeProps?.({ hasTVPreferredFocus: true });
    } catch {}
  }
}

// ── useTVFocusMemory hook ──────────────────────────────────────────────────
// Tracks the focused index in a row and restores it on mount.
export function useTVFocusMemory(rowKey: string) {
  const lastIndex = useRef(getFocusIndex(rowKey));

  const onItemFocus = useCallback(
    (index: number) => {
      lastIndex.current = index;
      saveFocusIndex(rowKey, index);
    },
    [rowKey]
  );

  return { initialIndex: lastIndex.current, onItemFocus };
}

// ── Sidebar State (shared across components) ───────────────────────────────
let _sidebarExpanded = true;
const _listeners: Set<(expanded: boolean) => void> = new Set();

export function setSidebarExpanded(expanded: boolean) {
  if (_sidebarExpanded === expanded) return;
  _sidebarExpanded = expanded;
  _listeners.forEach((fn) => fn(expanded));
}

export function getSidebarExpanded() {
  return _sidebarExpanded;
}

export function useSidebarState() {
  const [expanded, setExpanded] = useState(_sidebarExpanded);

  useEffect(() => {
    const handler = (v: boolean) => setExpanded(v);
    _listeners.add(handler);
    return () => {
      _listeners.delete(handler);
    };
  }, []);

  return { sidebarExpanded: expanded, setSidebarExpanded };
}
