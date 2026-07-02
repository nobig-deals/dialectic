// Shared types for the multi-model debate workbench.

/** A model available on OpenRouter (trimmed to what the UI needs). */
export type OpenRouterModel = {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  promptPrice?: string; // USD per input token (string, as returned)
  completionPrice?: string; // USD per output token
  intelligence?: number; // Artificial Analysis intelligence index, when available
  created?: number; // unix seconds
};

/** A skills.sh skill resolved to its SKILL.md content, attached to a persona. */
export type AttachedSkill = {
  /** Catalogue id: "{source}/{skillId}", e.g. "deanpeters/product-manager-skills/finance-metrics-quickref". */
  id: string;
  /** Short skill name for display. */
  name: string;
  /** Owner/repo the skill lives in, e.g. "deanpeters/product-manager-skills". */
  source: string;
  /** The SKILL.md body (frontmatter stripped), injected into the persona's system prompt. */
  content: string;
};

/** A participant in a debate: a chosen model, optionally given a role persona and skills. */
export type Participant = {
  /** Stable id within a session, e.g. "p0". Used by the moderator to reference models. */
  id: string;
  /** OpenRouter model id, e.g. "openai/gpt-4o". */
  model: string;
  /** Human-readable name for display (the role name when a role is set, else the model name). */
  name: string;
  /** Chosen role preset id (see roles.ts). Undefined = a plain model with no persona. */
  roleId?: string;
  /** Skills attached to this persona, already resolved to their SKILL.md content. */
  skills?: AttachedSkill[];
};

/** A challenge one model raises against another. */
export type Challenge = {
  target: string; // participant id or name the moderator/model addresses
  point: string;
};

/** Parsed metadata block a participant emits after its prose answer. */
export type ParticipantMeta = {
  confidence: number; // 0-100 self-rated confidence this is the best answer
  questionsForUser: string[];
  challenges: Challenge[];
};

/** One participant's full response in a round. */
export type ParticipantResponse = {
  id: string;
  model: string;
  name: string;
  prose: string;
  meta: ParticipantMeta;
  error?: string;
};

/** Parsed metadata block the moderator emits after its synthesis. */
export type ModeratorMeta = {
  activeNext: string[]; // participant ids that should respond next round
  instructions: Record<string, string>; // per-participant focus for next round
  questionsForUser: string[];
  finalize: boolean;
};

/** The moderator's contribution to a round. */
export type ModeratorTurn = {
  summary: string;
  meta: ModeratorMeta;
  error?: string;
};

/** A single round of the debate. */
export type Round = {
  index: number;
  responses: ParticipantResponse[];
  moderator: ModeratorTurn | null;
  /** Answer the user injected when this round paused for input. */
  userAnswer?: string;
};

export type SessionStatus =
  | "idle"
  | "running"
  | "awaiting" // a round finished; waiting for the user to continue / add info / finalize
  | "paused" // models asked the user questions
  | "finalizing"
  | "done"
  | "stopped"
  | "error";

/** What the orchestrator decided after a round completed. */
export type Decision = {
  kind: "pause" | "continue" | "finalize";
  questionsForUser: string[];
  activeNext: string[];
};

/** Request body for POST /api/debate. */
export type DebateRequest = {
  apiKey: string;
  mode: "round" | "final";
  topic: string;
  knowledge: string; // optional reference material the user pasted (e.g. an .md file)
  moderatorModel: string;
  participants: Participant[];
  activeIds: string[];
  threshold: number;
  transcript: Round[];
};

/** SSE event payloads streamed from /api/debate. */
export type DebateEvent =
  | { type: "token"; id: string; text: string }
  | { type: "response-done"; response: ParticipantResponse }
  | { type: "mod-token"; text: string }
  | { type: "moderator"; moderator: ModeratorTurn }
  | { type: "decision"; decision: Decision }
  | { type: "final-token"; text: string }
  | { type: "final-done"; document: string }
  | { type: "error"; id?: string; message: string };
