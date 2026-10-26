import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ThemeControl } from "@/components/theme-control";

export function AuthFrame({ children, mode }: { children: ReactNode; mode: "sign-in" | "sign-up" }) {
  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <Link href="/" className="brand-lockup"><BrandMark /><span>cartograph</span></Link>
        <div className="auth-topbar__actions"><span className="quiet-label">A clearer view of your code</span><ThemeControl /></div>
      </header>
      <div className="auth-layout">
        <section className="auth-story" aria-label="About Cartograph">
          <span className="eyebrow"><span className="status-dot" /> YOUR CODEBASE, IN CONTEXT</span>
          <h1>See the shape<br />of your software.</h1>
          <p>Understand what a file does, what depends on it, and where a change will travel.</p>
          <div className="auth-visual" aria-hidden="true">
            <div className="visual-grid" />
            <div className="map-node map-node--root"><span className="node-icon">⌘</span><span>src</span><b>14</b></div>
            <div className="map-node map-node--one"><span className="node-icon node-icon--blue">◇</span><span>parser</span><b>08</b></div>
            <div className="map-node map-node--two"><span className="node-icon node-icon--amber">◈</span><span>graph</span><b>12</b></div>
            <div className="map-node map-node--three"><span className="node-icon node-icon--green">⌁</span><span>routes</span><b>04</b></div>
            <svg className="map-lines" viewBox="0 0 520 260" fill="none">
              <path d="M257 94 147 144M276 96l89 51M154 166l-48 47M383 171l36 42" />
              <circle cx="256" cy="92" r="3" /><circle cx="145" cy="148" r="3" /><circle cx="366" cy="151" r="3" />
            </svg>
            <div className="visual-caption"><span className="caption-pulse" /> LIVE DEPENDENCY MAP <span>·</span> 38 FILES</div>
          </div>
          <div className="auth-proof"><span>01</span><p><strong>Built from the code itself.</strong><br />Every connection comes from parsing, never a guess.</p></div>
        </section>
        <section className="auth-card-wrap" aria-label={mode === "sign-in" ? "Sign in" : "Create an account"}>
          <div className="auth-card-heading">
            <span className="eyebrow">YOUR TEAM WORKSPACE</span>
            <h2>{mode === "sign-in" ? "Welcome back" : "Start with your team"}</h2>
            <p>{mode === "sign-in" ? "Sign in to pick up where your team left off." : "Create your account. Your workspace will be ready when you arrive."}</p>
          </div>
          {children}
          <div className="auth-switch">
            {mode === "sign-in" ? <>New to Cartograph? <Link href="/sign-up">Create an account <span aria-hidden="true">↗</span></Link></> : <>Already have an account? <Link href="/sign-in">Sign in <span aria-hidden="true">↗</span></Link></>}
          </div>
          <p className="auth-legal">By continuing, you agree to keep your team’s code and workspace private.</p>
        </section>
      </div>
      <footer className="auth-footer"><span>© 2026 Cartograph</span><span>Made for the moments you need to understand a codebase.</span></footer>
    </main>
  );
}
