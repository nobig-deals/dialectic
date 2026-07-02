// The debate protocol: how we prompt models and parse their structured replies.
// Pure functions — no IO — so they're easy to reason about and test.

import type {
  Participant,
  ParticipantMeta,
  ModeratorMeta,
  Round,
} from "./types";
import type { ChatMessage } from "./openrouter";
import { getRole } from "./roles";

export const META_SENTINEL = "<<<META>>>";

/** Coerce a value into an integer within [lo, hi], falling back when not a finite number. */
function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** Extract the first balanced {...} JSON object from a string, or null. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Split a model reply into the visible prose and the trailing metadata text. */
export function splitMeta(text: string): { prose: string; metaText: string } {
  const idx = text.lastIndexOf(META_SENTINEL);
  if (idx === -1) return { prose: text.trim(), metaText: "" };
  return {
    prose: text.slice(0, idx).trim(),
    metaText: text.slice(idx + META_SENTINEL.length).trim(),
  };
}

/** Parse a participant's reply into prose + structured meta (with safe fallbacks). */
export function parseParticipant(text: string): { prose: string; meta: ParticipantMeta } {
  const { prose, metaText } = splitMeta(text);
  const fallback: ParticipantMeta = { confidence: 50, questionsForUser: [], challenges: [] };
  const jsonStr = extractJsonObject(metaText);
  if (!jsonStr) return { prose, meta: fallback };
  try {
    const raw = JSON.parse(jsonStr);
    return {
      prose,
      meta: {
        confidence: clamp(raw.confidence, 0, 100, 50),
        questionsForUser: toStringArray(raw.questionsForUser),
        challenges: Array.isArray(raw.challenges)
          ? raw.challenges
              .map((c: unknown) => {
                const o = (c ?? {}) as Record<string, unknown>;
                return { target: String(o.target ?? ""), point: String(o.point ?? "") };
              })
              .filter((c: { point: string }) => c.point.length > 0)
          : [],
      },
    };
  } catch {
    return { prose, meta: fallback };
  }
}

/** Parse the moderator's reply into summary + structured meta (with safe fallbacks). */
export function parseModerator(
  text: string,
  participants: Participant[],
): { summary: string; meta: ModeratorMeta } {
  const { prose, metaText } = splitMeta(text);
  const allIds = participants.map((p) => p.id);
  const fallback: ModeratorMeta = {
    activeNext: allIds,
    instructions: {},
    questionsForUser: [],
    finalize: false,
  };
  const jsonStr = extractJsonObject(metaText);
  if (!jsonStr) return { summary: prose, meta: fallback };
  try {
    const raw = JSON.parse(jsonStr);
    const activeNext = toStringArray(raw.activeNext).filter((id) => allIds.includes(id));
    const instructions: Record<string, string> = {};
    if (raw.instructions && typeof raw.instructions === "object") {
      for (const [k, v] of Object.entries(raw.instructions)) {
        if (allIds.includes(k)) instructions[k] = String(v);
      }
    }
    return {
      summary: prose,
      meta: {
        activeNext,
        instructions,
        questionsForUser: toStringArray(raw.questionsForUser),
        finalize: Boolean(raw.finalize),
      },
    };
  } catch {
    return { summary: prose, meta: fallback };
  }
}

/** Coerce one item to a string — models sometimes wrap questions in objects. */
function coerceString(x: unknown): string {
  if (typeof x === "string") return x.trim();
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const field = o.question ?? o.text ?? o.q ?? o.value ?? o.prompt;
    if (typeof field === "string") return field.trim();
  }
  return "";
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(coerceString).filter((x) => x.length > 0);
}

// ── Prompt builders ──────────────────────────────────────────────────────────

function roster(participants: Participant[]): string {
  return participants
    .map((p) => {
      const role = getRole(p.roleId);
      const label = role ? `"${p.name}" — ${role.name}` : `"${p.name}"`;
      return `- ${p.id} = ${label} (${p.model})`;
    })
    .join("\n");
}

/**
 * The persona preamble for a participant: its role point-of-view plus any attached
 * skills, rendered as prompt text. Empty string for a plain model with neither.
 */
export function personaBlock(participant: Participant): string {
  const role = getRole(participant.roleId);
  const skills = participant.skills ?? [];
  if (!role && skills.length === 0) return "";

  const parts: string[] = [];
  if (role) parts.push(`Your role in this debate: ${role.name}.\n${role.persona}`);
  if (skills.length) {
    const rendered = skills
      .map((s) => `### Skill: ${s.name}\n${s.content}`)
      .join("\n\n");
    parts.push(
      `You have been equipped with the following skill${skills.length > 1 ? "s" : ""}. ` +
        `Apply their guidance where relevant:\n\n${rendered}`,
    );
  }
  return parts.join("\n\n");
}

/** Reference material the user pasted, rendered as a prompt block (empty string if none). */
function knowledgeBlock(knowledge?: string): string {
  const k = knowledge?.trim();
  if (!k) return "";
  return `\nBACKGROUND KNOWLEDGE (reference material provided by the user — treat as authoritative context):\n"""\n${k}\n"""\n`;
}

/** Render prior rounds as plain text context for a model. */
function transcriptText(transcript: Round[]): string {
  if (transcript.length === 0) return "(no prior rounds)";
  return transcript
    .map((r) => {
      const parts = r.responses
        .map(
          (resp) =>
            `[${resp.id} · ${resp.name}] (confidence ${resp.meta.confidence})\n${resp.prose}`,
        )
        .join("\n\n");
      const mod = r.moderator
        ? `\n[MODERATOR SUMMARY]\n${r.moderator.summary}`
        : "";
      const ua = r.userAnswer
        ? `\n[USER REPLIED]\n${r.userAnswer}`
        : "";
      return `===== ROUND ${r.index + 1} =====\n${parts}${mod}${ua}`;
    })
    .join("\n\n");
}

const PARTICIPANT_META_SPEC = `When finished, output a line containing exactly ${META_SENTINEL} and then a JSON object:
{
  "confidence": <0-100 integer — how confident you are this is the best possible answer>,
  "questionsForUser": [<questions you genuinely need the human to answer before you can improve; empty if none>],
  "challenges": [{ "target": "<participant id like p1>", "point": "<a specific disagreement or flaw in their answer>" }]
}
Only ask questionsForUser for things ONLY the human can decide (preferences, missing facts, constraints). Do not ask the other models via questionsForUser.`;

/** First-round prompt for a participant. */
export function buildParticipantPrompt(args: {
  participant: Participant;
  participants: Participant[];
  topic: string;
  knowledge?: string;
  transcript: Round[];
  instruction?: string;
}): ChatMessage[] {
  const { participant, participants, topic, knowledge, transcript, instruction } = args;
  const isFirst = transcript.length === 0;

  const persona = personaBlock(participant);

  const system = `You are ${participant.name} (id ${participant.id}), one of several AI models collaborating AND competing to produce the best possible answer to the user's topic.
${persona ? `\n${persona}\n` : ""}
Roster:
${roster(participants)}

Rules:
- Give your strongest, most useful answer in clear Markdown prose.
- ${isFirst ? "This is round 1 — answer the topic directly." : "This is a later round. Read the prior rounds and other models' answers. Build on what is good, push back on what is weak, and improve your own position. Be specific and intellectually honest — concede points when others are right."}
- Challenge other models by name where you disagree. Rigorous debate produces better answers.
- Rate your own confidence honestly. Only claim high confidence when the answer is genuinely complete.

${PARTICIPANT_META_SPEC}`;

  const user = `TOPIC:
${topic}
${knowledgeBlock(knowledge)}
PRIOR DISCUSSION:
${transcriptText(transcript)}
${instruction ? `\nMODERATOR'S INSTRUCTION FOR YOU THIS ROUND:\n${instruction}` : ""}

Now give your ${isFirst ? "" : "updated "}answer, then the ${META_SENTINEL} block.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

const MODERATOR_META_SPEC = `After your synthesis, output a line containing exactly ${META_SENTINEL} and then a JSON object:
{
  "activeNext": [<participant ids that should respond again next round — those who are not yet confident, disagree, or were challenged. Empty array if the debate is settled.>],
  "instructions": { "<participant id>": "<one concrete thing they should address next round>" },
  "questionsForUser": [<merged, de-duplicated questions the models need the human to answer; empty if none>],
  "finalize": <true if the debate has converged and we should write the final document, otherwise false>
}`;

/** Prompt for the moderator after a round of participant answers. */
export function buildModeratorPrompt(args: {
  moderatorName: string;
  participants: Participant[];
  topic: string;
  knowledge?: string;
  transcript: Round[];
  threshold: number;
}): ChatMessage[] {
  const { moderatorName, participants, topic, knowledge, transcript, threshold } = args;
  const current = transcript[transcript.length - 1];
  const answers = current.responses
    .map(
      (r) =>
        `[${r.id} · ${r.name}] confidence=${r.meta.confidence}\n${r.prose}\n` +
        (r.meta.challenges.length
          ? `challenges: ${r.meta.challenges
              .map((c) => `${c.target}: ${c.point}`)
              .join("; ")}\n`
          : "") +
        (r.meta.questionsForUser.length
          ? `questionsForUser: ${r.meta.questionsForUser.join(" | ")}\n`
          : ""),
    )
    .join("\n");

  const system = `You are ${moderatorName}, the moderator of a multi-model debate. You do not give your own answer to the topic. Your job:
1. Synthesize the current round: where models agree, where they conflict, what's still unresolved.
2. Decide who needs to keep going. A model is "done" when its confidence is >= ${threshold} AND nobody has a live challenge against it. The debate can narrow to just the models still in disagreement — even down to two.
3. Surface any questions the models need the human to answer (merge duplicates).
4. Decide whether to finalize: set finalize=true only when the discussion has converged and further rounds would add little.

Roster:
${roster(participants)}

${MODERATOR_META_SPEC}`;

  const user = `TOPIC:
${topic}
${knowledgeBlock(knowledge)}
FULL HISTORY:
${transcriptText(transcript.slice(0, -1))}

THIS ROUND'S ANSWERS:
${answers}

Confidence threshold for "done": ${threshold}.

Write a concise synthesis of this round, then the ${META_SENTINEL} block.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Prompt for the moderator to write the final consolidated document. */
export function buildFinalPrompt(args: {
  moderatorName: string;
  participants: Participant[];
  topic: string;
  knowledge?: string;
  transcript: Round[];
}): ChatMessage[] {
  const { moderatorName, topic, knowledge, transcript } = args;
  const system = `You are ${moderatorName}. The debate is complete. Write the FINAL DOCUMENT: a single, polished, self-contained answer to the user's topic that integrates the best reasoning from all models and resolves the disagreements.

Guidelines:
- Lead with a direct answer / executive summary.
- Use clear Markdown structure (headings, lists, tables where useful).
- Incorporate the strongest points; note any genuine open trade-offs honestly.
- Do NOT mention the debate process, model ids, or confidence scores. Write for the end user.
- Do NOT output a ${META_SENTINEL} block this time — just the document.`;

  const user = `TOPIC:
${topic}
${knowledgeBlock(knowledge)}
FULL DEBATE TRANSCRIPT:
${transcriptText(transcript)}

Write the final document now.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
