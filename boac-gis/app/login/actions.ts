'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

const AUTH_COOKIE = 'boac_gis_auth'
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin'

export async function login(formData: FormData) {
  const username = (formData.get('username') as string) ?? ''
  const password = (formData.get('password') as string) ?? ''

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    redirect('/login?error=Could not authenticate user')
  }

  const cookieStore = cookies()
  cookieStore.set(AUTH_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function logout() {
  const cookieStore = cookies()
  cookieStore.set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  
  revalidatePath('/', 'layout')
  redirect('/login')
}
