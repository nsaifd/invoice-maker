import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { Layout } from './components/Layout'
import InvoicesPage from './pages/InvoicesPage'
import InvoiceEditor from './pages/InvoiceEditor'
import InvoiceView from './pages/InvoiceView'
import ClientsPage from './pages/ClientsPage'
import ProductsPage from './pages/ProductsPage'
import SettingsPage from './pages/SettingsPage'
import ProposalsPage from './pages/ProposalsPage'
import ProposalEditor from './pages/ProposalEditor'
import ProposalView from './pages/ProposalView'
import RecurringPage from './pages/RecurringPage'
import PublicPage from './pages/PublicPage'
import TemplatesPage from './pages/TemplatesPage'

// Ask the browser not to evict our IndexedDB data under storage pressure.
navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="p/:id" element={<PublicPage />} />
        <Route element={<Layout />}>
          <Route index element={<InvoicesPage />} />
          <Route path="invoices/new" element={<InvoiceEditor />} />
          <Route path="invoices/:id" element={<InvoiceView />} />
          <Route path="invoices/:id/edit" element={<InvoiceEditor />} />
          <Route path="proposals" element={<ProposalsPage />} />
          <Route path="proposals/new" element={<ProposalEditor />} />
          <Route path="proposals/:id" element={<ProposalView />} />
          <Route path="proposals/:id/edit" element={<ProposalEditor />} />
          <Route path="recurring" element={<RecurringPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<InvoicesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
