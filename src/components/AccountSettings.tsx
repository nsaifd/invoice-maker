import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cloud, KeyRound, Loader2, LogOut, RefreshCw, Trash2 } from 'lucide-react'
import { changePassword, deleteAccount, passwordProblem, regenerateRecoveryCode } from '../lib/auth'
import { forgetAccount, hasUnsyncedChanges, signOut, syncNow, useSyncStatus } from '../lib/sync'
import { RecoveryCode } from '../pages/AuthPage'
import { SyncBadge } from './Layout'
import { Button, Card, Field, Modal, inputCls } from './ui'

type Dialog = 'password' | 'recovery' | 'delete' | null

export function AccountSettings() {
  const status = useSyncStatus()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)

  if (status.state === 'loading') return null

  if (!status.user)
    return (
      <Card className="lg:col-span-2">
        <div id="account" className="flex flex-wrap items-center gap-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#2E5AF5]">
            <Cloud className="h-6 w-6" />
          </span>
          <div className="min-w-56 flex-1">
            <h2 className="font-semibold">Account & sync</h2>
            <p className="mt-0.5 text-sm text-zinc-500">Your data is only saved in this browser. Create a free account to use Involet on all your devices and keep a safe copy in the cloud.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/signup" className="rounded-lg bg-[#2E5AF5] px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Create account
            </Link>
            <Link to="/login" className="rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Log in
            </Link>
          </div>
        </div>
      </Card>
    )

  async function logOut() {
    if ((await hasUnsyncedChanges()) && !confirm('Some changes haven’t synced yet (you may be offline). If you log out now they will be lost. Log out anyway?')) return
    setBusy(true)
    await signOut()
    navigate('/login')
  }

  return (
    <Card className="lg:col-span-2">
      <div id="account" className="flex flex-wrap items-center gap-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2E5AF5] text-lg font-semibold uppercase text-white">{status.user.email[0]}</span>
        <div className="min-w-56 flex-1">
          <h2 className="font-semibold">{status.user.email}</h2>
          <div className="mt-0.5">
            <SyncBadge status={status} />
          </div>
          {status.error && <p className="mt-1 text-sm text-red-600">{status.error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={RefreshCw} disabled={status.state === 'syncing'} onClick={() => syncNow()}>
            Sync now
          </Button>
          <Button variant="secondary" icon={LogOut} disabled={busy} onClick={logOut}>
            Log out
          </Button>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-zinc-100 pt-4 text-sm">
        <button type="button" className="font-medium text-zinc-700 hover:text-zinc-900" onClick={() => setDialog('password')}>
          Change password
        </button>
        <button type="button" className="font-medium text-zinc-700 hover:text-zinc-900" onClick={() => setDialog('recovery')}>
          New recovery code
        </button>
        <button type="button" className="font-medium text-red-600 hover:text-red-700 sm:ml-auto" onClick={() => setDialog('delete')}>
          Delete account
        </button>
      </div>

      <PasswordDialog open={dialog === 'password'} email={status.user.email} onClose={() => setDialog(null)} />
      <RecoveryDialog open={dialog === 'recovery'} email={status.user.email} onClose={() => setDialog(null)} />
      <DeleteDialog
        open={dialog === 'delete'}
        email={status.user.email}
        onClose={() => setDialog(null)}
        onDeleted={async () => {
          await forgetAccount()
          navigate('/signup')
        }}
      />
    </Card>
  )
}

function useSubmit(fn: () => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return {
    busy,
    error,
    setError,
    submit: async (e: FormEvent) => {
      e.preventDefault()
      setBusy(true)
      setError('')
      try {
        await fn()
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(false)
      }
    },
  }
}

function PasswordDialog({ open, email, onClose }: { open: boolean; email: string; onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [done, setDone] = useState(false)
  const close = () => {
    setCurrent('')
    setNext('')
    setDone(false)
    onClose()
  }
  const { busy, error, setError, submit } = useSubmit(async () => {
    const problem = passwordProblem(next)
    if (problem) return setError(problem)
    await changePassword(email, current, next)
    setDone(true)
  })
  return (
    <Modal open={open} title="Change password" onClose={close}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">Your password was changed. Other devices were signed out and will need the new password.</p>
          <Button className="w-full" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Current password">
            <input type="password" autoComplete="current-password" className={inputCls} value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password">
            <input type="password" autoComplete="new-password" className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !current || !next}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Change password
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function RecoveryDialog({ open, email, onClose }: { open: boolean; email: string; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const close = () => {
    setPassword('')
    setCode(null)
    onClose()
  }
  const { busy, error, submit } = useSubmit(async () => setCode(await regenerateRecoveryCode(email, password)))
  return (
    <Modal open={open} title={code ? '' : 'New recovery code'} onClose={close}>
      {code ? (
        <RecoveryCode code={code} title="Your new recovery code" onContinue={close} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-zinc-600">Your old recovery code will stop working. Confirm your password to continue.</p>
          <Field label="Password">
            <input type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" icon={KeyRound} disabled={busy || !password}>
              Create new code
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function DeleteDialog({ open, email, onClose, onDeleted }: { open: boolean; email: string; onClose: () => void; onDeleted: () => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const { busy, error, submit } = useSubmit(async () => {
    await deleteAccount(email, password)
    await onDeleted()
  })
  return (
    <Modal open={open} title="Delete account" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-zinc-600">
          This permanently deletes your account and all invoices, proposals, clients and designs stored in it, on every device. Export a backup first if you want to keep a copy. This can’t be undone.
        </p>
        <Field label="Password">
          <input type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label='Type "DELETE" to confirm'>
          <input className={inputCls} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" icon={Trash2} disabled={busy || !password || confirmText !== 'DELETE'}>
            Delete forever
          </Button>
        </div>
      </form>
    </Modal>
  )
}
