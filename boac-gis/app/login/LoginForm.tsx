'use client'

import { login } from './actions'
import { AlertCircle, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react'
import Image from 'next/image'
import { useState, useRef } from 'react'

export default function LoginForm({ error }: { error?: string }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [showPassword, setShowPassword] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    const { left, top, width, height } = containerRef.current.getBoundingClientRect()

    const x = ((e.clientX - left) / width - 0.5) * 2
    const y = ((e.clientY - top) / height - 0.5) * 2
    const moveAmount = 25
    setOffset({
      x: x * moveAmount,
      y: y * moveAmount,
    })
  }

  const handleMouseLeave = () => {
    setOffset({ x: 0, y: 0 })
  }

  return (
    <main className="min-h-[100svh] w-full bg-zinc-50 text-zinc-950 lg:flex">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="hidden lg:flex lg:w-[62%] bg-zinc-950 border-r border-zinc-200 flex-col justify-between p-10 relative overflow-hidden group"
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="relative w-full h-full origin-center transition-transform duration-1000 ease-out scale-[1.1]"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px)`,
            }}
          >
            <Image
              src="/loginhero2.png"
              alt="Boac cadastral map"
              fill
              className="object-cover opacity-85"
              priority
            />
          </div>
        </div>

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_35%,rgba(16,185,129,0.20),transparent_34%),linear-gradient(135deg,rgba(9,15,19,0.96),rgba(9,15,19,0.62)_46%,rgba(3,67,54,0.42))] pointer-events-none z-0" />

        <div className="relative z-10 flex items-center gap-3 text-white">
          <div className="relative h-11 w-11 overflow-hidden rounded-full bg-white shadow-lg shadow-emerald-950/30">
            <Image src="/Boac-Logo.png" alt="Municipality of Boac seal" fill className="object-contain p-0.5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Online Boac GIS</span>
        </div>

        <div className="relative z-10 max-w-xl text-zinc-300">
          <h1 className="mb-4 text-5xl font-bold leading-tight tracking-tight text-white">
            GeoLGU Navigator
          </h1>
        </div>

        <div className="relative z-10 text-sm font-medium text-zinc-500">
          Municipality of Boac &copy; {new Date().getFullYear()}
        </div>
      </div>

      <section className="relative flex flex-col overflow-hidden bg-zinc-950 lg:hidden">
        <div className="relative flex min-h-[34svh] flex-col justify-between px-6 pb-10 pt-6 text-white">
          <Image
            src="/loginhero2.png"
            alt="Boac cadastral map"
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,13,17,0.70),rgba(7,13,17,0.30)_45%,rgba(7,13,17,0.82))]" />

          <div className="relative z-10 flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-white shadow-lg shadow-black/20">
              <Image src="/Boac-Logo.png" alt="Municipality of Boac seal" fill className="object-contain p-0.5" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-5">Online Boac GIS</p>
            </div>
          </div>

          <div className="relative z-10 max-w-[22rem]">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">GeoLGU Navigator</h1>
          </div>
        </div>

        <div className="relative z-20 mt-12 flex flex-col rounded-t-[1.75rem] bg-white px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-6 shadow-[0_-18px_40px_rgba(15,23,42,0.12)]">
          <LoginPanel
            error={error}
            idPrefix="mobile"
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((visible) => !visible)}
          />
        </div>
      </section>

      <section className="hidden w-full items-center justify-center p-10 lg:flex lg:w-[38%]">
        <div className="mx-auto flex w-full max-w-[400px] flex-col justify-center">
          <LoginPanel
            error={error}
            idPrefix="desktop"
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((visible) => !visible)}
          />
        </div>
      </section>
    </main>
  )
}

function LoginPanel({
  error,
  idPrefix,
  showPassword,
  onTogglePassword,
}: {
  error?: string
  idPrefix: string
  showPassword: boolean
  onTogglePassword: () => void
}) {
  const isMobile = idPrefix === 'mobile'

  return (
    <div className="flex h-full w-full flex-col">
      <div className={isMobile ? 'mb-5' : 'mb-7'}>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-950 lg:text-3xl">Sign in</h2>
        <p className="mt-1.5 text-sm font-medium leading-5 text-zinc-500 lg:mt-2 lg:leading-6">
          Enter your official credentials to continue.
        </p>
      </div>

      <form action={login} className={isMobile ? 'flex flex-col gap-3.5' : 'flex flex-col gap-5'}>
        <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase leading-none tracking-wide text-zinc-600" htmlFor={`${idPrefix}-username`}>
              Username
            </label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                id={`${idPrefix}-username`}
                name="username"
                type="text"
                placeholder="e.g. jdelacruz"
                autoComplete="username"
                required
                className="flex h-12 w-full rounded-2xl border border-zinc-200 bg-white px-12 py-3 text-base font-medium text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-600 lg:h-14"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase leading-none tracking-wide text-zinc-600" htmlFor={`${idPrefix}-password`}>
              Password
            </label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                id={`${idPrefix}-password`}
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="current-password"
                required
                className="flex h-12 w-full rounded-2xl border border-zinc-200 bg-white px-12 py-3 pr-14 text-base font-medium text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-600 lg:h-14"
              />
              <button
                type="button"
                onClick={onTogglePassword}
                className="absolute inset-y-0 right-1 flex w-12 items-center justify-center rounded-2xl text-zinc-500 transition-colors hover:text-emerald-700 focus:outline-none focus-visible:text-emerald-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          className="mt-1 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-600 px-8 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700 focus:outline-none focus-visible:bg-emerald-700 active:translate-y-px lg:h-14"
        >
          Sign in
        </button>
      </form>
    </div>
  )
}
