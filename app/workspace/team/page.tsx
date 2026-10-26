import { Suspense } from "react";
import Link from "next/link";
import { OrganizationProfile } from "@clerk/nextjs";

export default function TeamPage() {
  return (
    <div className="workspace-content team-content">
      <div className="breadcrumb"><Link href="/workspace">Workspace</Link><span>/</span><strong>People</strong></div>
      <div className="team-heading">
        <div><p className="eyebrow">YOUR TEAM</p><h1>People and access</h1><p className="workspace-subtitle">Invite teammates and manage who can see this organization&apos;s work.</p></div>
        <span className="team-heading-mark" aria-hidden="true">⌁</span>
      </div>
      <section className="team-card">
        <div className="team-card-heading"><div><span className="eyebrow">ORGANIZATION SETTINGS</span><h2>Members</h2></div><span className="secure-label"><span className="status-dot" /> Managed by Clerk</span></div>
        <Suspense fallback={<div className="team-loading" role="status">Loading organization members…</div>}>
          <OrganizationProfile routing="hash" />
        </Suspense>
      </section>
    </div>
  );
}
