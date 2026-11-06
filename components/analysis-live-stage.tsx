"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createAuthenticatedBrowserClient } from "@/lib/supabase/browser";

export interface AnalysisStageState {
  stage: string;
  message: string;
}

interface AnalysisLiveStageProps {
  analysisId: string;
  initialStage: string;
  initialMessage: string;
  compact?: boolean;
  refreshOnCompletion?: boolean;
  onUpdate?: (state: AnalysisStageState) => void;
  onSubscribed?: () => void;
}

function readStageEvent(value: unknown): AnalysisStageState | null {
  if (!value || typeof value !== "object") return null;
  const message = "payload" in value ? value.payload : value;
  if (!message || typeof message !== "object" || !("stage" in message) || typeof message.stage !== "string") return null;
  return {
    stage: message.stage,
    message: "message" in message && typeof message.message === "string" ? message.message : "Analysis stage updated.",
  };
}

const stageNames: Record<string, string> = {
  queued: "Queued",
  fetching: "Fetching repository",
  selecting: "Selecting source files",
  parsing: "Parsing repository",
  storing: "Storing analysis",
  completed: "Complete",
  failed: "Failed",
};

export function AnalysisLiveStage({ analysisId, initialStage, initialMessage, compact = false, refreshOnCompletion = false, onUpdate, onSubscribed }: AnalysisLiveStageProps) {
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<AnalysisStageState>({ stage: initialStage, message: initialMessage });
  const onUpdateRef = useRef(onUpdate);
  const onSubscribedRef = useRef(onSubscribed);
  const client = useMemo(() => createAuthenticatedBrowserClient(getToken), [getToken]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onSubscribedRef.current = onSubscribed;
  }, [onSubscribed, onUpdate]);

  useEffect(() => {
    if (!isSignedIn || initialStage === "completed" || initialStage === "failed") return;
    let active = true;
    let channel: ReturnType<typeof client.channel> | undefined;

    async function subscribe() {
      try {
        const token = await getToken();
        if (!token || !active) return;
        await client.realtime.setAuth(token);
        if (!active) return;
        channel = client.channel(`analysis:${analysisId}`, { config: { private: true } })
          .on("broadcast", { event: "stage" }, (event) => {
            const next = readStageEvent(event);
            if (!next || !active) return;
            setState(next);
            onUpdateRef.current?.(next);
            if (refreshOnCompletion && (next.stage === "completed" || next.stage === "failed")) router.refresh();
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED" && active) onSubscribedRef.current?.();
          });
      } catch {
        if (active) setState((current) => ({ ...current, message: "Live updates are unavailable. Refresh to check the latest state." }));
      }
    }

    void subscribe();
    return () => {
      active = false;
      if (channel) void client.removeChannel(channel);
    };
  }, [analysisId, client, getToken, initialStage, isSignedIn, refreshOnCompletion, router]);

  return (
    <div className={compact ? "analysis-live-stage analysis-live-stage--compact" : "analysis-live-stage"} aria-live="polite">
      <span className={`analysis-stage-dot analysis-stage-dot--${state.stage}`} aria-hidden="true" />
      <span className="analysis-live-stage__name">{stageNames[state.stage] ?? state.stage}</span>
      <span className="analysis-live-stage__message">{state.message}</span>
    </div>
  );
}
