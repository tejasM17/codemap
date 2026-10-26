import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { AuthFrame } from "@/components/auth-frame";

export const instant = false;

export default function SignInPage() {
  return (
    <AuthFrame mode="sign-in">
      <Suspense fallback={<div className="auth-loading" role="status">Loading secure sign in…</div>}>
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL}
          forceRedirectUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL}
          fallbackRedirectUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL}
          appearance={{
            elements: {
              rootBox: "clerk-root",
              cardBox: "clerk-card-box",
              card: "clerk-card",
              header: "clerk-header",
              headerTitle: "clerk-header-title",
              headerSubtitle: "clerk-header-subtitle",
              socialButtonsBlockButton: "clerk-social-button",
              formButtonPrimary: "clerk-primary-button",
              formFieldInput: "clerk-input",
              formFieldLabel: "clerk-label",
              footer: "clerk-footer",
              footerAction: "clerk-footer-action",
            },
          }}
        />
      </Suspense>
    </AuthFrame>
  );
}
