import { useCallback, useEffect, useRef, useState } from 'react'

/** Loads with `load` when `key` changes; `reload` loads again. */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const latest = useRef(load)
  useEffect(() => { latest.current = load })
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: undefined }))
    try {
      setState({ data: await latest.current(), loading: false })
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : 'Something went wrong.' })
    }
  }, [])
  useEffect(() => { void run() }, [key, run])
  return { ...state, reload: run }
}

/** The badge tone for an account's plan state. */
export const stateTone = (state: string): 'good' | 'warning' | 'critical' | 'neutral' => (state === 'paid' ? 'good' : state === 'grace' ? 'warning' : state === 'lapsed' ? 'critical' : 'neutral')
