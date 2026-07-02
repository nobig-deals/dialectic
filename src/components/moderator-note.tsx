"use client";

import { GavelIcon, RefreshCwIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/markdown";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Controls to re-run the moderator, shown on the newest note only. */
export type RemoderateProps = {
  /** Current moderator model id. */
  model: string;
  /** Model choices (the debate's participant models). */
  models: string[];
  busy?: boolean;
  /** Re-run the moderator; pass a model id to switch it first. */
  onRun: (model?: string) => void;
};

/** The moderator's synthesis for a round. */
export function ModeratorNote({
  summary,
  streaming,
  remoderate,
}: {
  summary: string;
  streaming?: boolean;
  remoderate?: RemoderateProps;
}) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
        <GavelIcon className="size-3.5" /> Moderator
        {streaming && <Spinner className="size-3.5" />}
        {remoderate && (
          <span className="ml-auto flex items-center gap-1 normal-case">
            <Select
              value={remoderate.model}
              onValueChange={(v: string | null) => {
                if (v && v !== remoderate.model) remoderate.onRun(v);
              }}
            >
              <SelectTrigger
                className="h-6 gap-1 border-primary/20 bg-transparent px-2 text-[11px] font-normal text-muted-foreground"
                disabled={remoderate.busy}
                aria-label="Moderator model"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {remoderate.models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => remoderate.onRun()}
              disabled={remoderate.busy}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
              aria-label="Re-run the moderator"
              title="Re-run the moderator on this round"
            >
              <RefreshCwIcon className="size-3.5" />
            </button>
          </span>
        )}
      </div>
      {summary ? (
        <Markdown className="text-muted-foreground">{summary}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground">
          {streaming
            ? "Reviewing the round…"
            : remoderate
              ? "No moderator synthesis for this round — re-run it, or switch the model and try again."
              : "Reviewing the round…"}
        </p>
      )}
    </div>
  );
}
