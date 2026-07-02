"use client";

import { useCallback, useRef, useState } from "react";
import { splitMeta } from "./protocol";
import type {
  DebateEvent,
  DebateRequest,
  Decision,
  ModeratorTurn,
  Participant,
  ParticipantResponse,
  Round,
  SessionStatus,
} from "./types";

/** Config captured when a debate starts. */
export type DebateConfig = {
  apiKey: string;
  topic: string;
  knowledge: string;
  participants: Participant[];
  moderatorModel: string;
  threshold: number;
};

/** Live buffers for the round currently streaming. */
export type LiveRound = {
  index: number;
  activeIds: string[];
  raw: Record<string, string>; // per-participant raw token buffer
  done: Record<string, ParticipantResponse>; // parsed responses as they land
  modText: string;
  moderator: ModeratorTurn | null;
};

export type Session = {
  status: SessionStatus;
  config: DebateConfig | null;
  rounds: Round[];
  live: LiveRound | null;
  pendingQuestions: string[];
  nextActive: string[]; // participant ids that will respond on the next round
  suggestFinalize: boolean; // moderator judged the debate converged
  finalDoc: string;
  error: string | null;
};

const initial: Session = {
  status: "idle",
  config: null,
  rounds: [],
  live: null,
  pendingQuestions: [],
  nextActive: [],
  suggestFinalize: false,
  finalDoc: "",
  error: null,
};

/** The visible prose for a participant mid-stream: parsed if done, else raw minus meta tail. */
export function liveProse(live: LiveRound, id: string): string {
  const done = live.done[id];
  if (done) return done.prose;
  return splitMeta(live.raw[id] ?? "").prose;
}

export function useDebate() {
  const [session, setSessionState] = useState<Session>(initial);
  const ref = useRef<Session>(session);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  const resumeActiveRef = useRef<string[]>([]);

  // ref.current is the synchronous source of truth: the async round loop reads it
  // immediately after committing a round, so it must update before React re-renders.
  const setSession = useCallback(
    (updater: Session | ((prev: Session) => Session)) => {
      const next =
        typeof updater === "function" ? (updater as (p: Session) => Session)(ref.current) : updater;
      ref.current = next;
      setSessionState(next);
    },
    [],
  );

  /** Stream one round, mutate live state, return the orchestrator's decision (or null if aborted). */
  const runRound = useCallback(
    async (activeIds: string[]): Promise<Decision | null> => {
      const cfg = ref.current.config!;
      const index = ref.current.rounds.length;

      setSession((s) => ({
        ...s,
        status: "running",
        error: null,
        live: { index, activeIds, raw: {}, done: {}, modText: "", moderator: null },
      }));

      const payload: DebateRequest = {
        apiKey: cfg.apiKey,
        mode: "round",
        topic: cfg.topic,
      knowledge: cfg.knowledge,
        moderatorModel: cfg.moderatorModel,
        participants: cfg.participants,
        activeIds,
        threshold: cfg.threshold,
        transcript: ref.current.rounds,
      };

      let decision: Decision | null = null;

      await streamEvents(payload, abortRef.current!.signal, (ev) => {
        switch (ev.type) {
          case "token":
            setSession((s) =>
              s.live
                ? { ...s, live: { ...s.live, raw: { ...s.live.raw, [ev.id]: (s.live.raw[ev.id] ?? "") + ev.text } } }
                : s,
            );
            break;
          case "response-done":
            setSession((s) =>
              s.live ? { ...s, live: { ...s.live, done: { ...s.live.done, [ev.response.id]: ev.response } } } : s,
            );
            break;
          case "mod-token":
            setSession((s) => (s.live ? { ...s, live: { ...s.live, modText: s.live.modText + ev.text } } : s));
            break;
          case "moderator":
            setSession((s) => (s.live ? { ...s, live: { ...s.live, moderator: ev.moderator } } : s));
            break;
          case "decision":
            decision = ev.decision;
            break;
          case "error":
            setSession((s) => ({ ...s, error: ev.message }));
            break;
        }
      });

      // Assemble the finished round from live buffers and commit it.
      const live = ref.current.live;
      if (live) {
        const responses: ParticipantResponse[] = live.activeIds.map(
          (id) =>
            live.done[id] ?? {
              id,
              model: cfg.participants.find((p) => p.id === id)?.model ?? "",
              name: cfg.participants.find((p) => p.id === id)?.name ?? id,
              prose: splitMeta(live.raw[id] ?? "").prose,
              meta: { confidence: 0, questionsForUser: [], challenges: [] },
              error: "incomplete",
            },
        );
        const round: Round = { index: live.index, responses, moderator: live.moderator };
        setSession((s) => ({ ...s, rounds: [...s.rounds, round], live: null }));
      }

      return decision;
    },
    [setSession],
  );

  const runFinal = useCallback(async () => {
    const cfg = ref.current.config!;
    setSession((s) => ({ ...s, status: "finalizing", finalDoc: "", error: null }));
    const payload: DebateRequest = {
      apiKey: cfg.apiKey,
      mode: "final",
      topic: cfg.topic,
      knowledge: cfg.knowledge,
      moderatorModel: cfg.moderatorModel,
      participants: cfg.participants,
      activeIds: [],
      threshold: cfg.threshold,
      transcript: ref.current.rounds,
    };
    await streamEvents(payload, abortRef.current!.signal, (ev) => {
      if (ev.type === "final-token") setSession((s) => ({ ...s, finalDoc: s.finalDoc + ev.text }));
      else if (ev.type === "final-done") setSession((s) => ({ ...s, finalDoc: ev.document }));
      else if (ev.type === "error") setSession((s) => ({ ...s, error: ev.message }));
    });
    setSession((s) => ({ ...s, status: "done" }));
  }, [setSession]);

  const allIds = useCallback(() => ref.current.config?.participants.map((p) => p.id) ?? [], []);

  /** After a round completes, settle into a manual wait state (never auto-advance). */
  const applyDecision = useCallback(
    (decision: Decision | null) => {
      if (!decision) return;
      if (decision.kind === "pause") {
        resumeActiveRef.current = decision.activeNext.length ? decision.activeNext : allIds();
        setSession((s) => ({
          ...s,
          status: "paused",
          pendingQuestions: decision.questionsForUser,
          nextActive: resumeActiveRef.current,
          suggestFinalize: false,
        }));
        return;
      }
      // Both "continue" and "finalize" now stop and wait for the user.
      setSession((s) => ({
        ...s,
        status: "awaiting",
        pendingQuestions: [],
        nextActive: decision.activeNext,
        suggestFinalize: decision.kind === "finalize",
      }));
    },
    [allIds, setSession],
  );

  /** Run exactly one round with the given active set, then wait for the user. */
  const runStep = useCallback(
    async (activeIds: string[]) => {
      stoppedRef.current = false;
      if (!abortRef.current || abortRef.current.signal.aborted) abortRef.current = new AbortController();
      try {
        const decision = await runRound(activeIds.length ? activeIds : allIds());
        if (stoppedRef.current) return;
        applyDecision(decision);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setSession((s) => ({ ...s, status: "error", error: (err as Error)?.message ?? "Failed" }));
      }
    },
    [runRound, applyDecision, allIds, setSession],
  );

  const start = useCallback(
    (config: DebateConfig) => {
      stoppedRef.current = false;
      abortRef.current = new AbortController();
      setSession({ ...initial, status: "running", config });
      void runStep(config.participants.map((p) => p.id));
    },
    [runStep, setSession],
  );

  /** Run the next round with the moderator's suggested active set. */
  const continueRound = useCallback(() => {
    const ids = ref.current.nextActive.length ? ref.current.nextActive : allIds();
    void runStep(ids);
  }, [runStep, allIds]);

  /** Attach a note to the transcript and run a round with everyone re-engaged. */
  const attachNote = useCallback(
    (label: string, text: string) => {
      setSession((s) => {
        const rounds = s.rounds.slice();
        if (rounds.length) {
          const last = rounds[rounds.length - 1];
          const note = `${label}${text}`;
          rounds[rounds.length - 1] = {
            ...last,
            userAnswer: [last.userAnswer, note].filter(Boolean).join("\n\n"),
          };
        }
        return { ...s, rounds };
      });
    },
    [setSession],
  );

  /** Submit answers to the paused questions and run the next round. */
  const answer = useCallback(
    (text: string) => {
      attachNote("", text);
      void runStep(resumeActiveRef.current.length ? resumeActiveRef.current : allIds());
    },
    [attachNote, runStep, allIds],
  );

  /** Inject new info / a fresh challenge, then run a round with everyone re-engaged. */
  const interject = useCallback(
    (text: string) => {
      attachNote("New instruction from the user: ", text);
      void runStep(allIds());
    },
    [attachNote, runStep, allIds],
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
    // A stopped round keeps whatever committed; drop the in-flight live buffers.
    setSession((s) => ({ ...s, status: "stopped", live: null }));
  }, [setSession]);

  const finalizeNow = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    stoppedRef.current = false;
    void runFinal().catch((err) => {
      if ((err as Error)?.name !== "AbortError")
        setSession((s) => ({ ...s, status: "error", error: (err as Error)?.message ?? "Failed" }));
    });
  }, [runFinal, setSession]);

  const reset = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
    setSession(initial);
  }, [setSession]);

  return { session, start, stop, answer, interject, continueRound, finalizeNow, reset };
}

/** POST to /api/debate and dispatch each SSE event to the handler. */
async function streamEvents(
  payload: DebateRequest,
  signal: AbortSignal,
  onEvent: (ev: DebateEvent) => void,
) {
  const res = await fetch("/api/debate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => "Request failed");
    onEvent({ type: "error", message: msg || `HTTP ${res.status}` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as DebateEvent);
      } catch {
        /* ignore malformed event */
      }
    }
  }
}
