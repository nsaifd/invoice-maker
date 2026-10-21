import { Building2, ChevronDown, Mail, Phone, User } from 'lucide-react'
import { emptyClient, type Client, type ClientInfo } from '../db'
import { Field, IconInput, initials, inputCls } from './ui'

export function ClientFields({ value, onChange }: { value: ClientInfo; onChange: (v: ClientInfo) => void }) {
  const set = (k: keyof ClientInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full Name *">
        <IconInput icon={User} placeholder="Ex. Rahim Ahmed" value={value.name} onChange={set('name')} />
      </Field>
      <Field label="Company">
        <IconInput icon={Building2} placeholder="Ex. Acme Corp" value={value.company} onChange={set('company')} />
      </Field>
      <Field label="Email">
        <IconInput icon={Mail} type="email" placeholder="name@company.com" value={value.email} onChange={set('email')} />
      </Field>
      <Field label="Phone">
        <IconInput icon={Phone} placeholder="+880 1XXX-XXXXXX" value={value.phone} onChange={set('phone')} />
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <textarea rows={2} className={inputCls} placeholder="Ex. 123 Road, Dhanmondi, Dhaka" value={value.address} onChange={set('address')} />
      </Field>
    </div>
  )
}

/** Pill-shaped saved-client selector shown next to the client section title. */
export function ClientPicker({
  clients,
  clientId,
  client,
  onSelect,
}: {
  clients: Client[]
  clientId?: string
  client: ClientInfo
  onSelect: (clientId: string | undefined, client: ClientInfo) => void
}) {
  if (!clients.length) return null
  return (
    <div className="relative flex items-center gap-2.5 rounded-full border border-zinc-200 bg-white py-1.5 pl-1.5 pr-9 shadow-xs">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">{initials(client.name || '+')}</span>
      <span className="min-w-0 max-w-44">
        <span className="block truncate text-sm font-medium text-zinc-900">{clientId ? client.name : 'New client'}</span>
        <span className="block truncate text-xs text-zinc-500">{clientId ? client.email || client.company : 'or pick a saved one'}</span>
      </span>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-zinc-400" />
      <select
        aria-label="Saved client"
        className="absolute inset-0 cursor-pointer opacity-0"
        value={clientId ?? ''}
        onChange={(e) => {
          const c = clients.find((x) => x.id === e.target.value)
          if (c) onSelect(c.id, { name: c.name, company: c.company, email: c.email, phone: c.phone, address: c.address })
          else onSelect(undefined, { ...emptyClient })
        }}
      >
        <option value="">— New client —</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.company ? ` (${c.company})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
