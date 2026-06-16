'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

const AUTH_COOKIE = 'boac_gis_auth'

function getConfiguredCredentials() {
  const username = process.env.BOAC_GIS_USERNAME || 'admin'
  const password = process.env.BOAC_GIS_PASSWORD || 'admin'

  if (process.env.NODE_ENV === 'production' && username === 'admin' && password === 'admin') {
    throw new Error('Set BOAC_GIS_USERNAME and BOAC_GIS_PASSWORD before exposing this app to the internet.')
  }

  return { username, password }
}

export async function login(formData: FormData) {
  const username = (formData.get('username') as string) ?? ''
  const password = (formData.get('password') as string) ?? ''
  const configured = getConfiguredCredentials()

  if (username !== configured.username || password !== configured.password) {
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
