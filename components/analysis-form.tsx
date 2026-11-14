"use client";

import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

export function AnalysisForm() {
  const router = useRouter();
  const inputId = useId();
  const helpId = useId();
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl }),
      });
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object") throw new Error("CodeMap returned an invalid response.");
      if (!response.ok) {
        throw new Error("error" in payload && typeof payload.error === "string" ? payload.error : "The repository could not be analysed.");
      }
      if (!("analysisId" in payload) || typeof payload.analysisId !== "string") throw new Error("CodeMap returned no analysis ID.");
      router.push(`/analysis/${encodeURIComponent(payload.analysisId)}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The repository could not be analysed.");
      setPending(false);
    }
  }

  return (
      <form className="analysis-form" onSubmit={submit}>
        <label className="sr-only" htmlFor={inputId}>GitHub repository URL</label>
        <div className="analysis-form__controls">
          <input
            id={inputId}
            name="repositoryUrl"
            type="url"
            autoComplete="url"
            placeholder="github.com/owner/repo"
            value={repositoryUrl}
            onChange={(event) => setRepositoryUrl(event.target.value)}
            aria-describedby={errorMessage ? `${helpId} ${inputId}-error` : helpId}
            aria-invalid={Boolean(errorMessage)}
            disabled={pending}
            required
          />
          <Button type="submit" disabled={pending}>
            {pending ? <><LoaderCircle aria-hidden="true" className="analysis-form__spinner" /> Starting</> : <>Analyse <ArrowUpRight aria-hidden="true" /> </>}
          </Button>
        </div>
        <p id={helpId} className="analysis-form__help sr-only">Public GitHub repositories only. Repositories already analysed open their existing map.</p>
        {errorMessage ? <p id={`${inputId}-error`} className="analysis-form__error" role="alert">{errorMessage}</p> : null}
      </form>
  );
}
