import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";
import { AuthFrame } from "@/components/auth-frame";

export const instant = false;

export default function SignUpPage() {
  return (
    <AuthFrame mode="sign-up">
      <Suspense fallback={<div className="auth-loading" role="status">Loading secure sign up…</div>}>
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
          forceRedirectUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL}
          fallbackRedirectUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL}
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
