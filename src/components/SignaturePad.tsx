import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { inputCls } from './ui'

export interface SignaturePadHandle {
  /** PNG data URL, or null if nothing was drawn/typed. */
  toDataURL: () => Promise<string | null>
}

const WIDTH = 480
const HEIGHT = 160

/** Draw-or-type signature input. Output is a transparent PNG. */
export const SignaturePad = forwardRef<SignaturePadHandle, { defaultName?: string }>(function SignaturePad({ defaultName = '' }, ref) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [typed, setTyped] = useState(defaultName)
  const [hasInk, setHasInk] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  useEffect(() => {
    if (mode !== 'draw') return
    const c = canvas.current!
    const ratio = window.devicePixelRatio || 1
    c.width = WIDTH * ratio
    c.height = HEIGHT * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
    setHasInk(false)
  }, [mode])

  useImperativeHandle(ref, () => ({
    async toDataURL() {
      if (mode === 'draw') return hasInk ? canvas.current!.toDataURL('image/png') : null
      const name = typed.trim()
      if (!name) return null
      await document.fonts?.load('52px "Caveat"').catch(() => {})
      const c = document.createElement('canvas')
      c.width = WIDTH * 2
      c.height = HEIGHT * 2
      const ctx = c.getContext('2d')!
      ctx.scale(2, 2)
      ctx.fillStyle = '#111827'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '52px "Caveat", "Brush Script MT", cursive'
      ctx.fillText(name, WIDTH / 2, HEIGHT / 2, WIDTH - 40)
      return c.toDataURL('image/png')
    },
  }))

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * WIDTH, ((e.clientY - r.top) / r.height) * HEIGHT] as const
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm">
          {(['draw', 'type'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 font-medium capitalize ${mode === m ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500'}`}
            >
              {m}
            </button>
          ))}
        </div>
        {mode === 'draw' && (
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
            onClick={() => {
              const c = canvas.current!
              c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
              setHasInk(false)
            }}
          >
            <Eraser className="h-4 w-4" /> Clear
          </button>
        )}
      </div>
      {mode === 'draw' ? (
        <div className="relative rounded-xl border-2 border-dashed border-zinc-300 bg-white">
          <canvas
            ref={canvas}
            aria-label="Signature drawing area"
            className="block aspect-[3/1] w-full touch-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drawing.current = true
              const ctx = e.currentTarget.getContext('2d')!
              const [x, y] = point(e)
              ctx.beginPath()
              ctx.moveTo(x, y)
              ctx.lineTo(x + 0.1, y + 0.1)
              ctx.stroke()
              setHasInk(true)
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return
              const ctx = e.currentTarget.getContext('2d')!
              const [x, y] = point(e)
              ctx.lineTo(x, y)
              ctx.stroke()
            }}
            onPointerUp={() => (drawing.current = false)}
            onPointerCancel={() => (drawing.current = false)}
          />
          {!hasInk && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400">Sign here with your mouse or finger</span>}
          <div className="pointer-events-none absolute inset-x-6 bottom-6 border-b border-zinc-200" />
        </div>
      ) : (
        <div className="space-y-2">
          <input className={inputCls} placeholder="Type your full name" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <div className="flex aspect-[3/1] items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-white px-4 text-5xl text-zinc-900" style={{ fontFamily: '"Caveat", cursive' }}>
            {typed || <span className="text-base text-zinc-400">Your signature preview</span>}
          </div>
        </div>
      )}
    </div>
  )
})
