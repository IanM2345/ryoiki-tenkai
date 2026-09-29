import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/reset-password'];
// The installable-app files must load before sign-in too.
const APP_FILES = ['/sw.js', '/manifest.webmanifest', '/icons/'];
const STATIC_EXT = /\.(?:svg|png|jpg|jpeg|gif|webp|mp3|ico|txt|xml)$/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    STATIC_EXT.test(pathname) ||
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    APP_FILES.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const allCookies = req.cookies.getAll();
  const hasSession =
    req.cookies.has('sb-access-token') ||
    req.cookies.has('sb-refresh-token') ||
    allCookies.some(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));


  if (!hasSession) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};