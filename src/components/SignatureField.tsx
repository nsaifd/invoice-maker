import { useRef, useState } from 'react'
import { PenLine, Upload } from 'lucide-react'
import { resizeImage } from '../lib/image'
import { SignaturePad, type SignaturePadHandle } from './SignaturePad'
import { Button, Modal } from './ui'

/** Your own signature for invoices and proposals: draw it, type it, or upload a photo of it. */
export function SignatureField({ value, name, onChange }: { value?: string; name?: string; onChange: (signature: string | undefined) => void }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const pad = useRef<SignaturePadHandle>(null)

  async function use() {
    const url = await pad.current?.toDataURL()
    if (!url) return setError('Draw or type your signature first.')
    onChange(url)
    setOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={value ? 'Change signature' : 'Add signature'}
        className="flex h-16 w-40 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white hover:border-blue-400 hover:bg-blue-50/40"
      >
        {value ? <img src={value} alt="Your signature" className="max-h-14 max-w-36 object-contain" /> : <PenLine className="h-5 w-5 text-zinc-400" />}
      </button>
      <div className="flex flex-col items-start gap-1.5 text-sm">
        <button type="button" className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline" onClick={() => setOpen(true)}>
          <PenLine className="h-3.5 w-3.5" /> {value ? 'Sign again' : 'Sign now'}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-zinc-600 hover:text-zinc-900">
          <Upload className="h-3.5 w-3.5" /> Upload image
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => e.target.files?.[0] && onChange(await resizeImage(e.target.files[0], 480))} />
        </label>
        {value && (
          <button type="button" className="text-zinc-500 hover:text-red-600" onClick={() => onChange(undefined)}>
            Remove
          </button>
        )}
      </div>

      <Modal
        open={open}
        title="Your signature"
        onClose={() => {
          setOpen(false)
          setError('')
        }}
      >
        <p className="-mt-3 mb-4 text-sm text-zinc-500">Draw with your mouse or finger, or type your name. It appears on your invoices and proposals.</p>
        <SignaturePad ref={pad} defaultName={name} />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setError('')
              use()
            }}
          >
            Use this signature
          </Button>
        </div>
      </Modal>
    </div>
  )
}
