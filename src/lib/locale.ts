import type { ClientInfo, Currency, LineItem } from '../db'

/**
 * Sensible starting points per market, picked from the browser's time zone and language.
 * A Dhaka visitor starts with Taka, 15% VAT and bKash; a London visitor with pounds and 20% VAT.
 * Everything can be changed in Settings.
 */
interface Region {
  currency: Currency
  taxLabel: string
  taxRate: number
  /** Mobile wallets (bKash, Nagad, Rocket) are offered as payment methods. */
  wallets: boolean
  sampleClient: ClientInfo
  sampleItems: Array<Pick<LineItem, 'description' | 'rate'>>
  placeholder: { name: string; phone: string; address: string }
}

const items = (web: number, brand: number, hosting: number) => [
  { description: 'Website design & development', rate: web },
  { description: 'Logo & brand guidelines', rate: brand },
  { description: 'Hosting (1 year)', rate: hosting },
]

const REGIONS: Record<Currency, Region> = {
  BDT: {
    currency: 'BDT',
    taxLabel: 'VAT',
    taxRate: 15,
    wallets: true,
    sampleClient: { name: 'Rahim Ahmed', company: 'Rahim Traders Ltd.', email: 'rahim@example.com', phone: '+880 1711-000000', address: 'House 12, Road 5, Gulshan, Dhaka' },
    sampleItems: items(45000, 12000, 4500),
    placeholder: { name: 'Ex. Rahim Ahmed', phone: '+880 1XXX-XXXXXX', address: 'Ex. House 12, Road 5, Dhanmondi, Dhaka' },
  },
  INR: {
    currency: 'INR',
    taxLabel: 'GST',
    taxRate: 18,
    wallets: false,
    sampleClient: { name: 'Priya Sharma', company: 'Sharma Retail Pvt. Ltd.', email: 'priya@example.com', phone: '+91 98200 00000', address: '14 Hill Road, Bandra West, Mumbai 400050' },
    sampleItems: items(60000, 15000, 5000),
    placeholder: { name: 'Ex. Priya Sharma', phone: '+91 98XXX XXXXX', address: 'Ex. 14 Hill Road, Bandra West, Mumbai' },
  },
  GBP: {
    currency: 'GBP',
    taxLabel: 'VAT',
    taxRate: 20,
    wallets: false,
    sampleClient: { name: 'Oliver Bennett', company: 'Bennett & Co. Ltd', email: 'oliver@example.com', phone: '+44 7700 900123', address: '12 King Street, Manchester M2 4LQ' },
    sampleItems: items(2400, 650, 120),
    placeholder: { name: 'Ex. Oliver Bennett', phone: '+44 7700 900000', address: 'Ex. 12 King Street, Manchester M2 4LQ' },
  },
  EUR: {
    currency: 'EUR',
    taxLabel: 'VAT',
    taxRate: 20,
    wallets: false,
    sampleClient: { name: 'Lena Fischer', company: 'Fischer Studio GmbH', email: 'lena@example.com', phone: '+49 30 1234567', address: 'Torstraße 12, 10119 Berlin' },
    sampleItems: items(2800, 750, 140),
    placeholder: { name: 'Ex. Lena Fischer', phone: '+49 30 0000000', address: 'Ex. Torstraße 12, 10119 Berlin' },
  },
  USD: {
    currency: 'USD',
    taxLabel: 'Tax',
    taxRate: 0,
    wallets: false,
    sampleClient: { name: 'Emily Carter', company: 'Carter Goods Inc.', email: 'emily@example.com', phone: '+1 (415) 555-0132', address: '125 Market St, San Francisco, CA 94105' },
    sampleItems: items(3200, 850, 150),
    placeholder: { name: 'Ex. Emily Carter', phone: '+1 (555) 000-0000', address: 'Ex. 125 Market St, San Francisco, CA' },
  },
}

const EURO_ZONES = /^Europe\/(Amsterdam|Athens|Berlin|Bratislava|Brussels|Dublin|Helsinki|Lisbon|Ljubljana|Luxembourg|Madrid|Malta|Monaco|Paris|Riga|Rome|Tallinn|Vienna|Vilnius|Zagreb)$/

/** The currency people in this browser's region most likely invoice in. */
export function detectCurrency(): Currency {
  let tz = ''
  let lang = ''
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
    lang = typeof navigator === 'undefined' ? '' : navigator.language ?? ''
  } catch {
    /* unknown: fall through */
  }
  if (tz === 'Asia/Dhaka' || /^bn\b|-BD$/i.test(lang)) return 'BDT'
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta' || /-IN$/i.test(lang)) return 'INR'
  if (tz === 'Europe/London' || /-GB$/i.test(lang)) return 'GBP'
  if (EURO_ZONES.test(tz)) return 'EUR'
  return 'USD'
}

/** Defaults for a new workspace in this browser's region. */
export function regionDefaults() {
  const r = REGIONS[detectCurrency()]
  return { currency: r.currency, taxLabel: r.taxLabel, taxRate: r.taxRate }
}

/** Region details for a currency (sample data, placeholders, wallets). */
export const region = (currency: Currency): Region => REGIONS[currency] ?? REGIONS.USD
