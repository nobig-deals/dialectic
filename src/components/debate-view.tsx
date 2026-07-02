"use client";

import { useEffect, useState } from "react";
import { CornerDownRightIcon, GavelIcon, HelpCircleIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ModelAccordion, type ModelRow } from "@/components/model-accordion";
import { ModeratorNote } from "@/components/moderator-note";
import { liveProse, type Session } from "@/lib/use-debate";
import type { Participant, Round } from "@/lib/types";

/**
 * One row per participant, in roster order. Models that actually answered this
 * round show their fresh response; models that sat out carry over their most
 * recent prior answer (marked `settled`) so every round shows the full roster.
 */
/** Model id + skill names shown next to the display name (which is the role name when a role is set). */
function personaOf(p: Participant): Pick<ModelRow, "model" | "skills"> {
  return {
    model: p.roleId ? p.model : undefined,
    skills: p.skills?.length ? p.skills.map((s) => s.name) : undefined,
  };
}

function rowsFrom(round: Round, participants: Participant[], allRounds: Round[]): ModelRow[] {
  return participants.map((p, index) => {
    const fresh = round.responses.find((r) => r.id === p.id);
    if (fresh) {
      return {
        id: fresh.id,
        index,
        name: fresh.name,
        ...personaOf(p),
        prose: fresh.prose,
        confidence: fresh.meta.confidence,
        challenges: fresh.meta.challenges,
        questionsForUser: fresh.meta.questionsForUser,
        streaming: false,
        error: fresh.error,
      };
    }
    // Carry over the last answer this model gave in an earlier round.
    const prior = [...allRounds]
      .filter((rd) => rd.index < round.index)
      .reverse()
      .flatMap((rd) => rd.responses)
      .find((r) => r.id === p.id);
    return {
      id: p.id,
      index,
      name: prior?.name ?? p.name,
      ...personaOf(p),
      prose: prior?.prose ?? "",
      confidence: prior?.meta.confidence ?? null,
      challenges: [],
      questionsForUser: [],
      streaming: false,
      settled: true,
    };
  });
}

function UserReply({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2 text-sm">
      <CornerDownRightIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
      <span className="whitespace-pre-wrap">
        <span className="font-medium">You:</span>
        {"\n"}
        {text}
      </span>
    </div>
  );
}

export function DebateView({
  session,
  onRemoderate,
}: {
  session: Session;
  onRemoderate?: (model?: string) => void;
}) {
  const participants = session.config?.participants ?? [];
  const threshold = session.config?.threshold ?? 0;
  const rounds = session.rounds;
  const hasLive = !!session.live;

  const remoderateProps =
    onRemoderate && session.config
      ? {
          model: session.config.moderatorModel,
          models: [...new Set(participants.map((p) => p.model))],
          busy: session.status === "running" || session.status === "finalizing",
          onRun: onRemoderate,
        }
      : undefined;
  // The moderator is being re-run when we're "running" without a live round streaming.
  const remoderating = session.status === "running" && !hasLive;

  // Collapse finished rounds; keep the newest open (or all closed while a round streams).
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => {
    if (hasLive || rounds.length === 0) setOpen([]);
    else setOpen([`r${rounds[rounds.length - 1].index}`]);
  }, [rounds.length, hasLive]);

  return (
    <div className="flex flex-col gap-6">
      {/* Finished rounds — each collapsible */}
      <Accordion multiple value={open} onValueChange={(v) => setOpen(v as string[])} className="flex flex-col gap-3">
        {rounds.map((round) => {
          const isLast = !hasLive && round.index === rounds[rounds.length - 1].index;
          const n = round.responses.length;
          const converged = round.responses.filter((r) => r.meta.confidence >= threshold).length;
          const questions =
            round.responses.reduce((a, r) => a + r.meta.questionsForUser.length, 0) +
            (round.moderator?.meta.questionsForUser.length ?? 0);
          return (
            <AccordionItem
              key={round.index}
              value={`r${round.index}`}
              className="overflow-hidden rounded-xl border last:border"
            >
              <AccordionTrigger className="items-center gap-3 px-4 py-3 hover:no-underline">
                <span className="text-sm font-semibold">Round {round.index + 1}</span>
                <span className="flex flex-1 flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
                  <span>{n} models</span>
                  <span className="text-border">·</span>
                  <span>
                    {converged}/{n} confident
                  </span>
                  {questions > 0 && (
                    <span className="flex items-center gap-0.5 text-sky-500">
                      <HelpCircleIcon className="size-3.5" />
                      {questions}
                    </span>
                  )}
                  {round.moderator?.summary && (
                    <span className="hidden truncate md:inline">
                      <GavelIcon className="mr-1 inline size-3 text-primary" />
                      {round.moderator.summary.replace(/[#*`>_-]/g, "").replace(/\s+/g, " ").trim().slice(0, 70)}…
                    </span>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <div className="flex flex-col gap-3 pb-2">
                  {(round.moderator || (isLast && remoderateProps)) && (
                    <ModeratorNote
                      summary={round.moderator?.summary ?? ""}
                      streaming={isLast && remoderating}
                      remoderate={isLast ? remoderateProps : undefined}
                    />
                  )}
                  <ModelAccordion rows={rowsFrom(round, participants, rounds)} defaultOpen={[]} />
                  {round.userAnswer && <UserReply text={round.userAnswer} />}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Live round — always expanded */}
      {session.live && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Round {session.live.index + 1} · live
            </h3>
            <div className="h-px flex-1 bg-border" />
          </div>
          {(session.live.modText || session.live.moderator) && (
            <ModeratorNote
              summary={session.live.moderator?.summary ?? session.live.modText}
              streaming={!session.live.moderator}
              remoderate={remoderateProps && { ...remoderateProps, busy: false }}
            />
          )}
          <ModelAccordion
            key={`live-${session.live.index}`}
            rows={participants.map((p, index) => {
              const active = session.live!.activeIds.includes(p.id);
              if (active) {
                const done = session.live!.done[p.id];
                return {
                  id: p.id,
                  index,
                  name: p.name,
                  ...personaOf(p),
                  prose: liveProse(session.live!, p.id),
                  confidence: done ? done.meta.confidence : null,
                  challenges: done ? done.meta.challenges : [],
                  questionsForUser: done ? done.meta.questionsForUser : [],
                  streaming: !done,
                  error: done?.error,
                };
              }
              // Not responding this round — carry over its last answer.
              const prior = [...rounds].reverse().flatMap((rd) => rd.responses).find((r) => r.id === p.id);
              return {
                id: p.id,
                index,
                name: prior?.name ?? p.name,
                ...personaOf(p),
                prose: prior?.prose ?? "",
                confidence: prior?.meta.confidence ?? null,
                challenges: [],
                questionsForUser: [],
                streaming: false,
                settled: true,
              };
            })}
            defaultOpen={[]}
          />
        </section>
      )}
    </div>
  );
}
