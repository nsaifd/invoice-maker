// Account API client. The password itself never leaves the browser: we send a PBKDF2-derived key.

export interface User {
  id: string
  email: string
}

const enc = new TextEncoder()
const toBase64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const normalizeEmail = (email: string) => email.trim().toLowerCase()

async function passwordKey(email: string, password: string): Promise<string> {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`involet-auth:${normalizeEmail(email)}`), iterations: 310_000 }, material, 256)
  return toBase64(bits)
}

/** Recovery codes are random and long, so a single SHA-256 is enough. */
async function recoveryKey(email: string, code: string): Promise<string> {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return toBase64(await crypto.subtle.digest('SHA-256', enc.encode(`involet-recovery:${normalizeEmail(email)}:${clean}`)))
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789' // no 0/O, 1/I/L, U

/** 20 characters ≈ 98 bits, shown as XXXX-XXXX-XXXX-XXXX-XXXX. */
export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
  return chars.match(/.{4}/g)!.join('-')
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', 'x-involet': '1' },
      body: init.body ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'You appear to be offline. Check your internet connection.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (password.length > 200) return 'That password is too long.'
  return null
}

export async function signup(email: string, password: string): Promise<{ user: User; recoveryCode: string }> {
  const recoveryCode = newRecoveryCode()
  const { user } = await api<{ user: User }>('auth/signup', {
    body: { email, key: await passwordKey(email, password), recoveryKey: await recoveryKey(email, recoveryCode) },
  })
  return { user, recoveryCode }
}

export async function login(email: string, password: string): Promise<User> {
  const { user } = await api<{ user: User }>('auth/login', { body: { email, key: await passwordKey(email, password) } })
  return user
}

export async function recover(email: string, code: string, newPassword: string): Promise<{ user: User; recoveryCode: string }> {
  const recoveryCode = newRecoveryCode()
  const { user } = await api<{ user: User }>('auth/recover', {
    body: {
      email,
      recoveryKey: await recoveryKey(email, code),
      newKey: await passwordKey(email, newPassword),
      newRecoveryKey: await recoveryKey(email, recoveryCode),
    },
  })
  return { user, recoveryCode }
}

export async function me(): Promise<User | null> {
  try {
    return (await api<{ user: User | null }>('auth/me')).user
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null
    throw e
  }
}

export const logoutRequest = () => api('auth/logout', { body: {} })

export async function changePassword(email: string, current: string, next: string) {
  await api('auth/password', { body: { key: await passwordKey(email, current), newKey: await passwordKey(email, next) } })
}

export async function regenerateRecoveryCode(email: string, password: string): Promise<string> {
  const code = newRecoveryCode()
  await api('auth/recovery-code', { body: { key: await passwordKey(email, password), newRecoveryKey: await recoveryKey(email, code) } })
  return code
}

export async function deleteAccount(email: string, password: string) {
  await api('auth/delete', { body: { key: await passwordKey(email, password) } })
}
