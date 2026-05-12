'use client'

import { LogOut } from 'lucide-react'
import { logout } from '@/app/login/actions'

export function LogoutButton() {
  return (
    <button
      onClick={() => logout()}
      className="absolute right-4 top-4 z-[999] flex items-center gap-2 rounded-full border border-white/20 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-md backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-lg dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800/90"
    >
      <LogOut className="h-4 w-4" />
      Sign Out
    </button>
  )
}