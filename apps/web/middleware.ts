import { NextRequest, NextResponse } from "next/server";

/**
 * Deny requests for hidden files and directories at every URL depth.
 * Examples: /.env, /.git/config, /assets/.secret, /.well-known/...
 *
 * Keep this at the application edge so blocked paths never reach route
 * handlers, public-file serving, or application code.
 */
export function middleware(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const requestsHiddenPath = segments.some((segment) => segment.startsWith("."));

  if (requestsHiddenPath) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
