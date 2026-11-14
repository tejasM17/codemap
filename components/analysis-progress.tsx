"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnalysisLiveStage, type AnalysisStageState } from "@/components/analysis-live-stage";
import { RerunAnalysisButton } from "@/components/rerun-analysis-button";
import { Badge } from "@/components/ui/badge";

const steps = [
  { id: "fetching", title: "Fetch archive" },
  { id: "selecting", title: "Select files" },
  { id: "parsing", title: "Parse imports" },
  { id: "storing", title: "Store map" },
];

interface AnalysisProgressProps {
  analysisId: string;
  repositoryName: string;
  commitSha: string | null;
  initialStage: string;
  initialMessage: string;
  errorMessage: string | null;
  failedStage: string | null;
  startedAt: string;
  active: boolean;
  repositoryUrl: string;
}

export function AnalysisProgress({ analysisId, repositoryName, commitSha, initialStage, initialMessage, errorMessage, failedStage, startedAt, active, repositoryUrl }: AnalysisProgressProps) {
  const [stage, setStage] = useState<AnalysisStageState>({ stage: initialStage, message: initialMessage });
  const [stale, setStale] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const onUpdate = useCallback((next: AnalysisStageState) => {
    setStage(next);
    setStale(false);
  }, []);
  const startQueuedRun = useCallback(() => {
    if (!active || initialStage !== "queued" || startedRef.current) return;
    startedRef.current = true;
    void fetch(`/api/analyses/${encodeURIComponent(analysisId)}/run`, { method: "POST" })
      .then(async (response) => {
        if (response.ok) return;
        const payload: unknown = await response.json();
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "The analysis could not be started.";
        setRunError(message);
      })
      .catch(() => setRunError("The analysis could not be started. Refresh to try again."));
  }, [active, analysisId, initialStage]);
  const currentIndex = steps.findIndex((step) => step.id === stage.stage);
  const isFailed = stage.stage === "failed" || Boolean(errorMessage);
  const currentStep = steps[currentIndex];
  const repositoryPath = repositoryUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\.git$/, "") || repositoryName;
  const repositoryParts = repositoryPath.split("/");

  useEffect(() => {
    if (!active) return;
    const updateStaleState = () => setStale(Date.now() - new Date(startedAt).getTime() > 5 * 60_000);
    updateStaleState();
    const interval = window.setInterval(updateStaleState, 30_000);
    return () => window.clearInterval(interval);
  }, [active, startedAt]);

  return (
    <section className="analysis-progress-page" aria-labelledby="analysis-progress-title">
      <header className="analysis-progress-heading">
        <h1 id="analysis-progress-title"><Link href="/workspace">{repositoryParts[0]}</Link>{repositoryParts.length > 1 ? <><span aria-hidden="true">/</span>{repositoryParts.slice(1).join("/")}</> : null}</h1>
        <Badge className={`analysis-progress-status analysis-progress-status--${isFailed ? "failed" : stage.stage === "completed" ? "completed" : "running"}`} variant="outline">
          <span aria-hidden="true" />{isFailed ? "failed" : stage.stage === "completed" ? "complete" : stage.stage === "queued" ? "queued" : "running"}
        </Badge>
        {isFailed ? <RerunAnalysisButton repositoryUrl={repositoryUrl} /> : null}
      </header>

      <div className={`analysis-progress-card${isFailed ? " analysis-progress-card--failed" : ""}`}>
        {stale && stage.stage !== "completed" && stage.stage !== "failed" ? (
          <div className="analysis-stale-notice" role="status">This run has not updated in five minutes. It may have stopped before recording a failure.</div>
        ) : null}
        <AnalysisLiveStage
          analysisId={analysisId}
          initialStage={initialStage}
          initialMessage={initialMessage}
          compact
          refreshOnCompletion
          onUpdate={onUpdate}
          onSubscribed={startQueuedRun}
        />
        <ol className="analysis-progress-steps" aria-label="Analysis stages">
          {steps.map((step, index) => {
            const complete = stage.stage === "completed" || (currentIndex >= 0 && index < currentIndex);
            const active = index === currentIndex && stage.stage !== "failed";
            return (
              <li key={step.id} className={`analysis-progress-step${complete ? " is-complete" : ""}${active ? " is-active" : ""}`}>
                <span className="analysis-progress-step__mark" aria-hidden="true" />
                <strong>{step.title}</strong>
                {active && stage.message ? <span className="analysis-progress-step__message" role="status">{stage.message}</span> : null}
                {isFailed && (failedStage === step.id || failedStage === step.title.toLowerCase().split(" ")[0]) ? <span className="analysis-progress-step__message" role="status">Stopped here</span> : null}
              </li>
            );
          })}
        </ol>
        {isFailed ? (
          <div className="analysis-failure-message" role="alert">
            <strong>Analysis failed during {failedStage ?? "the pipeline"}.</strong>
            <span>{errorMessage ?? stage.message}</span>
          </div>
        ) : null}
        {runError ? <div className="analysis-failure-message" role="alert"><strong>Analysis could not start.</strong><span>{runError}</span></div> : null}
        <footer className="analysis-progress-footer">
          {currentStep && stage.message ? <span>{stage.message}</span> : stage.stage === "completed" ? <span>Analysis complete{commitSha ? <> · <code>{commitSha.slice(0, 7)}</code></> : null}</span> : null}
          {commitSha && stage.stage !== "completed" ? <span>Commit <code>{commitSha.slice(0, 12)}</code></span> : null}
        </footer>
      </div>
    </section>
  );
}
