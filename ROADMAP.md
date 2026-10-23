# Involet — Feature Roadmap

Limit: shudhu Cloudflare-er free service, kono third-party API na, online payment na.

## Top priority (shuru korbo egulo diye)

- [~] **Payment record, partial payment, receipt** — client reports payment from the link, owner confirms, partial payments (2026-10-23). Baki: owner nije haate payment jog kora, alada receipt PDF.
  - Advance, kisti ar baki taka track kora (jemon ৳50,000-er moddhe ৳20,000 bKash-e paoa gechhe).
  - Prottek payment-er jonno auto receipt, ar invoice-e "Balance Due".
- [ ] **Bangla invoice**
  - Puro invoice Bangla-y: lekha, Bangla shonkha (৳১২,৫০০), kothay amount ("বারো হাজার পাঁচশত টাকা মাত্র").
- [ ] **Reports ar VAT summary**
  - Mashik income, client onujayi income, baki-r boyosh (30/60/90 din).
  - VAT-er mashik hishab, Excel/CSV export.
- [ ] **Expense tracking**
  - Khoroch ar receipt-er chhobi rakha (Cloudflare R2), income theke khoroch bad diye lav.
- [ ] **Client portal**
  - Client-er jonno ekta link: tar shob invoice, proposal, payment ar statement ek jaygay.

## Aro idea

- [ ] Quotation/Estimate, Credit Note, Delivery Challan, Purchase Order
- [ ] Invoice-e QR code (online invoice link ba bKash number)
- [ ] Due date periye gele auto late fee
- [ ] Reminder (Cloudflare Cron Triggers): email/WhatsApp message ready, user nije pathabe
- [ ] Mobile app-er moto install (PWA)
- [ ] CSV/Excel theke client ar product import
- [ ] Time tracking theke invoice-e line jog
- [ ] Team member ar multi-business (permission-shoho)
- [ ] Proposal analytics: kon section koto khon pora hoyechhe

## Kora jabe na (limit-er karone)

- App theke shoja email pathano: third-party email service lagbe. Ekhon nijer email/WhatsApp diye pathano chalu thakbe.
- Online payment gateway: bad deoa hoyechhe.

## Shesh hoyechhe

- [x] Invoice MVP, 36+ design, font
- [x] Proposal (20 theme), share link, e-signature, tracking, invoice-e convert
- [x] Recurring invoice, reminder, template
- [x] Nijer design upload kore edit
- [x] Account ar cloud sync (shob device-e)
- [x] Number/amount bug fix (2026-10-21)
- [x] Login-first flow ar ekta profile menu (2026-10-22)
- [x] Landing page home.involet.saifux.co-te (2026-10-22)
- [x] Invoice link-e client confirm, "I've paid" (TrxID, screenshot), owner review (2026-10-23)
