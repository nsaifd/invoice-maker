import { useEffect } from 'react'

const MESSAGE = 'You have unsaved changes. Leave without saving?'

/** Asks before discarding edits: on Cancel (call confirmLeave), on in-app links, and when closing the tab. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    // Runs before the router's own click handler, which skips links whose click was prevented.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || a.origin !== location.origin) return
      if (!confirm(MESSAGE)) e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty])
}

export const confirmLeave = (dirty: boolean) => !dirty || confirm(MESSAGE)
