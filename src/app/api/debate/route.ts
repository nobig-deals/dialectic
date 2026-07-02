import { NextRequest } from "next/server";
import { resolveApiKey, streamChat } from "@/lib/openrouter";
import {
  buildParticipantPrompt,
  buildModeratorPrompt,
  buildFinalPrompt,
  parseParticipant,
  parseModerator,
} from "@/lib/protocol";
import { decide } from "@/lib/orchestrator";
import type {
  DebateRequest,
  DebateEvent,
  Participant,
  ParticipantResponse,
  Round,
  ModeratorTurn,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/debate — run one round (or the final document) and stream events as SSE.
export async function POST(req: NextRequest) {
  let body: DebateRequest;
  try {
    body = (await req.json()) as DebateRequest;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { mode, topic, knowledge, moderatorModel, participants, activeIds, threshold, transcript } = body;

  const apiKey = resolveApiKey(body.apiKey);
  if (!apiKey) return new Response("Missing API key", { status: 400 });
  if (!participants?.length) return new Response("No participants", { status: 400 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: DebateEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const moderatorName =
        participants.find((p) => p.model === moderatorModel)?.name ?? "Moderator";

      try {
        if (mode === "final") {
          await runFinal();
        } else {
          await runRound();
        }
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Unexpected error",
        });
      } finally {
        close();
      }

      // ── Run a single debate round ──────────────────────────────────────────
      async function runRound() {
        const active: Participant[] =
          activeIds?.length
            ? participants.filter((p) => activeIds.includes(p.id))
            : participants;
        const roster = active.length ? active : participants;

        const lastMod = transcript[transcript.length - 1]?.moderator;
        const instructions = lastMod?.meta.instructions ?? {};

        // Fire every active participant concurrently; tokens interleave, tagged by id.
        const settled = await Promise.all(
          roster.map((p) =>
            streamParticipant(p, instructions[p.id]).catch(
              (err): ParticipantResponse => {
                const message = err instanceof Error ? err.message : "Model error";
                send({ type: "error", id: p.id, message });
                return {
                  id: p.id,
                  model: p.model,
                  name: p.name,
                  prose: "",
                  meta: { confidence: 0, questionsForUser: [], challenges: [] },
                  error: message,
                };
              },
            ),
          ),
        );

        const round: Round = {
          index: transcript.length,
          responses: settled,
          moderator: null,
        };

        // Moderator reviews the round.
        const transcriptWithRound = [...transcript, round];
        try {
          const moderator = await streamModerator(transcriptWithRound);
          round.moderator = moderator;
        } catch (err) {
          send({
            type: "error",
            message:
              "Moderator failed: " +
              (err instanceof Error ? err.message : "unknown"),
          });
          round.moderator = null;
        }

        const decision = decide({ round, participants, threshold });
        send({ type: "decision", decision });
      }

      async function streamParticipant(
        p: Participant,
        instruction: string | undefined,
      ): Promise<ParticipantResponse> {
        const messages = buildParticipantPrompt({
          participant: p,
          participants,
          topic,
          knowledge,
          transcript,
          instruction,
        });
        let text = "";
        for await (const delta of streamChat(apiKey, p.model, messages, req.signal)) {
          text += delta;
          send({ type: "token", id: p.id, text: delta });
        }
        const { prose, meta } = parseParticipant(text);
        const response: ParticipantResponse = {
          id: p.id,
          model: p.model,
          name: p.name,
          prose,
          meta,
        };
        send({ type: "response-done", response });
        return response;
      }

      async function streamModerator(fullTranscript: Round[]): Promise<ModeratorTurn> {
        const messages = buildModeratorPrompt({
          moderatorName,
          participants,
          topic,
          knowledge,
          transcript: fullTranscript,
          threshold,
        });
        let text = "";
        for await (const delta of streamChat(apiKey, moderatorModel, messages, req.signal)) {
          text += delta;
          send({ type: "mod-token", text: delta });
        }
        const { summary, meta } = parseModerator(text, participants);
        const turn: ModeratorTurn = { summary, meta };
        send({ type: "moderator", moderator: turn });
        return turn;
      }

      // ── Write the final consolidated document ──────────────────────────────
      async function runFinal() {
        const messages = buildFinalPrompt({
          moderatorName,
          participants,
          topic,
          knowledge,
          transcript,
        });
        let text = "";
        for await (const delta of streamChat(apiKey, moderatorModel, messages, req.signal)) {
          text += delta;
          send({ type: "final-token", text: delta });
        }
        send({ type: "final-done", document: text.trim() });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
