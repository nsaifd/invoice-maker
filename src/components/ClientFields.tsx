import { Building2, Mail, Phone, User } from 'lucide-react'
import type { ClientInfo } from '../db'
import { Field, IconInput, inputCls } from './ui'

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
