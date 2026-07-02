// skills.sh integration — server-side only (runs inside route handlers).
//
// Two free, unauthenticated data sources:
//   1. Discovery: https://skills.sh/api/search?q=…  (the /api/v1/* endpoints need a
//      Vercel OIDC token; the plain /api/search one does not).
//   2. Content: skills live in public GitHub repos. Given "{owner}/{repo}/{skillId}"
//      we locate ".../{skillId}/SKILL.md" via the git-trees API and fetch the raw file.
//
// GitHub's unauthenticated API allows only 60 requests/hour, so resolved content is
// cached in-memory per skill id. Set GITHUB_TOKEN to raise the limit.

import type { AttachedSkill } from "./types";

export type SkillSearchResult = {
  id: string; // "{source}/{skillId}"
  name: string;
  source: string; // "{owner}/{repo}"
  installs: number;
};

const SKILLS_SEARCH = "https://skills.sh/api/search";
const GH_API = "https://api.github.com";
const GH_RAW = "https://raw.githubusercontent.com";

/** Max SKILL.md size we keep, to bound token cost injected into every prompt. */
export const MAX_SKILL_CHARS = 12_000;

function ghHeaders(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "dialectic-debate",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** Search the skills.sh catalogue. Throws on network / non-OK response. */
export async function searchSkills(query: string): Promise<SkillSearchResult[]> {
  const url = `${SKILLS_SEARCH}?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`skills.sh search ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { skills?: RawSkill[] };
  return (json.skills ?? []).map((s) => ({
    id: s.id,
    name: s.name ?? s.skillId ?? s.id,
    source: s.source ?? "",
    installs: typeof s.installs === "number" ? s.installs : 0,
  }));
}

type RawSkill = {
  id: string;
  skillId?: string;
  name?: string;
  source?: string;
  installs?: number;
};

/** Split "{owner}/{repo}/{skillId…}" into its repo and skill parts. */
export function splitSkillId(id: string): { source: string; skillId: string } | null {
  const parts = id.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  return { source: `${parts[0]}/${parts[1]}`, skillId: parts.slice(2).join("/") };
}

/** Pick the SKILL.md path for a skill from a repo's file list (pure, testable). */
export function matchSkillPath(paths: string[], skillId: string): string | null {
  const leaf = skillId.split("/").pop() ?? skillId;
  const md = paths.filter((p) => /(^|\/)SKILL\.md$/i.test(p));
  // Prefer the file whose parent directory is exactly the skill's leaf name.
  const exact = md.find((p) => p.toLowerCase().endsWith(`/${leaf.toLowerCase()}/skill.md`));
  if (exact) return exact;
  // Fall back to any path containing the skill id, then the sole SKILL.md if unique.
  const contains = md.find((p) => p.toLowerCase().includes(leaf.toLowerCase()));
  if (contains) return contains;
  return md.length === 1 ? md[0] : null;
}

/** Strip a leading YAML frontmatter block and trim (pure, testable). */
export function stripFrontmatter(md: string): string {
  const m = /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md);
  return (m ? md.slice(m[0].length) : md).trim();
}

const contentCache = new Map<string, AttachedSkill>();

/** Resolve a skill id to its SKILL.md content. Cached in-memory per id. */
export async function resolveSkillContent(id: string): Promise<AttachedSkill> {
  const cached = contentCache.get(id);
  if (cached) return cached;

  const parts = splitSkillId(id);
  if (!parts) throw new Error(`Bad skill id: ${id}`);
  const { source, skillId } = parts;

  // 1. Default branch.
  const repoRes = await fetch(`${GH_API}/repos/${source}`, { headers: ghHeaders() });
  if (!repoRes.ok) throw new Error(`GitHub repo ${source} ${repoRes.status}`);
  const branch = ((await repoRes.json()) as { default_branch?: string }).default_branch ?? "main";

  // 2. File tree → SKILL.md path.
  const treeRes = await fetch(
    `${GH_API}/repos/${source}/git/trees/${branch}?recursive=1`,
    { headers: ghHeaders() },
  );
  if (!treeRes.ok) throw new Error(`GitHub tree ${source} ${treeRes.status}`);
  const tree = (await treeRes.json()) as { tree?: { path: string; type: string }[] };
  const paths = (tree.tree ?? []).filter((n) => n.type === "blob").map((n) => n.path);
  const path = matchSkillPath(paths, skillId);
  if (!path) throw new Error(`No SKILL.md found for ${id}`);

  // 3. Raw content.
  const rawRes = await fetch(`${GH_RAW}/${source}/${branch}/${path}`);
  if (!rawRes.ok) throw new Error(`GitHub raw ${path} ${rawRes.status}`);
  const body = stripFrontmatter(await rawRes.text());
  const content =
    body.length > MAX_SKILL_CHARS ? `${body.slice(0, MAX_SKILL_CHARS)}\n\n…[truncated]` : body;

  const skill: AttachedSkill = {
    id,
    name: skillId.split("/").pop() ?? skillId,
    source,
    content,
  };
  contentCache.set(id, skill);
  return skill;
}
