import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function WorkspacePage() {
  const { userId, orgId, orgSlug, sessionClaims } = await auth();
  if (!userId) return null;

  if (!orgId) {
    return (
      <div className="workspace-content">
        <div className="breadcrumb"><span>Workspace</span><span>/</span><strong>Organization</strong></div>
        <section className="welcome-panel organization-missing">
          <div className="welcome-copy">
            <span className="eyebrow"><span className="status-dot" /> ORGANIZATION NEEDED</span>
            <h2>This account has no active organization.</h2>
            <p>Cartograph keeps team work inside an organization. Choose one from the workspace menu, or ask your administrator to add you.</p>
          </div>
        </section>
      </div>
    );
  }

  const organizationName = typeof sessionClaims?.org_name === "string"
    ? sessionClaims.org_name
    : orgSlug || "your organization";

  // Create the request scoped client now so later server rendered data reads
  // inherit the verified Clerk session token and active organization claim.
  await createSupabaseServerClient();

  return (
    <div className="workspace-content">
      <div className="workspace-heading-row">
        <div>
          <div className="breadcrumb"><span>Workspace</span><span>/</span><strong>Overview</strong></div>
          <p className="eyebrow">YOUR TEAM, IN CONTEXT</p>
          <h1>Good to have you here.</h1>
          <p className="workspace-subtitle">A shared map for <strong>{organizationName}</strong> starts here.</p>
        </div>
        <Link href="/workspace/team" className="button button--primary"><span aria-hidden="true">＋</span> Invite your team</Link>
      </div>

      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="eyebrow"><span className="status-dot" /> WORKSPACE READY</span>
          <h2>Make the invisible structure visible.</h2>
          <p>When your team maps a repository, folders, files, and their connections will come together here. Start by inviting the people who know the code.</p>
          <Link href="/workspace/team" className="text-link">Set up your team <span aria-hidden="true">→</span></Link>
        </div>
        <div className="welcome-illustration" aria-hidden="true">
          <div className="orbit orbit--outer" /><div className="orbit orbit--inner" />
          <div className="orbit-core"><span className="brand-mark"><span /><span /><span /><span /></span></div>
          <div className="orbit-node orbit-node--a">ƒ</div><div className="orbit-node orbit-node--b">◇</div><div className="orbit-node orbit-node--c">⌘</div><div className="orbit-node orbit-node--d">↗</div>
          <span className="orbit-label orbit-label--a">FILES</span><span className="orbit-label orbit-label--b">IMPORTS</span>
        </div>
      </section>

      <div className="section-heading"><div><span className="eyebrow">A GOOD PLACE TO BEGIN</span><h2>Bring your team in</h2></div><span className="section-index">01 / 02</span></div>
      <div className="setup-grid">
        <Link href="/workspace/team" className="setup-tile">
          <span className="tile-icon tile-icon--blue">⌁</span><span className="tile-step">01</span>
          <h3>Invite a teammate</h3><p>Share a workspace with the people building alongside you.</p><span className="tile-arrow" aria-hidden="true">↗</span>
        </Link>
        <div className="setup-tile setup-tile--quiet">
          <span className="tile-icon tile-icon--amber">⌘</span><span className="tile-step">02</span>
          <h3>Connect a repository</h3><p>Your public JavaScript and TypeScript repositories will be ready to map in the next step.</p><span className="tile-status">COMING NEXT</span>
        </div>
      </div>
      <div className="workspace-footer-note"><span className="footer-spark">✳</span><span>Every line on a Cartograph map comes from the code itself.</span><Link href="/workspace/team">Manage your workspace <span aria-hidden="true">→</span></Link></div>
      <span className="sr-only" data-organization-id={orgId}>Active organization loaded</span>
    </div>
  );
}
