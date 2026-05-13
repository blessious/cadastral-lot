import { login } from './actions'
import { Map } from 'lucide-react'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  return (
    <div className="min-h-screen w-full flex bg-zinc-50">
      {/* Left side - Branding/Image (hidden on mobile) */}
      <div className="hidden lg:flex w-1/2 bg-zinc-900 border-r border-zinc-200 flex-col justify-between p-10 relative overflow-hidden">
        {/* Subtle grid pattern overlay for a "mapping" feel */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none" 
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} 
        />
        
        <div className="relative z-10 flex items-center gap-2 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600">
            <Map className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Online Boac GIS</span>
        </div>

        <div className="relative z-10 text-zinc-400">
          <h1 className="text-4xl font-light text-white mb-4 tracking-tight">
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
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12">
        <div className="mx-auto w-full max-w-[400px] flex flex-col justify-center space-y-8">
          
          <div className="flex flex-col space-y-2 text-center lg:text-left">
            <div className="flex justify-center lg:hidden mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900">
                <Map className="h-6 w-6 text-white" />
              </div>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">Sign In</h2>
            <p className="text-sm text-zinc-500">
              Enter your official credentials to access the portal.
            </p>
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
              className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-8 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 shadow-sm w-full"
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
