'use client'

import { LogOut } from 'lucide-react'
import { logout } from '@/app/login/actions'

export function LogoutButton() {
  return (
    <button
      onClick={() => logout()}
      className="absolute top-4 right-4 z-[999] flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-md transition-colors hover:bg-slate-50 border border-slate-200"
    >
      <LogOut className="h-4 w-4" />
      Sign Out
    </button>
  )
}