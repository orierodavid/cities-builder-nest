import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Deny requests for hidden files and directories at every URL depth.
 * Apply a per-request nonce CSP before refreshing Supabase sessions.
 */
export async function middleware(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      },
    });
  }

  const pathname = request.nextUrl.pathname;
  const lastSegment = segments[segments.length - 1] ?? "";
  if (pathname.startsWith("/_next/") || /\\.[a-z0-9]+$/i.test(lastSegment)) {
    return NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const connectSources = ["'self'"];
  const imageSources = ["'self'", "data:", "blob:"];
  const frameSources = ["'self'"];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (supabaseUrl) {
    try {
      const origin = new URL(supabaseUrl).origin;
      const hostname = new URL(supabaseUrl).hostname;
      connectSources.push(origin, `wss://${hostname}`);
      imageSources.push(origin);
      frameSources.push(origin);
    } catch {
      // Invalid public configuration is not added to the policy.
    }
  }
  if (apiUrl) {
    try {
      connectSources.push(new URL(apiUrl).origin);
    } catch {
      // Invalid public configuration is not added to the policy.
    }
  }

  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    `frame-src ${frameSources.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");

  const createResponse = () => {
    // Rebuild from the current request so Supabase cookie refreshes are forwarded
    // alongside the nonce and CSP headers.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
    requestHeaders.set("x-nonce", nonce);
    const nextResponse = NextResponse.next({ request: { headers: requestHeaders } });
    nextResponse.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return nextResponse;
  };

  let response = createResponse();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = createResponse();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // Validate the session with Supabase Auth; do not trust getSession() alone.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/:path*"],
};
