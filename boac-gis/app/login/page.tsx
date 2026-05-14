'use client'

import { login } from './actions'
import { Map } from 'lucide-react'
import Image from 'next/image'
import { useState, useRef } from 'react'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    const { left, top, width, height } = containerRef.current.getBoundingClientRect()
    
    // Calculate relative position from center (-1 to 1)
    const x = ((e.clientX - left) / width - 0.5) * 2
    const y = ((e.clientY - top) / height - 0.5) * 2
    
    // Amount of movement in pixels (the "drag" amount)
    const moveAmount = 25
    setOffset({ 
      x: x * moveAmount, 
      y: y * moveAmount 
    })
  }

  const handleMouseLeave = () => {
    // Reset to center
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div className="min-h-screen w-full flex bg-zinc-50">
      {/* Left side - Branding/Image (hidden on mobile) */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="hidden lg:flex lg:w-2/3 bg-zinc-950 border-r border-zinc-200 flex-col justify-between p-10 relative overflow-hidden group"
      >
        {/* Parallax Hero Image Container */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div 
            className="relative w-full h-full origin-center transition-transform duration-1000 ease-out scale-[1.1]"
            style={{ 
              transform: `translate(${offset.x}px, ${offset.y}px)` 
            }}
          >
            <Image
              src="/loginhero2.png"
              alt="Login Hero"
              fill
              className="object-cover opacity-80"
              priority
            />
          </div>
        </div>

        {/* Gradient overlay for text contrast */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-950/90 via-zinc-950/40 to-emerald-950/20 pointer-events-none z-0" />


        <div className="relative z-10 flex items-center gap-2 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600">
            <Map className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Online Boac GIS</span>
        </div>

        <div className="relative z-10 text-zinc-400">
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">
            GeoLGU Navigator
          </h1>
          <p className="text-lg max-w-md">
            Secure municipal infrastructure for spatial data analysis and land record administration.
          </p>
        </div>

        <div className="relative z-10 text-sm font-medium text-zinc-500">
          Municipality of Boac &copy; {new Date().getFullYear()}
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/3 flex items-center justify-center p-8 sm:p-12">
        <div className="mx-auto w-full max-w-[400px] flex flex-col justify-center space-y-8">

          <div className="flex flex-col space-y-2 text-left">
            <div className="flex justify-start lg:hidden mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600">
                <Map className="h-6 w-6 text-white" />
              </div>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-emerald-950">Sign In</h2>
          </div>

          <form className="flex flex-col gap-5">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium leading-none text-zinc-700" htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Enter your username"
                  autoComplete="username"
                  required
                  className="flex h-11 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium leading-none text-zinc-700" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  className="flex h-11 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors shadow-sm"
                />
              </div>
            </div>

            {searchParams?.error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 border border-red-100 flex items-center justify-center">
                {searchParams.error}
              </div>
            )}

            <button
              formAction={login}
              className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-emerald-600 px-8 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 shadow-sm w-full"
            >
              Sign in
            </button>
          </form>

          <p className="px-8 text-center text-sm text-zinc-500 lg:px-0 lg:text-left">
            Authorized personnel only. Contact the ICTS office for access.
          </p>
        </div>
      </div>
    </div>
  )
}
