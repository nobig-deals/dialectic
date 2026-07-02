"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, CopyIcon, DownloadIcon, FileTextIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/markdown";

/** The final consolidated document, streaming then complete. */
export function FinalDoc({ document: doc, streaming }: { document: string; streaming: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(doc);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([doc], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = "debate-result.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-primary/30 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileTextIcon className="size-4 text-primary" /> Final document
          {streaming && <Spinner className="size-4" />}
        </CardTitle>
        {!streaming && doc && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />} Copy
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <DownloadIcon /> Download
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {doc ? <Markdown>{doc}</Markdown> : <p className="text-sm text-muted-foreground">Writing the final document…</p>}
      </CardContent>
    </Card>
  );
}
