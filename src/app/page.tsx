"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { BrainCircuitIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ThemeToggle } from "@/components/theme-toggle";
import { SetupPanel } from "@/components/setup-panel";
import { DebateView } from "@/components/debate-view";
import { UserPrompt } from "@/components/user-prompt";
import { FinalDoc } from "@/components/final-doc";
import { RunControls } from "@/components/run-controls";
import { useDebate } from "@/lib/use-debate";

const STATUS_LABEL: Record<string, string> = {
  running: "Debating",
  awaiting: "Your move",
  paused: "Waiting for you",
  finalizing: "Writing document",
  done: "Done",
  stopped: "Stopped",
  error: "Error",
};

export default function Home() {
  const { session, start, stop, answer, interject, continueRound, finalizeNow, reset } = useDebate();
  const { status } = session;
  const active = status !== "idle";

  useEffect(() => {
    if (session.error) toast.error(session.error);
  }, [session.error]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <BrainCircuitIcon className="size-5 text-primary" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm font-semibold">Dialectic</span>
            <span className="truncate text-xs text-muted-foreground">multi-model debate → document</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {active && (
              <Badge variant="outline" className="gap-1.5">
                {(status === "running" || status === "finalizing") && <Spinner className="size-3" />}
                {STATUS_LABEL[status] ?? status}
                {session.rounds.length > 0 && ` · ${session.rounds.length}r`}
              </Badge>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {status === "idle" ? (
          <div className="mx-auto max-w-2xl">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Let the models argue it out.</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Drop an idea, pick 2–10 models, and they debate — one round at a time. You decide when to continue, add
                info, challenge them harder, or wrap it into a final document.
              </p>
            </div>
            <SetupPanel onStart={start} busy={false} />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {session.config && (
              <div className="rounded-xl border bg-muted/30 px-4 py-3">
                <div className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Topic</div>
                <p className="mt-0.5 text-sm">{session.config.topic}</p>
              </div>
            )}

            {status === "paused" && <UserPrompt questions={session.pendingQuestions} onAnswer={answer} />}

            <DebateView session={session} />

            {(status === "finalizing" || status === "done") && (
              <FinalDoc document={session.finalDoc} streaming={status === "finalizing"} />
            )}

            {status === "stopped" && session.rounds.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">Stopped before any round completed.</p>
            )}
          </div>
        )}
      </main>

      {/* Fixed run controls */}
      {active && (
        <RunControls
          status={status}
          roundCount={session.rounds.length}
          nextActiveCount={session.nextActive.length}
          suggestFinalize={session.suggestFinalize}
          onContinue={continueRound}
          onInterject={interject}
          onFinalize={finalizeNow}
          onStop={stop}
          onNew={reset}
        />
      )}
    </div>
  );
}
