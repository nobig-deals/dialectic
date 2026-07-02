"use client";

import { useState } from "react";
import { CheckIcon, HandIcon, SendIcon, XIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Answer = { choice: "yes" | "no" | null; comment: string };

/** Shown when the debate pauses to ask the human something. One control per question. */
export function UserPrompt({
  questions,
  onAnswer,
}: {
  questions: string[];
  onAnswer: (text: string) => void;
}) {
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map(() => ({ choice: null, comment: "" })));

  const set = (i: number, patch: Partial<Answer>) =>
    setAnswers((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const answered = answers.filter((a) => a.choice !== null || a.comment.trim()).length;

  const submit = () => {
    const lines = questions
      .map((q, i) => {
        const a = answers[i];
        if (a.choice === null && !a.comment.trim()) return null;
        const label = a.choice === "yes" ? "Yes" : a.choice === "no" ? "No" : "—";
        const comment = a.comment.trim() ? ` ${a.comment.trim()}` : "";
        return `${i + 1}. ${q}\n   → ${label}.${comment}`;
      })
      .filter(Boolean);
    onAnswer(lines.length ? lines.join("\n") : "(no specific answers)");
  };

  return (
    <Card className="border-amber-500/40 bg-amber-500/[0.04]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HandIcon className="size-4 text-amber-500" /> The models need your input
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {answered}/{questions.length} answered
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {questions.map((q, i) => {
          const a = answers[i];
          return (
            <div key={i} className="flex flex-col gap-2 rounded-lg border bg-background/40 p-3">
              <div className="flex gap-2 text-sm">
                <span className="font-mono text-xs text-amber-500">{i + 1}.</span>
                <span className="flex-1">{q}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-5">
                <div className="flex overflow-hidden rounded-md border">
                  <button
                    type="button"
                    onClick={() => set(i, { choice: a.choice === "yes" ? null : "yes" })}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 text-xs transition-colors",
                      a.choice === "yes"
                        ? "bg-emerald-500/90 text-white"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <CheckIcon className="size-3" /> Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => set(i, { choice: a.choice === "no" ? null : "no" })}
                    className={cn(
                      "flex items-center gap-1 border-l px-2.5 py-1 text-xs transition-colors",
                      a.choice === "no" ? "bg-rose-500/90 text-white" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <XIcon className="size-3" /> No
                  </button>
                </div>
                <Input
                  value={a.comment}
                  onChange={(e) => set(i, { comment: e.target.value })}
                  placeholder="comment (optional)"
                  className="h-8 flex-1 bg-background text-sm"
                />
              </div>
            </div>
          );
        })}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button onClick={submit}>
            <SendIcon /> Send &amp; continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
