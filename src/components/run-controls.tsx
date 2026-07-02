"use client";

import { useState } from "react";
import {
  FlagIcon,
  MessageSquarePlusIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { SessionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  status: SessionStatus;
  roundCount: number;
  nextActiveCount: number;
  suggestFinalize: boolean;
  onContinue: () => void;
  onInterject: (text: string) => void;
  onFinalize: () => void;
  onStop: () => void;
  onNew: () => void;
};

function stateLabel(p: Props): string {
  switch (p.status) {
    case "running":
      return `Round ${p.roundCount + 1} running…`;
    case "awaiting":
      return p.suggestFinalize ? "Models converged — ready to finalize" : `Round ${p.roundCount} complete`;
    case "paused":
      return "Answer the questions above to continue";
    case "finalizing":
      return "Writing the final document…";
    case "done":
      return "Done";
    case "stopped":
      return "Stopped";
    case "error":
      return "Error";
    default:
      return "";
  }
}

export function RunControls(props: Props) {
  const { status, nextActiveCount, suggestFinalize } = props;
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");

  const busy = status === "running" || status === "finalizing";
  const canContinue = status === "awaiting" || status === "stopped" || status === "done";
  const canAddInfo = status === "awaiting" || status === "paused" || status === "stopped" || status === "done";
  const canFinalize = (status === "awaiting" || status === "paused" || status === "stopped") && props.roundCount > 0;

  const send = () => {
    if (!text.trim()) return;
    props.onInterject(text.trim());
    setText("");
    setComposing(false);
  };

  return (
    <div className="pointer-events-none sticky bottom-0 z-20 flex justify-center px-4 pb-5">
      <div className="pointer-events-auto w-auto max-w-[calc(100%-1rem)] rounded-2xl border border-border/60 bg-popover px-3.5 py-2.5 shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
        {/* Add-info composer */}
        {composing && (
          <div className="mb-2 flex w-[min(90vw,40rem)] flex-col gap-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Add info, steer them, or challenge them harder — sent to all models next round
              </span>
              <button onClick={() => setComposing(false)} aria-label="Close" className="rounded p-0.5 hover:bg-accent">
                <XIcon className="size-4" />
              </button>
            </div>
            <Textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
              }}
              placeholder="e.g. Focus only on the DACH market. Push back harder on model A's pricing assumption…"
              className="min-h-20 resize-y bg-background"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={send} disabled={!text.trim()}>
                <SendIcon /> Send &amp; run round
              </Button>
            </div>
          </div>
        )}

        {/* State + actions */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {busy && <Spinner className="size-3.5" />}
            {stateLabel(props)}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {busy && (
              <Button variant="outline" size="sm" onClick={props.onStop}>
                <SquareIcon /> Stop
              </Button>
            )}

            {canAddInfo && (
              <Button variant="outline" size="sm" onClick={() => setComposing((c) => !c)}>
                <MessageSquarePlusIcon /> Add info
              </Button>
            )}

            {canFinalize && (
              <Button variant={suggestFinalize ? "default" : "outline"} size="sm" onClick={props.onFinalize}>
                <FlagIcon /> Finalize
              </Button>
            )}

            {canContinue && (
              <Button
                variant={suggestFinalize ? "outline" : "default"}
                size="sm"
                onClick={props.onContinue}
                className={cn(status === "done" && "hidden sm:inline-flex")}
              >
                <PlayIcon />
                {nextActiveCount > 0 ? `Continue · ${nextActiveCount}` : "Continue"}
              </Button>
            )}

            {(status === "done" || status === "stopped") && (
              <Button variant="ghost" size="sm" onClick={props.onNew}>
                <PlusIcon /> New
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
