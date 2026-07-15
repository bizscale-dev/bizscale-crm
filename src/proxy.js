import { NextResponse } from 'next/server';
import { verifySession } from './lib/session';

export async function proxy(req) {
  const path = req.nextUrl.pathname;
  
  // Public paths
  const isPublicPath = path === '/login' || path === '/';

  // Verify session
  const session = await verifySession();

  // Redirect unauthenticated users to login
  if (!isPublicPath && !session) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  // If logged in and trying to access /login, redirect to their dashboard
  const roleMap = {
    admin: '/admin',
    seo_associate: '/associate',
    writer: '/writer',
    manager: '/manager',
    web_seo_associate: '/web-associate'
  };

  if (session && path === '/login') {
    return NextResponse.redirect(new URL(roleMap[session.role] || '/', req.nextUrl));
  }

  // Prevent accessing other roles' dashboards
  if (session && !isPublicPath) {
    const rolePath = roleMap[session.role] || `/${session.role}`;
    if (!path.startsWith(rolePath) && path !== '/') {
      return NextResponse.redirect(new URL(rolePath, req.nextUrl));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public asset files (images, fonts, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|css|js)$).*)',
  ],
};