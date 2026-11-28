import { useEffect, useState } from 'react'

// Light or dark: the device's choice until the admin picks one (kept in this browser).

type Theme = 'light' | 'dark'
const KEY = 'boai-admin-theme'

function saved(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

const device = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => saved() ?? device())
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { window.localStorage.setItem(KEY, next) } catch { /* private mode: this visit only */ }
  }
  return { theme, toggle }
}
