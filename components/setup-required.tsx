import Link from "next/link";

export function SetupRequired({ missing }: { missing: string[] }) {
  return (
    <main className="setup-page">
      <div className="setup-card">
        <Link className="brand-lockup" href="/" aria-label="Cartograph home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
          <span>cartograph</span>
        </Link>
        <span className="eyebrow">LOCAL CONFIGURATION</span>
        <h1>Connect the services this workspace needs.</h1>
        <p className="muted-copy">
          Add these values to <code>.env.local</code> in the project root, then restart the
          development server. The app keeps its protected routes closed until every value is set.
        </p>
        <div className="env-list" role="alert" aria-live="polite">
          <p>Missing required configuration</p>
          {missing.map((name) => <code key={name}>{name}</code>)}
        </div>
        <p className="setup-footnote">Use your Clerk development instance and Supabase project values. Never add secret keys to browser code.</p>
      </div>
    </main>
  );
}
