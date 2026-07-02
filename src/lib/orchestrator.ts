// Pure decision logic: given a completed round, decide what happens next.
// No IO, no model calls — just the rules of the debate.

import type { Decision, Participant, Round } from "./types";

/** De-duplicate strings, ignoring case and surrounding whitespace; keep first-seen wording. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of items) {
    const key = q.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q.trim());
  }
  return out;
}

/** Collect the ids/names a round's challenges are aimed at. */
function challengedTargets(round: Round, participants: Participant[]): Set<string> {
  const out = new Set<string>();
  for (const r of round.responses) {
    for (const c of r.meta.challenges) {
      const t = c.target.trim();
      // Target may be an id ("p1") or a name — resolve both to the participant id.
      const byId = participants.find((p) => p.id === t);
      const byName = participants.find(
        (p) => p.name.toLowerCase() === t.toLowerCase(),
      );
      const id = byId?.id ?? byName?.id;
      if (id) out.add(id);
    }
  }
  return out;
}

/**
 * Decide the next step after a round.
 * Precedence: pause for the user first, then finalize, then continue.
 */
export function decide(args: {
  round: Round;
  participants: Participant[];
  threshold: number;
}): Decision {
  const { round, participants, threshold } = args;

  // 1. Questions for the user. The moderator's job is to merge + de-duplicate the
  //    models' questions into one clean list — so trust it when it produced any.
  //    Only fall back to the union of raw model questions if there's no moderator
  //    or the moderator surfaced none.
  const modQuestions = round.moderator?.meta.questionsForUser ?? [];
  const questionsForUser =
    modQuestions.length > 0
      ? dedupe(modQuestions)
      : dedupe(round.responses.flatMap((r) => r.meta.questionsForUser));

  // 2. Work out who should respond next round.
  const challenged = challengedTargets(round, participants);
  const fallbackActive = round.responses
    .filter((r) => r.meta.confidence < threshold || challenged.has(r.id))
    .map((r) => r.id);

  // Trust the moderator's call when present; otherwise fall back to confidence + challenges.
  const mod = round.moderator;
  const base = mod ? mod.meta.activeNext : fallbackActive;

  // Always re-engage models that errored or didn't finish — give them another shot.
  const errored = round.responses.filter((r) => r.error).map((r) => r.id);
  const activeNext = [...new Set([...base, ...errored])];

  // 3. Choose the action.
  if (questionsForUser.length > 0) {
    return { kind: "pause", questionsForUser, activeNext };
  }

  const converged = activeNext.length === 0;
  const finalize = (mod?.meta.finalize ?? false) || converged;
  if (finalize) {
    return { kind: "finalize", questionsForUser: [], activeNext: [] };
  }

  return { kind: "continue", questionsForUser: [], activeNext };
}
