import { NextRequest, NextResponse } from "next/server";
import { searchSkills } from "@/lib/skills";

export const runtime = "nodejs";

// GET /api/skills/search?q=… — proxy the free skills.sh catalogue search.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ skills: [] });
  try {
    const skills = await searchSkills(q);
    return NextResponse.json({ skills });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Skill search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
