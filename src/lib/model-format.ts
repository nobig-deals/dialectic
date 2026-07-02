// Formatting + ranking helpers for the OpenRouter model catalogue.

import type { OpenRouterModel } from "./types";

export type SortKey = "best" | "cheapest" | "context" | "newest" | "name";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "best", label: "Best" },
  { key: "cheapest", label: "Cheapest" },
  { key: "context", label: "Context" },
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name" },
];

/** Compact token count: 1_000_000 → "1M", 1_050_000 → "1.1M", 65_536 → "66K". */
export function formatTokens(n?: number): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1_000_000) return `${String(Number((n / 1_000_000).toFixed(1)))}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** USD-per-token string → USD-per-million-tokens number. Negative sentinels (e.g. "-1" on
 *  router models with variable pricing) and non-numbers are treated as unknown. */
function perMillion(price?: string): number | null {
  if (price == null) return null;
  const v = Number(price);
  if (!Number.isFinite(v) || v < 0) return null;
  return v * 1_000_000;
}

function money(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.1) return `$${trim(Number(v.toFixed(3)))}`;
  return `$${trim(Number(v.toFixed(2)))}`;
}

/** Human price like "$2 / $10" (in / out per 1M tokens), or "Free". */
export function formatPrice(m: OpenRouterModel): string | null {
  const inM = perMillion(m.promptPrice);
  const outM = perMillion(m.completionPrice);
  if (inM == null && outM == null) return null;
  if ((inM ?? 0) === 0 && (outM ?? 0) === 0) return "Free";
  return `${money(inM ?? 0)} / ${money(outM ?? 0)}`;
}

/** Combined per-1M cost used for the "cheapest" sort. Unknown sinks to the bottom. */
function totalCost(m: OpenRouterModel): number {
  const inM = perMillion(m.promptPrice);
  const outM = perMillion(m.completionPrice);
  if (inM == null && outM == null) return Number.POSITIVE_INFINITY;
  return (inM ?? 0) + (outM ?? 0);
}

/** Sort a copy of the catalogue by the chosen key. */
export function rankModels(models: OpenRouterModel[], sort: SortKey): OpenRouterModel[] {
  const list = [...models];
  switch (sort) {
    case "best": {
      // Benchmarked models first (by intelligence desc), then the rest by recency.
      const scored = list.filter((m) => typeof m.intelligence === "number");
      const rest = list.filter((m) => typeof m.intelligence !== "number");
      scored.sort((a, b) => (b.intelligence ?? 0) - (a.intelligence ?? 0));
      rest.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
      return [...scored, ...rest];
    }
    case "cheapest":
      return list.sort((a, b) => totalCost(a) - totalCost(b));
    case "context":
      return list.sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0));
    case "newest":
      return list.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
    case "name":
      return list.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function trim(n: number): string {
  return String(Number(n.toFixed(2)));
}
