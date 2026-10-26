"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { ThemeControl } from "@/components/theme-control";
import { BrandMark } from "@/components/brand-mark";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="workspace-app">
      <header className="workspace-topbar">
        <Link className="brand-lockup" href="/workspace"><BrandMark /><span>CodeMap</span></Link>
        <span className="workspace-topbar__slash" aria-hidden="true">/</span>
        <OrganizationSwitcher
          afterSelectOrganizationUrl="/workspace"
          afterCreateOrganizationUrl="/workspace"
          hidePersonal
          appearance={{ elements: { rootBox: "org-switcher-root", organizationSwitcherTrigger: "org-switcher-trigger" } }}
        />
        <div className="workspace-topbar__right">
          <ThemeControl />
          <UserButton />
        </div>
      </header>
      <main className="workspace-main">{children}</main>
    </div>
  );
}
