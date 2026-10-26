"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { ThemeControl } from "@/components/theme-control";
import { BrandMark } from "@/components/brand-mark";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="workspace-app">
      <header className="workspace-topbar">
        <Link className="brand-lockup" href="/workspace"><BrandMark /><span>cartograph</span></Link>
        <div className="workspace-topbar__right">
          <span className="workspace-plan"><span className="status-dot" /> TEAM WORKSPACE</span>
          <ThemeControl />
          <UserButton />
        </div>
      </header>
      <div className="workspace-body">
        <aside className="workspace-sidebar">
          <div className="sidebar-section-label">WORKSPACE</div>
          <OrganizationSwitcher
            afterSelectOrganizationUrl="/workspace"
            afterCreateOrganizationUrl="/workspace"
            hidePersonal
            appearance={{ elements: { rootBox: "org-switcher-root", organizationSwitcherTrigger: "org-switcher-trigger" } }}
          />
          <div className="sidebar-divider" />
          <div className="sidebar-section-label">YOUR SPACE</div>
          <Link className="sidebar-link sidebar-link--active" href="/workspace">
            <span className="sidebar-icon" aria-hidden="true">◫</span>Overview
          </Link>
          <Link className="sidebar-link" href="/workspace/team">
            <span className="sidebar-icon" aria-hidden="true">⌁</span>People
          </Link>
          <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="sidebar-note__icon">✳</span><p><strong>Built for shared context</strong><br />Your team&apos;s maps live together here.</p></div>
            <span className="sidebar-version">CARTOGRAPH <span>·</span> EARLY ACCESS</span>
          </div>
        </aside>
        <main className="workspace-main">{children}</main>
      </div>
    </div>
  );
}
