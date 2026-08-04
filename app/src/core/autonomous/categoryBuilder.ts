import type { Movie, Series } from "@/types/streaming";
import { SAFE_CATEGORY_ORDER, type SafeCategory } from "./autonomousConfig";

type Content = Movie | Series;
type CategoryMap = Partial<Record<SafeCategory, Content[]>>;

function keyFor(item: Content): string {
  return `${item.type}:${item.id}`;
}

function dedupe(items: Content[]): Content[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withVisual(items: Content[]): Content[] {
  return items.filter((item) => Boolean(item.poster || item.backdrop));
}

export function buildAutonomousCategories(input: CategoryMap): Record<SafeCategory, Content[]> {
  const out = {} as Record<SafeCategory, Content[]>;
  const fallbackPool = withVisual(
    dedupe(
      SAFE_CATEGORY_ORDER.flatMap((category) =>
        Array.isArray(input[category]) ? input[category]! : [],
      ),
    ),
  );

  const used = new Set<string>();
  for (const category of SAFE_CATEGORY_ORDER) {
    const primary = withVisual(dedupe([...(input[category] || [])]));
    const filled = primary.length > 0 ? primary : fallbackPool;
    const unique = filled.filter((item) => {
      const key = keyFor(item);
      if (used.has(key)) return false;
      used.add(key);
      return true;
    });
    out[category] = unique.slice(0, 24);
  }

  return out;
}

