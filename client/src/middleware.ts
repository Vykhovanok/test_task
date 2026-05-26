import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/drive/public/")) {
    return NextResponse.next();
  }

  if (!request.nextUrl.pathname.startsWith("/drive")) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get("fss_session")?.value);

  if (!hasSessionCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/drive/:path*"],
};
