import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const clerkIsConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

const proxy = clerkIsConfigured
  ? clerkMiddleware(async (auth, request) => {
      if (request.nextUrl.pathname.startsWith("/workspace")) await auth.protect();
    })
  : (request: NextRequest) => {
      if (request.nextUrl.pathname.startsWith("/workspace")) {
        const signInUrl = new URL("/sign-in", request.url);
        signInUrl.searchParams.set("redirect_url", request.nextUrl.pathname + request.nextUrl.search);
        return NextResponse.redirect(signInUrl);
      }
      return NextResponse.next();
    };

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
