import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Deny requests for hidden files and directories at every URL depth.
 * Refresh Supabase sessions here so server components receive the latest
 * cookie-backed session.
 */
export async function middleware(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const pathname = request.nextUrl.pathname;
  const lastSegment = segments[segments.length - 1] ?? "";
  if (pathname.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(lastSegment)) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
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
