"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RerunAnalysisButton({ repositoryUrl }: { repositoryUrl: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rerun() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repositoryUrl, rerun: true }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" || !("analysisId" in result)) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : "Could not restart this analysis.";
        throw new Error(message);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restart this analysis.");
      setPending(false);
    }
  }

  return (
    <div className="analysis-rerun">
      <button type="button" onClick={rerun} disabled={pending}>{pending ? "Starting…" : "Run again"}</button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}
