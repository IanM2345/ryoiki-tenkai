import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/reset-password'];
const STATIC_EXT = /\.(?:svg|png|jpg|jpeg|gif|webp|mp3|ico|txt|xml)$/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  console.log('MW hit:', req.nextUrl.pathname, 'has cookie:', req.cookies.has('sb-access-token'));
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    STATIC_EXT.test(pathname) ||
    PUBLIC_PATHS.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  if (!req.cookies.has('sb-access-token')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};