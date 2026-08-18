'use server'

import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { AUTH_COOKIE, createSessionToken, SESSION_MAX_AGE_SECONDS } from '@/lib/auth-session'
import { verifyPassword } from '@/lib/password'
import { findActiveUserByUsername, recordSuccessfulLogin, type AuthUser } from '@/lib/users'

const MAX_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const attempts = new Map<string, { count: number; resetAt: number }>()
const DUMMY_PASSWORD_HASH = `scrypt$16384$8$1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`

function getClientKey(username: string): string {
  const requestHeaders = headers()
  const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwardedFor || requestHeaders.get('x-real-ip') || 'unknown'
  return `${address}:${username.toLowerCase()}`
}

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const attempt = attempts.get(key)
  if (!attempt || attempt.resetAt <= now) {
    attempts.delete(key)
    return false
  }
  return attempt.count >= MAX_ATTEMPTS
}

function recordFailure(key: string): void {
  const now = Date.now()
  const attempt = attempts.get(key)
  if (!attempt || attempt.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS })
  } else {
    attempt.count += 1
  }

  if (attempts.size > 1000) {
    attempts.forEach((entry, entryKey) => {
      if (entry.resetAt <= now) attempts.delete(entryKey)
    })
  }
}

function loginError(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`)
}

export async function login(formData: FormData) {
  const username = String(formData.get('username') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    loginError('Authentication is not configured. Contact the administrator.')
  }

  const clientKey = getClientKey(username)
  if (isRateLimited(clientKey)) {
    loginError('Could not authenticate user')
  }

  let user: AuthUser | null
  try {
    user = await findActiveUserByUsername(username)
  } catch (error) {
    console.error('Authentication database error:', error)
    loginError('Authentication service is unavailable. Try again later.')
  }

  // A dummy hash keeps unknown-user and wrong-password requests computationally similar.
  const passwordValid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)

  if (!user || !passwordValid) {
    recordFailure(clientKey)
    loginError('Could not authenticate user')
  }

  attempts.delete(clientKey)
  const token = await createSessionToken(user)
  cookies().set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })

  void recordSuccessfulLogin(user.id).catch((error) => {
    console.error('Failed to update last login timestamp:', error)
  })

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function logout() {
  cookies().set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  revalidatePath('/', 'layout')
  redirect('/login')
}
