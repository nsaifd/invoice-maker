import type { Currency } from '../db'

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function under1000(n: number): string {
  const parts: string[] = []
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`)
    n %= 100
  }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''))
  else if (n > 0) parts.push(ONES[n])
  return parts.join(' ')
}

/** South Asian grouping: crore, lakh, thousand. */
function southAsian(n: number): string {
  if (n === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(n / 10_000_000)
  if (crore) parts.push(`${southAsian(crore)} Crore`)
  n %= 10_000_000
  const lakh = Math.floor(n / 100_000)
  if (lakh) parts.push(`${under1000(lakh)} Lakh`)
  n %= 100_000
  const thousand = Math.floor(n / 1000)
  if (thousand) parts.push(`${under1000(thousand)} Thousand`)
  n %= 1000
  if (n) parts.push(under1000(n))
  return parts.join(' ')
}

function international(n: number): string {
  if (n === 0) return 'Zero'
  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion']
  const parts: string[] = []
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000
    if (chunk) parts.unshift(`${under1000(chunk)}${scales[i] ? ` ${scales[i]}` : ''}`)
  }
  return parts.join(' ')
}

const UNITS: Record<Currency, [major: string, minor: string, southAsian: boolean]> = {
  BDT: ['Taka', 'Paisa', true],
  INR: ['Rupees', 'Paise', true],
  USD: ['US Dollars', 'Cents', false],
  EUR: ['Euros', 'Cents', false],
  GBP: ['Pounds', 'Pence', false],
}

/** 3053250 (cents), 'BDT' → "Taka Thirty Thousand Five Hundred Thirty-Two and Fifty Paisa Only" */
export function amountInWords(cents: number, currency: Currency): string {
  const [major, minor, sa] = UNITS[currency] ?? UNITS.USD
  const whole = Math.floor(Math.abs(cents) / 100)
  const frac = Math.abs(cents) % 100
  const say = sa ? southAsian : international
  return `${major} ${say(whole)}${frac ? ` and ${say(frac)} ${minor}` : ''} Only`
}
