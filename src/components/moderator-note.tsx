"use client";

import { GavelIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/markdown";

/** The moderator's synthesis for a round. */
export function ModeratorNote({ summary, streaming }: { summary: string; streaming?: boolean }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
        <GavelIcon className="size-3.5" /> Moderator
        {streaming && <Spinner className="size-3.5" />}
      </div>
      {summary ? (
        <Markdown className="text-muted-foreground">{summary}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground">Reviewing the round…</p>
      )}
    </div>
  );
}
