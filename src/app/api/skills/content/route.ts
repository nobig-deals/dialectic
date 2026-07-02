import { NextRequest, NextResponse } from "next/server";
import { resolveSkillContent } from "@/lib/skills";

export const runtime = "nodejs";

// GET /api/skills/content?id={source}/{skillId} — resolve a skill to its SKILL.md.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "Missing skill id" }, { status: 400 });
  try {
    const skill = await resolveSkillContent(id);
    return NextResponse.json({ skill });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch skill";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
