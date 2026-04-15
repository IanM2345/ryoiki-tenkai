import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/reset-password'];
const STATIC_EXT = /\.(?:svg|png|jpg|jpeg|gif|webp|mp3|ico|txt|xml)$/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    STATIC_EXT.test(pathname) ||
    PUBLIC_PATHS.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const allCookies = req.cookies.getAll();
  const hasSession =
    req.cookies.has('sb-access-token') ||
    req.cookies.has('sb-refresh-token') ||
    allCookies.some(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));

  console.log('MW hit:', pathname, '| hasSession:', hasSession, '| cookies:', allCookies.map(c => c.name).join(', '));

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};