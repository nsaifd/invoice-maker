import type { ClientInfo } from '../db'
import { Field, inputCls } from './ui'

export function ClientFields({ value, onChange }: { value: ClientInfo; onChange: (v: ClientInfo) => void }) {
  const set = (k: keyof ClientInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name *">
        <input className={inputCls} value={value.name} onChange={set('name')} />
      </Field>
      <Field label="Company">
        <input className={inputCls} value={value.company} onChange={set('company')} />
      </Field>
      <Field label="Email">
        <input type="email" className={inputCls} value={value.email} onChange={set('email')} />
      </Field>
      <Field label="Phone">
        <input className={inputCls} value={value.phone} onChange={set('phone')} />
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <textarea rows={2} className={inputCls} value={value.address} onChange={set('address')} />
      </Field>
    </div>
  )
}
