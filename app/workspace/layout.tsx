import { Suspense } from "react";
import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";

export const instant = false;

function WorkspaceLoading() {
  return <main className="workspace-loading" role="status">Loading workspace securely…</main>;
}

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fworkspace");

  return <WorkspaceShell>{children}</WorkspaceShell>;
}

export default function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  );
}
