// Thin OpenRouter client. One purpose: talk to OpenRouter.
// Runs server-side (inside route handlers) so the user's key never hits the wire from the browser.

import type { OpenRouterModel } from "./types";

const BASE = "https://openrouter.ai/api/v1";

/** Client-provided key, falling back to the server-configured one (OPENROUTER_API_KEY). */
export function resolveApiKey(clientKey?: string | null): string {
  return clientKey || process.env.OPENROUTER_API_KEY || "";
}

function headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://dialectic.local",
    "X-Title": "Dialectic",
  };
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Fetch the catalogue of available models. */
export async function listModels(apiKey: string): Promise<OpenRouterModel[]> {
  const res = await fetch(`${BASE}/models`, { headers: headers(apiKey) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter /models ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data: RawModel[] };
  return json.data.map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    description: m.description,
    contextLength: m.context_length,
    promptPrice: m.pricing?.prompt,
    completionPrice: m.pricing?.completion,
    intelligence: m.benchmarks?.artificial_analysis?.intelligence_index,
    created: m.created,
  }));
}

type RawModel = {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  created?: number;
  pricing?: { prompt?: string; completion?: string };
  benchmarks?: { artificial_analysis?: { intelligence_index?: number } };
};

/**
 * Stream a chat completion token-by-token.
 * Yields content deltas as they arrive. Throws on transport / auth errors.
 */
export async function* streamChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: headers(apiKey),
    signal,
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter chat ${res.status}: ${body.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // OpenRouter streams SSE: lines of "data: {json}\n\n", terminated by "data: [DONE]".
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta: string | undefined = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // A complete data: line carries complete JSON; a malformed one is noise — skip it.
        // Partial lines split across network chunks are held back by the indexOf("\n") guard above.
      }
    }
  }
}
