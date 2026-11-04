import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { clearMonitoringCache } from './utils/dbCache'

// Auto-cleanup legacy cache (IndexedDB & LocalStorage) agar browser tidak tersangkut di cache lama
clearMonitoringCache().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
