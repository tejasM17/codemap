import { CanvasPreviewShell } from "@/components/canvas-preview-shell";
import previewAnalysis from "./analysis.json";
import { validateParseResult } from "@/lib/parser/validate";

export default function PreviewPage() {
  if (!validateParseResult(previewAnalysis)) {
    throw new Error("The checked in preview analysis does not match the parser contract.");
  }

  return <CanvasPreviewShell analysis={previewAnalysis} />;
}
