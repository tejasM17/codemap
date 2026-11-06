import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
import { SetupRequired } from "@/components/setup-required";
import { ThemeProvider } from "@/components/theme-provider";
import "@xyflow/react/dist/style.css";
import "./globals.css";

// @clerk/ui currently resolves a newer compatible @clerk/shared minor than
// @clerk/nextjs. The UI contract is runtime compatible, but TypeScript treats
// the duplicated package types as unrelated.
const clerkUi = ui as unknown as NonNullable<Parameters<typeof ClerkProvider>[0]["ui"]>;

export const metadata: Metadata = {
  title: "CodeMap · See how your code fits together",
  description: "A clear map of your codebase, built for your team.",
  icons: { icon: "/icon.svg" },
};

const requiredEnvironment = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
  "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

function getMissingEnvironment() {
  const missing = requiredEnvironment.filter((name) => {
    if (name === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY") {
      return !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }

    return !process.env[name];
  });

  return missing;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const missingEnvironment = getMissingEnvironment();
  const html = (
    <html lang="en" data-theme="system" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('codemap-theme');if(t==='light'||t==='dark'||t==='system')document.documentElement.dataset.theme=t}catch{}`,
          }}
        />
        {missingEnvironment.length > 0 ? <SetupRequired missing={missingEnvironment} /> : (
          <ClerkProvider
            ui={clerkUi}
            signInUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
            signUpUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL}
          >
            <ThemeProvider>{children}</ThemeProvider>
          </ClerkProvider>
        )}
      </body>
    </html>
  );
  return html;
}
