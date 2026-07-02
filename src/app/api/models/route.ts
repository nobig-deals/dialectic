import { NextRequest, NextResponse } from "next/server";
import { listModels, resolveApiKey } from "@/lib/openrouter";

export const runtime = "nodejs";

// GET /api/models — proxy the OpenRouter model catalogue using the caller's key
// (or the server's OPENROUTER_API_KEY when the caller sends none).
export async function GET(req: NextRequest) {
  const apiKey = resolveApiKey(
    req.headers.get("x-openrouter-key") ?? req.nextUrl.searchParams.get("key"),
  );
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 400 });
  }
  try {
    const models = await listModels(apiKey);
    return NextResponse.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load models";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
