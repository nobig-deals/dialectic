"use client";

import { AlertTriangleIcon, HelpCircleIcon, SwordsIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import type { Challenge } from "@/lib/types";

export type ModelRow = {
  id: string;
  index: number;
  name: string;
  /** OpenRouter model id, shown when `name` is a role name so the model stays visible. */
  model?: string;
  /** Names of skills attached to this persona. */
  skills?: string[];
  prose: string;
  confidence: number | null;
  challenges: Challenge[];
  questionsForUser: string[];
  streaming: boolean;
  /** True when the model sat out this round — its answer is carried over unchanged. */
  settled?: boolean;
  error?: string;
};

const AVATAR_TONES = [
  "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  "bg-lime-500/15 text-lime-600 dark:text-lime-400",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  "bg-orange-500/15 text-orange-600 dark:text-orange-400",
];

function confidenceTone(c: number): string {
  if (c >= 80) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (c >= 60) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
}

function initialsOf(name: string) {
  return name.replace(/[^a-zA-Z0-9]/g, " ").trim().slice(0, 2).toUpperCase() || "AI";
}

/** Condensed one-line preview of the answer for the collapsed row. */
function preview(prose: string): string {
  const flat = prose.replace(/[#*`>_-]/g, "").replace(/\s+/g, " ").trim();
  return flat.slice(0, 90);
}

export function ModelAccordion({ rows, defaultOpen }: { rows: ModelRow[]; defaultOpen: string[] }) {
  return (
    <Accordion
      multiple
      defaultValue={defaultOpen}
      className="overflow-hidden rounded-xl border"
    >
      {rows.map((r) => (
        <AccordionItem key={r.id} value={r.id} className="border-b last:border-b-0">
          <AccordionTrigger
            className={cn(
              "items-center gap-3 rounded-none px-4 py-3 hover:no-underline",
              r.settled && "opacity-60",
            )}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                AVATAR_TONES[r.index % AVATAR_TONES.length],
              )}
            >
              {initialsOf(r.name)}
            </span>

            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium">{r.name}</span>
                {r.model && (
                  <span className="truncate font-mono text-xs font-normal text-muted-foreground">{r.model}</span>
                )}
                {r.skills?.map((s) => (
                  <Badge key={s} variant="outline" className="hidden h-4.5 shrink-0 px-1.5 text-[10px] font-normal text-muted-foreground sm:inline-flex">
                    {s}
                  </Badge>
                ))}
              </span>
              {r.settled ? (
                <span className="truncate text-xs font-normal text-muted-foreground">No further comment · answer carried over</span>
              ) : (
                <>
                  {!r.streaming && r.prose && (
                    <span className="truncate text-xs font-normal text-muted-foreground">{preview(r.prose)}…</span>
                  )}
                  {r.streaming && <span className="text-xs font-normal text-muted-foreground">Thinking…</span>}
                </>
              )}
            </span>

            {/* State chips */}
            <span className="flex shrink-0 items-center gap-1.5">
              {r.error && <AlertTriangleIcon className="size-4 text-destructive" />}
              {r.challenges.length > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-amber-500">
                  <SwordsIcon className="size-3.5" />
                  {r.challenges.length}
                </span>
              )}
              {r.questionsForUser.length > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-sky-500">
                  <HelpCircleIcon className="size-3.5" />
                  {r.questionsForUser.length}
                </span>
              )}
              {r.streaming ? (
                <Spinner className="size-4 text-muted-foreground" />
              ) : (
                r.confidence !== null && (
                  <Badge className={cn("font-mono", confidenceTone(r.confidence))}>{r.confidence}</Badge>
                )
              )}
            </span>
          </AccordionTrigger>

          <AccordionContent className="px-4">
            {r.error ? (
              <div className="flex items-start gap-2 pb-3 text-sm text-destructive">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                <span>{r.error}</span>
              </div>
            ) : (
              <div className="pb-1">
                {r.prose ? <Markdown>{r.prose}</Markdown> : <p className="text-sm text-muted-foreground">Thinking…</p>}

                {r.challenges.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5 border-t pt-3">
                    {r.challenges.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <SwordsIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                        <span>
                          <span className="font-medium text-foreground">@{c.target}</span> {c.point}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {r.questionsForUser.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5 border-t pt-3">
                    {r.questionsForUser.map((q, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <HelpCircleIcon className="mt-0.5 size-3.5 shrink-0 text-sky-500" />
                        <span>{q}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
