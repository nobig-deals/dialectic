"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DownloadIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { AttachedSkill } from "@/lib/types";

type SearchResult = { id: string; name: string; source: string; installs: number };

type Props = {
  skills: AttachedSkill[];
  onChange: (skills: AttachedSkill[]) => void;
  disabled?: boolean;
};

/** Search skills.sh and attach resolved SKILL.md content to a persona. */
export function SkillPicker({ skills, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const seq = useRef(0);

  // Debounced search against the proxy route.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/skills/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (mine !== seq.current) return; // a newer query superseded this one
        if (!res.ok) throw new Error(json.error ?? "Search failed");
        setResults(json.skills ?? []);
      } catch (err) {
        if (mine === seq.current) {
          setResults([]);
          toast.error(err instanceof Error ? err.message : "Skill search failed");
        }
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const add = useCallback(
    async (r: SearchResult) => {
      if (skills.some((s) => s.id === r.id)) return;
      setAdding(r.id);
      try {
        const res = await fetch(`/api/skills/content?id=${encodeURIComponent(r.id)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to fetch skill");
        onChange([...skills, json.skill as AttachedSkill]);
        toast.success(`Added skill "${(json.skill as AttachedSkill).name}"`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to fetch skill");
      } finally {
        setAdding(null);
      }
    },
    [skills, onChange],
  );

  const remove = (id: string) => onChange(skills.filter((s) => s.id !== id));

  return (
    <div className="flex flex-col gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          className={cn(
            "flex h-8 w-fit items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors hover:bg-accent/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          )}
        >
          <PlusIcon className="size-3.5" /> Add skill
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search skills.sh…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 border-0 p-0 shadow-none focus-visible:ring-0"
            />
            {searching && <Spinner className="size-3.5" />}
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {!query.trim() && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Type to search the skills.sh catalogue.
              </p>
            )}
            {query.trim() && !searching && results.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No skills found.</p>
            )}
            {results.map((r) => {
              const already = skills.some((s) => s.id === r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={already || adding === r.id}
                  onClick={() => add(r)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent disabled:opacity-40"
                >
                  <span className="mt-0.5 shrink-0">
                    {adding === r.id ? <Spinner className="size-3.5" /> : <DownloadIcon className="size-3.5" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{r.source}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {r.installs.toLocaleString()} ↓
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <Badge key={s.id} variant="outline" className="gap-1 pr-1 font-normal">
              <HoverCard>
                <HoverCardTrigger render={<span className="cursor-help" />}>{s.name}</HoverCardTrigger>
                <HoverCardContent className="w-96 max-h-80 overflow-y-auto text-xs" align="start">
                  <p className="mb-1 font-medium">{s.source}</p>
                  <pre className="whitespace-pre-wrap font-sans text-muted-foreground">
                    {s.content.slice(0, 1200)}
                    {s.content.length > 1200 ? "…" : ""}
                  </pre>
                </HoverCardContent>
              </HoverCard>
              <button
                onClick={() => remove(s.id)}
                className="rounded-full p-0.5 hover:bg-foreground/10"
                aria-label={`Remove skill ${s.name}`}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
