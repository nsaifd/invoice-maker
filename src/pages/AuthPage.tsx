import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Cloud, Copy, Download, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, ShieldCheck, WifiOff } from 'lucide-react'
import { db } from '../db'
import { login, passwordProblem, recover, signup, type User } from '../lib/auth'
import { onSignedIn } from '../lib/sync'
import { Button, Field, IconInput, inputCls } from '../components/ui'

type Mode = 'login' | 'signup' | 'recover'

export default function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const localCount = useLiveQuery(async () => (await db.invoices.count()) + (await db.proposals.count()) + (await db.clients.count()), []) ?? 0
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [issued, setIssued] = useState<{ user: User; code: string } | null>(null)

  async function finish(user: User) {
    setBusy(localCount ? 'Uploading your data…' : 'Getting your data…')
    await onSignedIn(user)
    navigate('/', { replace: true })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const problem = mode !== 'login' ? passwordProblem(password) : null
    if (problem) return setError(problem)
    setBusy(mode === 'signup' ? 'Creating your account…' : mode === 'recover' ? 'Resetting your password…' : 'Logging in…')
    try {
      if (mode === 'login') await finish(await login(email, password))
      else {
        const r = mode === 'signup' ? await signup(email, password) : await recover(email, code, password)
        setIssued({ user: r.user, code: r.recoveryCode })
        setBusy(null)
      }
    } catch (err) {
      setError((err as Error).message)
      setBusy(null)
    }
  }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <BrandPanel />
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-10 inline-block lg:hidden" aria-label="Involet home">
            <img src="/logo.svg" alt="Involet" className="h-8" />
          </Link>

          {issued ? (
            <RecoveryCode code={issued.code} busy={busy} onContinue={() => finish(issued.user)} />
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                {mode === 'signup' ? 'Create your free account' : mode === 'recover' ? 'Reset your password' : 'Welcome back'}
              </h1>
              <p className="mt-1.5 text-sm text-zinc-500">
                {mode === 'signup'
                  ? 'Access your invoices and proposals from any device.'
                  : mode === 'recover'
                    ? 'Use the recovery code you saved when you created your account.'
                    : 'Log in to sync your invoices and proposals.'}
              </p>

              {mode !== 'recover' && localCount > 0 && (
                <div className="mt-5 flex gap-2.5 rounded-xl bg-blue-50 px-3.5 py-3 text-sm text-blue-800">
                  <Cloud className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>The invoices and proposals on this device will be added to your account.</span>
                </div>
              )}

              <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
                <Field label="Email">
                  <IconInput icon={Mail} type="email" autoComplete="email" required value={email} onChange={(e) => {
                      setEmail(e.target.value)
                      setError('')
                    }} placeholder="you@company.com" />
                </Field>
                {mode === 'recover' && (
                  <Field label="Recovery code">
                    <IconInput
                      icon={KeyRound}
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono uppercase tracking-wider"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value)
                        setError('')
                      }}
                      placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                    />
                  </Field>
                )}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium text-zinc-700">
                      {mode === 'recover' ? 'New password' : 'Password'}
                    </label>
                    {mode === 'login' && (
                      <Link to="/recover" className="text-sm font-medium text-blue-600 hover:underline">
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      id="password"
                      type={show ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      className={`${inputCls} pl-9 pr-10`}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setError('')
                      }}
                      placeholder={mode === 'login' ? '' : 'At least 8 characters'}
                    />
                    <button
                      type="button"
                      aria-label={show ? 'Hide password' : 'Show password'}
                      onClick={() => setShow((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 hover:text-zinc-700"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {mode !== 'login' && password && <Strength password={password} />}
                </div>

                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

                <Button type="submit" className="w-full py-2.5" disabled={!!busy || !email || !password || (mode === 'recover' && !code)}>
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> {busy}
                    </>
                  ) : mode === 'signup' ? (
                    'Create account'
                  ) : mode === 'recover' ? (
                    'Reset password'
                  ) : (
                    'Log in'
                  )}
                </Button>
              </form>

              <div className="mt-6 space-y-2 text-center text-sm text-zinc-500">
                {mode === 'signup' ? (
                  <p>
                    Already have an account?{' '}
                    <Link to="/login" className="font-medium text-blue-600 hover:underline">
                      Log in
                    </Link>
                  </p>
                ) : (
                  <p>
                    {mode === 'recover' ? 'Remembered it? ' : 'New to Involet? '}
                    <Link to={mode === 'recover' ? '/login' : '/signup'} className="font-medium text-blue-600 hover:underline">
                      {mode === 'recover' ? 'Log in' : 'Create a free account'}
                    </Link>
                  </p>
                )}
                <p>
                  <Link to="/" className="hover:text-zinc-900">
                    Continue without an account
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function BrandPanel() {
  const points: Array<[typeof Cloud, string, string]> = [
    [Cloud, 'On every device', 'Laptop, phone, office PC — the same invoices everywhere.'],
    [WifiOff, 'Works offline', 'Keep working without internet; changes sync when you’re back.'],
    [ShieldCheck, 'Private by design', 'Your password never leaves your browser. Only you see your data.'],
  ]
  return (
    <aside className="relative hidden overflow-hidden bg-[#2E5AF5] p-12 text-white lg:flex lg:flex-col">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-[28rem] w-[28rem] rounded-full bg-white/5" />
      <Link to="/" className="relative" aria-label="Involet home">
        <img src="/logo-white.svg" alt="Involet" className="h-9" />
      </Link>
      <div className="relative my-auto max-w-md">
        <h2 className="text-4xl font-semibold leading-tight tracking-tight">Your invoices and proposals, wherever you work.</h2>
        <div className="mt-10 space-y-6">
          {points.map(([Icon, title, text]) => (
            <div key={title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <div className="font-semibold">{title}</div>
                <div className="text-sm text-white/75">{text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="relative text-sm text-white/60">© {new Date().getFullYear()} Involet</p>
    </aside>
  )
}

function Strength({ password }: { password: string }) {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++
  const label = ['Too short', 'Weak', 'Okay', 'Good', 'Strong'][score]
  const color = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600'][score]
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < score ? color : 'bg-zinc-200'}`} />
        ))}
      </div>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  )
}

/** Shown once after sign-up or recovery: the only way to reset a forgotten password. */
export function RecoveryCode({ code, busy, onContinue, title = 'Save your recovery code' }: { code: string; busy?: string | null; onContinue: () => void; title?: string }) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
        <KeyRound className="h-6 w-6" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
      <p className="mt-1.5 text-sm text-zinc-500">
        If you forget your password, this code is the <b className="text-zinc-700">only way</b> to get back into your account. Store it somewhere safe — a password manager, or a printed copy.
      </p>
      <div className="mt-6 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-center font-mono text-lg font-semibold tracking-wider text-zinc-900 sm:text-xl" data-testid="recovery-code">
        {code}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          icon={copied ? Check : Copy}
          onClick={() => {
            navigator.clipboard?.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button
          variant="secondary"
          icon={Download}
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`Involet recovery code\n\n${code}\n\nUse it at ${location.origin}/recover if you forget your password.\n`], { type: 'text/plain' }))
            Object.assign(document.createElement('a'), { href: url, download: 'involet-recovery-code.txt' }).click()
            URL.revokeObjectURL(url)
          }}
        >
          Download
        </Button>
      </div>
      <label className="mt-6 flex items-start gap-2.5 text-sm text-zinc-700">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I’ve saved my recovery code somewhere safe
      </label>
      <Button className="mt-5 w-full py-2.5" disabled={!saved || !!busy} onClick={onContinue}>
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {busy}
          </>
        ) : (
          'Continue'
        )}
      </Button>
    </div>
  )
}
