'use client'

import { LogOut } from 'lucide-react'
import { logout } from '@/app/login/actions'

export function LogoutButton() {
  return (
    <button
      onClick={() => logout()}
      className="glass-panel absolute right-4 top-4 z-[999] flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[var(--on-surface)] transition-all hover:bg-[var(--glass-field-hover)]"
    >
      <LogOut className="h-4 w-4" />
      Sign Out
    </button>
  )
}
