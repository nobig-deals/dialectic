"use client";

import { useMemo, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, GaugeIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { formatPrice, formatTokens, rankModels, SORT_OPTIONS, type SortKey } from "@/lib/model-format";
import type { OpenRouterModel } from "@/lib/types";

type Props = {
  models: OpenRouterModel[];
  selected: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
};

/** Searchable, sortable multi-select over the OpenRouter catalogue. */
export function ModelPicker({ models, selected, onChange, max = 10, placeholder = "Add models…", disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("best");

  const ranked = useMemo(() => rankModels(models, sort), [models, sort]);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else if (selected.length < max) onChange([...selected, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        )}
      >
        <span className={cn(selected.length === 0 && "text-muted-foreground")}>
          {selected.length ? `${selected.length} selected` : placeholder}
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-80 p-0" align="start">
        <Command shouldFilter>
          <CommandInput placeholder="Search models…" />
          {/* Sort segmented control */}
          <div className="flex items-center gap-1 border-b px-2 py-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Sort</span>
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setSort(o.key)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs transition-colors",
                  sort === o.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <CommandList className="max-h-80">
            <CommandEmpty>No model found.</CommandEmpty>
            <CommandGroup>
              {ranked.map((m) => {
                const isSel = selected.includes(m.id);
                const atMax = !isSel && selected.length >= max;
                const price = formatPrice(m);
                const ctx = formatTokens(m.contextLength);
                return (
                  <CommandItem
                    key={m.id}
                    value={`${m.id} ${m.name}`}
                    disabled={atMax}
                    onSelect={() => toggle(m.id)}
                    className={cn("flex items-start gap-2 py-2", atMax && "opacity-40")}
                  >
                    <CheckIcon className={cn("mt-0.5 size-4 shrink-0", isSel ? "opacity-100" : "opacity-0")} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{m.name}</span>
                        {typeof m.intelligence === "number" && (
                          <span className="flex shrink-0 items-center gap-0.5 rounded bg-emerald-500/15 px-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            <GaugeIcon className="size-2.5" />
                            {m.intelligence.toFixed(0)}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{m.id}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        {ctx && <span>{ctx} ctx</span>}
                        {price && (
                          <span className={cn(price === "Free" && "text-emerald-600 dark:text-emerald-400")}>
                            {price === "Free" ? "Free" : `${price} /1M`}
                          </span>
                        )}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
