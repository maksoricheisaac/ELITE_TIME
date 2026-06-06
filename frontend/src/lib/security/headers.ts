import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: http: https:",
    "connect-src 'self' http: https: ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),

  'X-Content-Type-Options': 'nosniff',
  'X-UA-Compatible': 'IE=edge',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
  ].join(', '),

  ...(process.env.NODE_ENV === 'production'
    ? {
        'Strict-Transport-Security':
          'max-age=31536000; includeSubDomains; preload',
      }
    : {}),

  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

export function addSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

/*
 * =========================================================
 * ✅ Origin validation adaptée reverse proxy IIS
 * =========================================================
 */
export function validateOrigin(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true

  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')

  const forwardedProto = req.headers.get('x-forwarded-proto') || 'http'
  const forwardedHost =
    req.headers.get('x-forwarded-host') || req.headers.get('host')

  const sameOrigin =
    forwardedHost ? `${forwardedProto}://${forwardedHost}` : null

  const method = req.method.toUpperCase()
  const isSafeMethod =
    method === 'GET' || method === 'HEAD' || method === 'OPTIONS'

  if (isSafeMethod && !origin && !referer) return true

  if (origin && sameOrigin) return origin === sameOrigin
  if (!origin && referer && sameOrigin) {
    try {
      return new URL(referer).origin === sameOrigin
    } catch {
      return false
    }
  }

  return false
}

/*
 * =========================================================
 * Rate limiting simple par IP
 * =========================================================
 */
const rateLimitMap = new Map<
  string,
  { count: number; resetTime: number }
>()

export function checkRateLimitByIP(
  req: NextRequest,
  maxRequests = 100,
  windowMs = 60000
) {
  const ip =
    req.headers.get('x-forwarded-for') ||
    req.headers.get('x-real-ip') ||
    'unknown'

  const now = Date.now()
  const key = `rate:${ip}`

  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + windowMs,
    })
    return { allowed: true }
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, resetTime: entry.resetTime }
  }

  entry.count++
  return { allowed: true }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key)
    }
  }
}, 300000)
