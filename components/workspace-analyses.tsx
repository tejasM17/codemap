"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnalysisLiveStage, type AnalysisStageState } from "@/components/analysis-live-stage";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface WorkspaceAnalysis {
  id: string;
  status: string;
  stage: string;
  stageMessage: string;
  errorMessage: string | null;
  commitSha: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  projectName: string;
  repositoryUrl: string;
}

function timeAgo(value: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000], ["month", 2_592_000], ["day", 86_400],
    ["hour", 3_600], ["minute", 60], ["second", 1],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const [unit, duration] = units.find(([, size]) => Math.abs(seconds) >= size) ?? units[units.length - 1];
  return formatter.format(Math.round(seconds / duration), unit);
}

function statusName(status: string): string {
  return { queued: "queued", running: "running", completed: "complete", failed: "failed" }[status] ?? status;
}

export function WorkspaceAnalyses({ analyses }: { analyses: WorkspaceAnalysis[] }) {
  const [progress, setProgress] = useState<Record<string, AnalysisStageState>>({});
  const [now, setNow] = useState(0);

  useEffect(() => {
    const initialUpdate = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, []);

  if (analyses.length === 0) return null;

  return (
    <section className="analysis-list" aria-label="Repository analyses">
      <Table className="analysis-table">
        <TableHeader>
          <TableRow><TableHead>Repository</TableHead><TableHead>State</TableHead><TableHead>Commit</TableHead><TableHead>Started</TableHead><TableHead>Finished</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {analyses.map((analysis) => {
            const live = progress[analysis.id];
            const stage = live?.stage ?? analysis.stage;
            const status = stage === "completed" || stage === "failed" ? stage : analysis.status;
            const start = analysis.startedAt ?? analysis.createdAt;
            const stale = (status === "running" || status === "queued") && now - new Date(start).getTime() > 5 * 60_000;
            const update = (next: AnalysisStageState) => setProgress((current) => ({ ...current, [analysis.id]: next }));

            return (
              <TableRow className="analysis-row" key={analysis.id}>
                <TableCell className="analysis-repository">
                  <Link href={`/analysis/${encodeURIComponent(analysis.id)}`}>
                    <strong>{analysis.repositoryUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "") || analysis.projectName}</strong>
                  </Link>
                  {status === "failed" && analysis.errorMessage ? <span className="analysis-row-error">{analysis.errorMessage}</span> : null}
                </TableCell>
                <TableCell>
                  <Badge className={`analysis-badge analysis-badge--${stale ? "stale" : status}`} variant="outline">
                    <span aria-hidden="true" />{stale ? "stale" : statusName(status)}
                  </Badge>
                  <AnalysisLiveStage analysisId={analysis.id} initialStage={analysis.stage} initialMessage={analysis.stageMessage} compact refreshOnCompletion onUpdate={update} />
                </TableCell>
                <TableCell className="analysis-commit">{analysis.commitSha ? analysis.commitSha.slice(0, 7) : "—"}</TableCell>
                <TableCell className="analysis-date"><time dateTime={start}>{timeAgo(start)}</time></TableCell>
                <TableCell className="analysis-date">{analysis.completedAt ? <time dateTime={analysis.completedAt}>{timeAgo(analysis.completedAt)}</time> : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
