import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { SetupRequired } from "@/components/setup-required";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cartograph · See how your code fits together",
  description: "A clear map of your codebase, built for your team.",
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
            __html: `try{var t=localStorage.getItem('cartograph-theme');if(t==='light'||t==='dark'||t==='system')document.documentElement.dataset.theme=t}catch{}`,
          }}
        />
        {missingEnvironment.length > 0 ? <SetupRequired missing={missingEnvironment} /> : (
          <ClerkProvider
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
