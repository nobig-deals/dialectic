import { NextRequest, NextResponse } from "next/server";
import { listModels } from "@/lib/openrouter";

export const runtime = "nodejs";

// GET /api/models — proxy the OpenRouter model catalogue using the caller's key.
export async function GET(req: NextRequest) {
  const apiKey =
    req.headers.get("x-openrouter-key") ??
    req.nextUrl.searchParams.get("key") ??
    "";
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
