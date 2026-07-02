"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { InfoIcon, KeyRoundIcon, RefreshCwIcon, RotateCcwIcon, SparklesIcon, XIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ModelPicker } from "@/components/model-picker";
import { SkillPicker } from "@/components/skill-picker";
import { ROLES, getRole } from "@/lib/roles";
import type { AttachedSkill, OpenRouterModel, Participant } from "@/lib/types";
import type { DebateConfig } from "@/lib/use-debate";

const LS = {
  key: "dialectic.key",
  models: "dialectic.models",
  moderator: "dialectic.moderator",
  threshold: "dialectic.threshold",
  topic: "dialectic.topic",
  knowledge: "dialectic.knowledge",
  personas: "dialectic.personas",
};

/** Per-participant persona config, keyed by OpenRouter model id. */
type Persona = { roleId?: string; skills: AttachedSkill[] };
const NO_ROLE = "__none__";

export function SetupPanel({ onStart, busy }: { onStart: (cfg: DebateConfig) => void; busy: boolean }) {
  const [apiKey, setApiKey] = useState("");
  const [serverKey, setServerKey] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [moderator, setModerator] = useState<string>("");
  const [threshold, setThreshold] = useState(85);
  const [topic, setTopic] = useState("");
  const [knowledge, setKnowledge] = useState("");
  const [personas, setPersonas] = useState<Record<string, Persona>>({});

  // Restore persisted setup.
  useEffect(() => {
    try {
      setApiKey(localStorage.getItem(LS.key) ?? "");
      setSelected(JSON.parse(localStorage.getItem(LS.models) ?? "[]"));
      setModerator(localStorage.getItem(LS.moderator) ?? "");
      setThreshold(Number(localStorage.getItem(LS.threshold) ?? 85));
      setTopic(localStorage.getItem(LS.topic) ?? "");
      setKnowledge(localStorage.getItem(LS.knowledge) ?? "");
      setPersonas(JSON.parse(localStorage.getItem(LS.personas) ?? "{}"));
    } catch {
      /* ignore */
    }
  }, []);

  const loadModels = useCallback(
    async (key: string, opts?: { silent?: boolean }) => {
      setLoading(true);
      try {
        const res = await fetch("/api/models", { headers: { "x-openrouter-key": key } });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load models");
        const list: OpenRouterModel[] = json.models;
        setModels(list);
        if (!key) setServerKey(true); // empty key worked → server has OPENROUTER_API_KEY
        if (!opts?.silent) toast.success(`${list.length} models loaded`);
      } catch (err) {
        if (!opts?.silent) toast.error(err instanceof Error ? err.message : "Failed to load models");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Auto-load once: with the restored key, or with none to probe for a server-side key.
  useEffect(() => {
    if (models.length === 0) void loadModels(apiKey, { silent: !apiKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const persist = (patch: Partial<Record<keyof typeof LS, string>>) => {
    try {
      for (const [k, v] of Object.entries(patch)) localStorage.setItem(LS[k as keyof typeof LS], v);
    } catch {
      /* ignore */
    }
  };

  const setSel = (ids: string[]) => {
    setSelected(ids);
    persist({ models: JSON.stringify(ids) });
    if (!ids.includes(moderator)) {
      const next = ids[0] ?? "";
      setModerator(next);
      persist({ moderator: next });
    }
  };

  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id;

  const resetAll = () => {
    try {
      for (const k of Object.values(LS)) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
    setApiKey("");
    setSelected([]);
    setModerator("");
    setThreshold(85);
    setTopic("");
    setKnowledge("");
    setPersonas({});
    if (!serverKey) setModels([]);
    toast.success("Setup cleared");
  };

  const setPersona = (modelId: string, patch: Partial<Persona>) => {
    setPersonas((prev) => {
      const base: Persona = prev[modelId] ?? { skills: [] };
      const next = { ...prev, [modelId]: { ...base, ...patch } };
      persist({ personas: JSON.stringify(next) });
      return next;
    });
  };

  const start = () => {
    if (!apiKey && !serverKey) return toast.error("Enter your OpenRouter API key");
    if (selected.length < 2) return toast.error("Pick at least 2 models");
    if (!topic.trim()) return toast.error("Describe your topic first");
    const mod = moderator && selected.includes(moderator) ? moderator : selected[0];
    const participants: Participant[] = selected.map((model, i) => {
      const persona = personas[model];
      const role = getRole(persona?.roleId);
      return {
        id: `p${i}`,
        model,
        name: role ? role.name : modelName(model),
        roleId: persona?.roleId,
        skills: persona?.skills ?? [],
      };
    });
    onStart({ apiKey, topic: topic.trim(), knowledge: knowledge.trim(), participants, moderatorModel: mod, threshold });
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-4 text-primary" /> New debate
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            onClick={resetAll}
            disabled={busy}
            title="Clear saved key, models, topic and personas"
          >
            <RotateCcwIcon /> Reset
          </Button>
        </CardTitle>
        <CardDescription>Drop an idea. Pick models. Let them argue it into a document.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* API key — hidden when the deployment provides one via OPENROUTER_API_KEY */}
        {!serverKey && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="key">OpenRouter API key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRoundIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="key"
                  type="password"
                  placeholder="sk-or-…"
                  value={apiKey}
                  autoComplete="off"
                  className="pl-9"
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    persist({ key: e.target.value });
                  }}
                />
              </div>
              <Button variant="outline" onClick={() => loadModels(apiKey)} disabled={!apiKey || loading}>
                {loading ? <Spinner /> : <RefreshCwIcon />}
                {models.length ? "Reload" : "Load models"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Stored only in your browser. {models.length > 0 && `${models.length} models available.`}
            </p>
          </div>
        )}

        {/* Participants */}
        <div className="flex flex-col gap-2">
          <Label>Participants ({selected.length}/10)</Label>
          <ModelPicker models={models} selected={selected} onChange={setSel} disabled={models.length === 0} />
          {selected.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              {selected.map((id) => {
                const persona = personas[id] ?? { skills: [] };
                const role = getRole(persona.roleId);
                return (
                  <div key={id} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{modelName(id)}</span>
                      <button
                        onClick={() => setSel(selected.filter((s) => s !== id))}
                        className="rounded-full p-1 text-muted-foreground hover:bg-foreground/10"
                        aria-label={`Remove ${modelName(id)}`}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                      <Select
                        value={persona.roleId ?? NO_ROLE}
                        onValueChange={(v: string | null) =>
                          setPersona(id, { roleId: !v || v === NO_ROLE ? undefined : v })
                        }
                      >
                        <SelectTrigger className="h-8 w-full sm:w-48 text-xs">
                          <SelectValue placeholder="No role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ROLE}>No role (plain model)</SelectItem>
                          {ROLES.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {role && (
                        <HoverCard>
                          <HoverCardTrigger
                            render={
                              <button
                                type="button"
                                className="flex h-8 shrink-0 cursor-help items-center rounded-md px-1 text-muted-foreground hover:text-foreground"
                                aria-label={`Show the ${role.name} role prompt`}
                              />
                            }
                          >
                            <InfoIcon className="size-3.5" />
                          </HoverCardTrigger>
                          <HoverCardContent className="w-96 text-xs" align="start">
                            <p className="mb-1 font-medium">
                              {role.name} — {role.blurb}
                            </p>
                            <p className="text-muted-foreground">{role.persona}</p>
                          </HoverCardContent>
                        </HoverCard>
                      )}
                      <SkillPicker
                        skills={persona.skills}
                        onChange={(skills) => setPersona(id, { skills })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Moderator */}
        {selected.length >= 2 && (
          <div className="flex flex-col gap-2">
            <Label>Moderator</Label>
            <Select
              value={moderator || selected[0]}
              onValueChange={(v: string | null) => {
                const val = v ?? selected[0];
                setModerator(val);
                persist({ moderator: val });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selected.map((id) => (
                  <SelectItem key={id} value={id}>
                    {modelName(id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Aggregates each round, decides who continues, writes the final doc.</p>
          </div>
        )}

        {/* Threshold */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Confidence to finish</Label>
            <span className="font-mono text-sm text-muted-foreground">{threshold}</span>
          </div>
          <Slider
            value={threshold}
            min={50}
            max={100}
            step={1}
            onValueChange={(v: number | readonly number[]) => {
              const n = Array.isArray(v) ? v[0] : (v as number);
              setThreshold(n);
              persist({ threshold: String(n) });
            }}
          />
          <p className="text-xs text-muted-foreground">A model drops out once it&apos;s this confident and unchallenged.</p>
        </div>

        {/* Topic */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="topic">Topic / idea</Label>
          <Textarea
            id="topic"
            placeholder="e.g. Rebrand our 14-day audit tool into a subscription SaaS. What should we call it and how do we position it?"
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              persist({ topic: e.target.value });
            }}
            className="min-h-24 resize-y"
          />
        </div>

        {/* Knowledge */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="knowledge">Knowledge / context</Label>
            <span className="text-xs text-muted-foreground">optional</span>
          </div>
          <Textarea
            id="knowledge"
            placeholder="Paste reference material here — product docs, an .md file, notes, constraints. The models treat this as authoritative context."
            value={knowledge}
            onChange={(e) => {
              setKnowledge(e.target.value);
              persist({ knowledge: e.target.value });
            }}
            className="min-h-32 resize-y font-mono text-xs"
          />
          {knowledge.trim() && (
            <p className="text-xs text-muted-foreground">
              {knowledge.trim().length.toLocaleString()} chars · ~{Math.ceil(knowledge.trim().length / 4).toLocaleString()} tokens
            </p>
          )}
        </div>

        <Button size="lg" onClick={start} disabled={busy} className="mt-1">
          <SparklesIcon /> Start debate
        </Button>
      </CardContent>
    </Card>
  );
}
