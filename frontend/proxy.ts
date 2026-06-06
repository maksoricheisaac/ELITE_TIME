import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/session'
import {
  addSecurityHeaders,
  validateOrigin,
  checkRateLimitByIP,
} from '@/lib/security/headers'

export function proxy(request: NextRequest) {
  const { nextUrl, cookies } = request
  const pathname = nextUrl.pathname

  /*
   * =========================================================
   * EXEMPTIONS TECHNIQUES NEXT.JS (OBLIGATOIRE)
   * =========================================================
   */
  if (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt'
  ) {
    return NextResponse.next()
  }

  const sessionToken = cookies.get(SESSION_COOKIE_NAME)?.value

  const isAuthPage = pathname === '/login'
  const isDashboardRoute =
    pathname === '/' || pathname.startsWith('/dashboard')

  const isApiRoute = pathname.startsWith('/api/')
  const isAuthApi = pathname === '/api/login'

  const legacyPrefixes = ['/employee', '/manager', '/admin']
  const isLegacyRoute = legacyPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )

  let response = NextResponse.next()

  /*
   * =========================================================
   * 1. Redirection anciennes routes
   * =========================================================
   */
  if (isLegacyRoute) {
    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  /*
   * =========================================================
   * 2. Protection dashboard uniquement
   * =========================================================
   */
  if (!sessionToken && isDashboardRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  /*
   * =========================================================
   * 3. Bloquer /login si déjà connecté
   * =========================================================
   */
  if (sessionToken && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  /*
   * =========================================================
   * 4. Sécurité ORIGIN (PAS pour API)
   * =========================================================
   */
  if (
    process.env.NODE_ENV === 'production' &&
    !isApiRoute &&
    !isAuthApi
  ) {
    if (!validateOrigin(request)) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  /*
   * =========================================================
   * 5. Rate limiting API
   * =========================================================
   */
  if (isApiRoute) {
    const rateLimit = checkRateLimitByIP(request, 60, 60000)

    if (!rateLimit.allowed) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': Math.ceil(
            (rateLimit.resetTime! - Date.now()) / 1000
          ).toString(),
        },
      })
    }
  }

  /*
   * =========================================================
   * 6. Détection accès sensibles
   * =========================================================
   */
  const sensitivePaths = ['/api/admin', '/api/ldap', '/trpc']
  if (sensitivePaths.some((p) => pathname.startsWith(p))) {
    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown'

    console.warn(
      `[Security] Sensitive access: ${pathname} from ${ip}`
    )
  }

  /*
   * =========================================================
   * 7. En-têtes de sécurité
   * =========================================================
   */
  response = addSecurityHeaders(response)

  return response
}

/*
 * =========================================================
 * CONFIGURATION DU MATCHER — Next.js 16 (proxy.ts)
 * =========================================================
 *
 * Note sur la version : ce fichier utilise la convention proxy.ts +
 * export function proxy() introduite dans Next.js 16. Si votre version
 * est antérieure (Next.js 14/15), renommer ce fichier en middleware.ts
 * et la fonction en `middleware`. Le bloc config/matcher est identique.
 *
 * Pourquoi exclure /api/ et /socket.io/ du matcher ?
 *
 * En PRODUCTION (derrière IIS) :
 *   IIS intercepte /api/* et /socket.io/* AVANT que la requête atteigne
 *   Next.js — ces chemins n'atteignent jamais proxy.ts. Les exclure est
 *   donc sans effet fonctionnel en prod, mais indispensable en dev.
 *
 * En DÉVELOPPEMENT (next dev, sans IIS) :
 *   proxy.ts s'exécute sur toutes les requêtes du matcher. Sans exclusion,
 *   il intercepterait /api/* et leur appliquerait rate limiting et
 *   validation d'origine, bloquant potentiellement les appels NestJS.
 *   L'exclusion garantit un comportement cohérent entre next dev et
 *   next start derrière IIS.
 *
 * Pattern : correspond à TOUT SAUF les préfixes dans le lookahead négatif.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|api/|socket\\.io/).*)',
  ],
}
