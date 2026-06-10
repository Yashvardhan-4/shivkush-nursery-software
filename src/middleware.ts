import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Get the session cookie
  const session = request.cookies.get('snms_session');
  
  // If user is not logged in and not already on the login page
  if (!session && !request.nextUrl.pathname.startsWith('/login')) {
    // Redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // If user is logged in and tries to go to login page
  if (session && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  return NextResponse.next();
}

// Protect all routes except API, public files, and Next.js internals
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public files (manifest.json, images, sw.js, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox|.*\\.png$).*)',
  ],
};
