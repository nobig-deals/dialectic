# Dialectic

**Local-first, open-source multi-model LLM debate orchestrator.**

_Thesis. Antithesis. Synthesis. In one tool._

Drop an idea, pick 2–10 models from OpenRouter, and let them debate it. Each round every
active model answers and rates its own confidence (0–100); a moderator model synthesizes the
round, decides who keeps going (confident + unchallenged models drop out — the field can
narrow to two), pauses to ask you when the models need input, and writes the final **MMDD**
(Multi-Model Debate Document) when the debate converges.

Dialectic isn't another multi-chat. It's a sandbox for running an actual dialectic between
models — adversarial rounds in, one carefully synthesized document out.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000, paste your **OpenRouter API key** (get one at
[openrouter.ai/keys](https://openrouter.ai/keys)), click **Load models**, pick your
participants + moderator, set the confidence threshold, write your topic, and **Start debate**.

The key is stored only in your browser (`localStorage`) and is sent straight to OpenRouter
through the app's API routes — never persisted or logged server-side.

## Personas: roles and skills

Each participant can be more than a bare model — give it a **role** and **skills**:

- **Role** — pick a preset persona (CFO, CEO, CTO, Legal Counsel, Board Member…) from the
  dropdown under each model. The role's point of view is injected into that model's system
  prompt and shown to the others in the roster, so you can run a boardroom-style debate.
- **Skills** — search the [skills.sh](https://skills.sh) catalogue and attach one or more
  skills to a persona. The skill's `SKILL.md` is fetched and prepended to the model's prompt.
  Hover an attached skill to preview its content.

Roles live in `src/lib/roles.ts` (pure preset data). Skills use the **free**, no-token path:
`https://skills.sh/api/search` for discovery and public GitHub raw for content — no Vercel
OIDC token needed. Both go through server proxy routes (`/api/skills/*`) which cache resolved
content in-memory (GitHub's unauthenticated API allows 60 req/hr; set `GITHUB_TOKEN` to raise
it). Skill content is resolved once when you add a skill and stored with the debate config, so
running a debate needs no further network calls.

## How it works

Models emit prose, then a `<<<META>>>` block of JSON (`confidence`, `questionsForUser`,
`challenges`). Prose streams live; the meta block is parsed when each reply completes. The
orchestrator then decides: pause (questions for you) → finalize (converged) → continue (next
active set).

- `src/lib/openrouter.ts` — thin OpenRouter client: `listModels` + token-streaming `streamChat`.
- `src/lib/roles.ts` — curated role presets (`{ id, name, persona }`), injected by `protocol.ts`.
- `src/lib/skills.ts` — skills.sh search + GitHub `SKILL.md` resolution (pure `matchSkillPath` /
  `stripFrontmatter` helpers + cached `resolveSkillContent`), used by `/api/skills/*` routes.
- `src/lib/protocol.ts` — pure prompt builders + reply parsing (the `<<<META>>>` protocol).
- `src/lib/orchestrator.ts` — pure decision logic: pause → finalize → continue.
- `src/app/api/debate/route.ts` — runs one round (all active models concurrently) + the
  moderator, or the final document, streaming everything as SSE tagged per model.
- `src/lib/use-debate.ts` — client hook driving the round loop, stop / resume-with-answer /
  interject / finalize-now.

## Controls

- **Stop** — halt mid-round.
- **Interject** — inject your own comment between rounds; the models see it next round.
- **Finalize** — force the moderator to write the MMDD from what's been said so far.
- Paused rounds show the models' questions; answer them and the chain continues.

## The output: MMDD

The debate ends in one document — the **MMDD** (Multi-Model Debate Document): the moderator's
synthesis of every surviving argument, weighted by confidence and stress-tested by the
challenges the models threw at each other. Copy it or download it as Markdown.

State is in-memory only — a refresh starts fresh.
