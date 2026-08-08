'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { User } from 'firebase/auth'
import { useSession } from 'next-auth/react'
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { db, initAuth } from './firebase'
import { formatCurrency, generateId, numberToSpanishWords } from './utils'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

// Fixed shared workspace path — this panel is internal-only (already gated
// by the /admin NextAuth login), so the whole team reads/writes the same
// Firestore data instead of a per-Google-account uid namespace.
const ORG_ID = 'relevvo'
import {
  Client, ServiceItem, Invoice, InvoiceItem, InvoiceStatus,
  Expense, ExpenseCategory, ExpenseStatus,
  Employee, PayrollEntry, PayrollStatus, AppSettings,
} from './types'

// ── Design tokens — light/cream theme matching the original finanzapro app ──
const T = {
  bg: '#FFFDF5', sidebar: '#FFFFFF', card: '#FFFFFF', cardHigh: '#FFF8E7',
  primary: '#7C3AED', primaryC: '#7C3AED', secondary: '#16A34A', tertiary: '#DB2777',
  surface: '#FFF9EC', onSurf: '#1F2937', muted: '#78716C',
  border: '#F0E6C8', borderMd: '#E7DAAE',
  danger: '#DC2626', warn: '#D97706',
}

const inputStyle: React.CSSProperties = {
  background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 12px',
  fontSize: 13, color: T.onSurf, outline: 'none', width: '100%',
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: T.muted, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.08em', display: 'block', marginBottom: 6,
}
const btnPrimary: React.CSSProperties = {
  background: T.primaryC, color: T.onSurf, border: 'none', borderRadius: 10,
  padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: T.muted, border: `1px solid ${T.border}`, borderRadius: 10,
  padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const iconBtn: React.CSSProperties = {
  background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, width: 32, height: 32,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.muted,
}

// Note: InvoiceStatus/ExpenseStatus/PayrollStatus share several Spanish labels
// ('Pendiente', 'Pagado') — a single lookup by label covers all three enums.
const STATUS_COLOR: Record<string, string> = {
  [InvoiceStatus.PAID]: T.secondary,
  [InvoiceStatus.PENDING]: T.warn,
  [InvoiceStatus.PARTIALLY_PAID]: T.primary,
  [InvoiceStatus.DRAFT]: T.muted,
  [InvoiceStatus.CANCELLED]: T.danger,
}

function Badge({ label }: { label: string }) {
  const c = STATUS_COLOR[label] || T.muted
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
      color: c, background: `${c}22`, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18,
      boxShadow: '0 1px 3px rgba(120,90,20,0.06)', ...style,
    }}>{children}</div>
  )
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.sidebar, border: `1px solid ${T.borderMd}`, borderRadius: 18,
        padding: 24, width: '100%', maxWidth: wide ? 720 : 460, maxHeight: '88vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: T.onSurf }}>{title}</h3>
          <button onClick={onClose} style={iconBtn}><Icon name="close" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>
}

// ── PDF generation ─────────────────────────────────────────────
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

// Clean, text-only invoice document — used for Imprimir/Descargar PDF so the
// output never contains live form controls (inputs, selects, date pickers).
// The interactive editor (InvoiceModal) is a separate on-screen-only view.
function buildInvoiceHtml(invoice: Invoice, settings: AppSettings): string {
  const cur = settings.currency
  const saldo = invoice.total - (invoice.amountPaid || 0)
  const rows = invoice.items.map(it => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #EEE8D5;font-size:12px;">${it.serviceName || '—'}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #EEE8D5;font-size:12px;text-align:center;">${it.quantity}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #EEE8D5;font-size:12px;text-align:right;">${formatCurrency(it.unitPrice, cur)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #EEE8D5;font-size:12px;text-align:right;font-weight:700;">${formatCurrency(it.total, cur)}</td>
    </tr>`).join('')
  return `
  <div style="font-family:Helvetica,Arial,sans-serif;color:#1F2937;padding:44px;width:700px;line-height:1.5;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
      <div>
        ${settings.logoUrl ? `<img src="${settings.logoUrl}" style="max-width:140px;max-height:70px;object-fit:contain;margin-bottom:12px;display:block;" />` : ''}
        <h1 style="font-size:24px;font-weight:900;margin:4px 0 2px;letter-spacing:-0.02em;">CUENTA DE COBRO</h1>
        <p style="font-size:12px;color:#6B7280;margin:0;">No. ${invoice.number}</p>
      </div>
      <div style="text-align:right;">
        <p style="font-size:15px;font-weight:800;margin:0;">${settings.companyName || 'Relevvo Studio'}</p>
        <p style="font-size:11px;color:#6B7280;margin:3px 0;">NIT: ${settings.companyNit || '-'}</p>
        <p style="font-size:11px;color:#6B7280;margin:3px 0;">${settings.companyAddress || ''}</p>
        <p style="font-size:11px;color:#6B7280;margin:3px 0;">${settings.companyPhone || ''}${settings.companyEmail ? ' · ' + settings.companyEmail : ''}</p>
      </div>
    </div>

    <hr style="border:none;border-top:1.5px solid #1F2937;margin-bottom:22px;" />

    <div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:26px;flex-wrap:wrap;">
      <div style="background:#FFF9EC;border-radius:10px;padding:14px 18px;min-width:240px;">
        <p style="font-size:10px;color:#78716C;text-transform:uppercase;letter-spacing:.04em;margin:0 0 5px;">Cliente</p>
        <p style="font-size:14px;font-weight:800;margin:0;">${invoice.clientName}</p>
        <p style="font-size:11px;color:#6B7280;margin:3px 0 0;">NIT: ${invoice.clientNit || '-'}</p>
      </div>
      <div style="text-align:right;font-size:12px;color:#374151;">
        <p style="margin:5px 0;">Fecha de Emisión: <b>${fmtDate(invoice.date)}</b></p>
        <p style="margin:5px 0;">Fecha de Vencimiento: <b>${fmtDate(invoice.dueDate)}</b></p>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
      <thead>
        <tr style="background:#F0E6C8;">
          <th style="padding:9px 8px;text-align:left;font-size:11px;font-weight:800;">Descripción</th>
          <th style="padding:9px 8px;text-align:center;font-size:11px;font-weight:800;width:60px;">Cant.</th>
          <th style="padding:9px 8px;text-align:right;font-size:11px;font-weight:800;width:110px;">Precio Unit.</th>
          <th style="padding:9px 8px;text-align:right;font-size:11px;font-weight:800;width:110px;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;margin:18px 0 24px;">
      <div style="width:260px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:#374151;"><span>Subtotal</span><span>${formatCurrency(invoice.subtotal, cur)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:#374151;"><span>IVA (${invoice.tax}%)</span><span>${formatCurrency(invoice.taxAmount, cur)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;padding:9px 0;border-top:2px solid #1F2937;margin-top:4px;"><span>Total</span><span>${formatCurrency(invoice.total, cur)}</span></div>
        <div style="background:#FFF9EC;border-radius:10px;padding:12px 14px;margin-top:12px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;margin-bottom:5px;"><span>Abonado</span><span>${formatCurrency(invoice.amountPaid || 0, cur)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800;color:${saldo > 0 ? '#DC2626' : '#16A34A'};"><span>Saldo Pendiente</span><span>${formatCurrency(saldo, cur)}</span></div>
        </div>
      </div>
    </div>

    <p style="font-size:10.5px;color:#78716C;font-style:italic;text-transform:uppercase;margin-bottom:22px;">Son: ${numberToSpanishWords(invoice.total)}</p>

    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:18px;">
      ${settings.bankDetails ? `
      <div style="flex:1;min-width:220px;">
        <p style="font-size:12px;font-weight:800;margin:0 0 4px;">Datos Bancarios</p>
        <p style="font-size:11px;color:#6B7280;margin:0;">${settings.bankDetails}</p>
      </div>` : ''}
      ${invoice.notes ? `
      <div style="flex:1;min-width:220px;">
        <p style="font-size:12px;font-weight:800;margin:0 0 4px;">Notas</p>
        <p style="font-size:11px;color:#6B7280;margin:0;">${invoice.notes}</p>
      </div>` : ''}
    </div>

    ${invoice.isRecurring ? `<p style="display:inline-block;background:#FFF9EC;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;margin-bottom:14px;">↻ Factura Recurrente Mensual</p>` : ''}

    <p style="font-size:10px;color:#9CA3AF;text-align:center;margin-top:20px;">Documento generado electrónicamente por Relevvo Studio</p>
  </div>`
}

async function downloadInvoicePdf(invoice: Invoice, settings: AppSettings) {
  const html2pdf = (await import('html2pdf.js')).default
  // html2canvas (which html2pdf.js uses internally) renders blank/white output
  // for elements positioned far offscreen (e.g. left:-9999px) — keep the node
  // inside the viewport but hidden behind everything via z-index instead.
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '0'
  container.style.zIndex = '-9999'
  container.style.pointerEvents = 'none'
  container.innerHTML = buildInvoiceHtml(invoice, settings)
  document.body.appendChild(container)
  // Wait a frame so the browser has actually laid out/painted the node
  // (including the logo <img>, if any) before html2canvas snapshots it.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  try {
    await html2pdf().from(container).set({
      margin: 0, filename: `${invoice.number}.pdf`,
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'pt', format: 'letter', orientation: 'portrait' },
    }).save()
  } finally {
    document.body.removeChild(container)
  }
}

const SUB_NAV = [
  { id: 'resumen', icon: 'monitoring', label: 'Resumen' },
  { id: 'facturas', icon: 'request_quote', label: 'Ingresos' },
  { id: 'gastos', icon: 'payments', label: 'Gastos' },
  { id: 'nomina', icon: 'badge', label: 'Nómina' },
  { id: 'clientes', icon: 'group', label: 'Clientes' },
  { id: 'servicios', icon: 'sell', label: 'Servicios' },
  { id: 'config', icon: 'settings', label: 'Configuración' },
] as const
type SubNav = typeof SUB_NAV[number]['id']

const todayStr = () => new Date().toISOString().slice(0, 10)
const thisPeriod = () => new Date().toISOString().slice(0, 7)

const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'Relevvo Studio', companyNit: '', companyAddress: '', companyEmail: '',
  companyPhone: '', currency: 'COP', taxRate: 0, logoUrl: '', bankDetails: '',
  invoicePrefix: 'REL', nextInvoiceNumber: 1,
}

export default function FinanzasPanel() {
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authStep, setAuthStep] = useState<'auth' | 'data' | 'done'>('auth')
  const [user, setUser] = useState<User | null>(null)
  const [sub, setSub] = useState<SubNav>('resumen')

  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<ServiceItem[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [payroll, setPayroll] = useState<PayrollEntry[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  const [editingClient, setEditingClient] = useState<Client | null | 'new'>(null)
  const [editingService, setEditingService] = useState<ServiceItem | null | 'new'>(null)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null | 'new'>(null)
  const [editingExpense, setEditingExpense] = useState<Expense | null | 'new'>(null)
  const [newExpenseDate, setNewExpenseDate] = useState<string | null>(null)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null | 'new'>(null)
  const [payrollPeriod, setPayrollPeriod] = useState(thisPeriod())

  // ── Auth ──
  useEffect(() => {
    const unsub = initAuth(
      (u) => { setUser(u); setAuthReady(true); setAuthStep('data') },
      (err: any) => {
        setUser(null); setAuthReady(true)
        const code = err?.code || ''
        setAuthError(
          code.includes('admin-restricted-operation') || code.includes('operation-not-allowed')
            ? 'El proveedor de autenticación anónima no está habilitado en este proyecto de Firebase.'
            : `No se pudo conectar con Firebase (${code || 'error desconocido'}).`
        )
      },
    )
    // Watchdog: if auth never resolves (success or failure) within 10s, something is hung.
    const watchdog = setTimeout(() => {
      setAuthReady(current => {
        if (!current) setAuthError(prev => prev ?? 'La conexión está tardando demasiado. Revisa tu internet o vuelve a intentar.')
        return current
      })
    }, 10000)
    return () => { unsub(); clearTimeout(watchdog) }
  }, [])

  const { data: session } = useSession()
  const displayName = session?.user?.name || session?.user?.email || 'Equipo Relevvo'

  // ── Firestore listeners (fixed shared path finanzas/{ORG_ID}/...) ──
  useEffect(() => {
    if (!user) return
    let resolved = 0
    const markResolved = () => { resolved++; if (resolved === 1) setAuthStep('done') }
    const onErr = (label: string) => (err: any) => {
      console.error(`Firestore listener failed (${label})`, err)
      if (err?.code === 'permission-denied') {
        setAuthError('Firestore rechazó el acceso (permission-denied). Las reglas de seguridad de Firestore probablemente no están desplegadas todavía — revisa app/admin/_finanzas/firestore.rules en la Consola de Firebase.')
      } else {
        setAuthError(`Error leyendo datos de Firestore (${label}): ${err?.message || err}`)
      }
    }
    const unsubs = [
      onSnapshot(collection(db, 'finanzas', ORG_ID, 'clients'), snap => { setClients(snap.docs.map(d => d.data() as Client)); markResolved() }, onErr('clients')),
      onSnapshot(collection(db, 'finanzas', ORG_ID, 'services'), snap => setServices(snap.docs.map(d => d.data() as ServiceItem)), onErr('services')),
      onSnapshot(collection(db, 'finanzas', ORG_ID, 'invoices'), snap => setInvoices(snap.docs.map(d => d.data() as Invoice)), onErr('invoices')),
      onSnapshot(collection(db, 'finanzas', ORG_ID, 'expenses'), snap => setExpenses(snap.docs.map(d => d.data() as Expense)), onErr('expenses')),
      onSnapshot(collection(db, 'finanzas', ORG_ID, 'employees'), snap => setEmployees(snap.docs.map(d => d.data() as Employee)), onErr('employees')),
      onSnapshot(collection(db, 'finanzas', ORG_ID, 'payroll'), snap => setPayroll(snap.docs.map(d => d.data() as PayrollEntry)), onErr('payroll')),
      // settings is a single doc, not a collection
      onSnapshot(doc(db, 'finanzas', ORG_ID, 'settings', 'main'), snap => {
        if (snap.exists()) setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as AppSettings) })
      }, onErr('settings')),
    ]
    return () => unsubs.forEach(u => u())
  }, [user])

  const logActivity = useCallback(async (action: string) => {
    if (!user) return
    try {
      await addDoc(collection(db, 'finanzas', ORG_ID, 'activity'), {
        action, at: serverTimestamp(), by: displayName,
      })
    } catch (e) { console.error('logActivity failed', e) }
  }, [user, displayName])

  // ── Generic Firestore save/delete helpers ──
  const save = useCallback(async (col: string, data: any) => {
    if (!user) return
    await setDoc(doc(db, 'finanzas', ORG_ID, col, data.id), data)
  }, [user])
  const remove = useCallback(async (col: string, id: string) => {
    if (!user) return
    await deleteDoc(doc(db, 'finanzas', ORG_ID, col, id))
  }, [user])

  // ── Derived totals ──
  const totals = useMemo(() => {
    const ingresos = invoices.filter(i => i.status !== InvoiceStatus.CANCELLED && i.status !== InvoiceStatus.DRAFT)
      .reduce((s, i) => s + i.total, 0)
    const cobrado = invoices.reduce((s, i) => s + (i.amountPaid || 0), 0)
    const porCobrar = invoices.filter(i => i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.PARTIALLY_PAID)
      .reduce((s, i) => s + (i.total - (i.amountPaid || 0)), 0)
    const gastos = expenses.reduce((s, e) => s + e.amount, 0)
    const gastosPagados = expenses.filter(e => e.status === ExpenseStatus.PAID).reduce((s, e) => s + e.amount, 0)
    const nominaMes = payroll.filter(p => p.period === thisPeriod()).reduce((s, p) => s + p.total, 0)
    const nominaPendiente = payroll.filter(p => p.status === PayrollStatus.PENDING).reduce((s, p) => s + p.total, 0)
    return { ingresos, cobrado, porCobrar, gastos, gastosPagados, nominaMes, nominaPendiente, balance: cobrado - gastosPagados }
  }, [invoices, expenses, payroll])

  // ── Loading gate ──
  // No user-facing login here: access is already gated by the /admin NextAuth
  // session. Firebase signs in anonymously in the background (see firebase.ts)
  // purely so Firestore's rules have a request.auth to check.
  if (authStep !== 'done') {
    const pct = authStep === 'auth' ? 30 : 70
    const label = authStep === 'auth' ? 'Conectando con Firebase…' : 'Cargando datos financieros…'
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
        <Card style={{ maxWidth: 420, width: '100%', padding: 28 }}>
          <p style={{ fontSize: 13, color: T.onSurf, fontWeight: 600, marginBottom: 12 }}>{authError ? 'Algo se bloqueó' : label}</p>
          <div style={{ height: 6, borderRadius: 999, background: T.surface, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{
              height: '100%', borderRadius: 999,
              width: authError ? '100%' : `${pct}%`,
              background: authError ? T.danger : `linear-gradient(90deg, ${T.primaryC}, ${T.primary})`,
              transition: 'width .4s ease',
            }} />
          </div>
          {!authError && (
            <p style={{ fontSize: 11, color: T.muted }}>Paso {authStep === 'auth' ? '1' : '2'} de 2 — no cierres esta pestaña.</p>
          )}
          {authError && (
            <div>
              <p style={{ fontSize: 12, color: T.danger, lineHeight: 1.5, marginBottom: 14 }}>{authError}</p>
              <button style={{ ...btnPrimary, width: '100%' }} onClick={() => window.location.reload()}>Reintentar</button>
            </div>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, padding: '22px 24px 28px' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: T.onSurf }}>{SUB_NAV.find(n => n.id === sub)?.label === 'Resumen' ? 'Panel de Control' : SUB_NAV.find(n => n.id === sub)?.label}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: T.secondary,
            background: `${T.secondary}18`, border: `1px solid ${T.secondary}40`, borderRadius: 999, padding: '5px 12px',
          }}><Icon name="cloud_done" size={14} />Auditoría: Nube Conectada</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.muted }}>
            <Icon name="account_circle" size={16} /><span>{displayName}</span>
          </div>
        </div>
      </div>

      {/* sub-nav */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {SUB_NAV.map(n => {
          const active = sub === n.id
          return (
            <button key={n.id} onClick={() => setSub(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
              border: `1px solid ${active ? T.primaryC : T.border}`,
              background: active ? 'rgba(124,58,237,0.12)' : 'transparent',
              color: active ? T.primary : T.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              <Icon name={n.icon} size={16} />{n.label}
            </button>
          )
        })}
      </div>

      {sub === 'resumen' && <ResumenView totals={totals} invoices={invoices} expenses={expenses} settings={settings} clientCount={clients.length} />}
      {sub === 'facturas' && (
        <FacturasView
          invoices={invoices} clients={clients} services={services} settings={settings}
          onNew={() => setEditingInvoice('new')} onEdit={(i) => setEditingInvoice(i)}
          onDelete={async (i) => { await remove('invoices', i.id); logActivity(`Eliminó factura ${i.number}`) }}
          onToggleStatus={async (i) => {
            const nextStatus = i.status === InvoiceStatus.PAID ? InvoiceStatus.PENDING : InvoiceStatus.PAID
            const updated = { ...i, status: nextStatus, amountPaid: nextStatus === InvoiceStatus.PAID ? i.total : i.amountPaid }
            await save('invoices', updated); logActivity(`Actualizó estado de factura ${i.number} a ${nextStatus}`)
          }}
        />
      )}
      {sub === 'gastos' && (
        <GastosView
          expenses={expenses}
          onNew={() => { setNewExpenseDate(null); setEditingExpense('new') }}
          onQuickNew={(date) => { setNewExpenseDate(date); setEditingExpense('new') }}
          onEdit={(e) => { setNewExpenseDate(null); setEditingExpense(e) }}
          onDelete={async (e) => { await remove('expenses', e.id); logActivity(`Eliminó gasto ${e.description}`) }}
          onToggleStatus={async (e) => {
            const nextStatus = e.status === ExpenseStatus.PAID ? ExpenseStatus.PENDING : ExpenseStatus.PAID
            await save('expenses', { ...e, status: nextStatus, amountPaid: nextStatus === ExpenseStatus.PAID ? e.amount : e.amountPaid })
            logActivity(`Actualizó estado de gasto ${e.description} a ${nextStatus}`)
          }}
          onMoveDate={async (e, date) => {
            await save('expenses', { ...e, date })
            logActivity(`Movió el gasto ${e.description} al ${date}`)
          }}
        />
      )}
      {sub === 'nomina' && (
        <NominaView
          employees={employees} payroll={payroll} period={payrollPeriod} setPeriod={setPayrollPeriod}
          onNewEmployee={() => setEditingEmployee('new')} onEditEmployee={(e) => setEditingEmployee(e)}
          onDeleteEmployee={async (e) => { await remove('employees', e.id); logActivity(`Eliminó empleado ${e.name}`) }}
          onGenerate={async () => {
            const active = employees.filter(e => e.active)
            for (const emp of active) {
              const existing = payroll.find(p => p.employeeId === emp.id && p.period === payrollPeriod)
              if (existing) continue
              const entry: PayrollEntry = {
                id: generateId(), employeeId: emp.id, employeeName: emp.name, period: payrollPeriod,
                baseSalary: emp.baseSalary, bonuses: 0, deductions: 0, total: emp.baseSalary,
                status: PayrollStatus.PENDING,
              }
              await save('payroll', entry)
            }
            logActivity(`Generó nómina del periodo ${payrollPeriod}`)
          }}
          onTogglePaid={async (p) => {
            const nextStatus = p.status === PayrollStatus.PAID ? PayrollStatus.PENDING : PayrollStatus.PAID
            await save('payroll', { ...p, status: nextStatus, paidDate: nextStatus === PayrollStatus.PAID ? todayStr() : undefined })
            logActivity(`Marcó nómina de ${p.employeeName} (${p.period}) como ${nextStatus}`)
          }}
          onEditEntry={async (p, patch) => { await save('payroll', { ...p, ...patch, total: (patch.baseSalary ?? p.baseSalary) + (patch.bonuses ?? p.bonuses) - (patch.deductions ?? p.deductions) }) }}
          onDeleteEntry={async (p) => { await remove('payroll', p.id) }}
        />
      )}
      {sub === 'clientes' && (
        <ClientesView clients={clients} onNew={() => setEditingClient('new')} onEdit={(c) => setEditingClient(c)}
          onDelete={async (c) => { await remove('clients', c.id); logActivity(`Eliminó cliente ${c.name}`) }} />
      )}
      {sub === 'servicios' && (
        <ServiciosView services={services} onNew={() => setEditingService('new')} onEdit={(s) => setEditingService(s)}
          onDelete={async (s) => { await remove('services', s.id); logActivity(`Eliminó servicio ${s.name}`) }} />
      )}
      {sub === 'config' && (
        <ConfigView
          settings={settings}
          onSave={async (s) => {
            if (!user) return
            await setDoc(doc(db, 'finanzas', ORG_ID, 'settings', 'main'), s)
            logActivity('Actualizó configuración')
          }}
          getExportData={() => ({ clients, services, invoices, expenses, employees, payroll, settings, exportedAt: new Date().toISOString() })}
          onImport={async (data) => {
            if (!user) return
            const writes: Promise<any>[] = []
            for (const c of data.clients || []) writes.push(save('clients', c))
            for (const s of data.services || []) writes.push(save('services', s))
            for (const i of data.invoices || []) writes.push(save('invoices', i))
            for (const e of data.expenses || []) writes.push(save('expenses', e))
            for (const emp of data.employees || []) writes.push(save('employees', emp))
            for (const p of data.payroll || []) writes.push(save('payroll', p))
            if (data.settings) writes.push(setDoc(doc(db, 'finanzas', ORG_ID, 'settings', 'main'), data.settings))
            await Promise.all(writes)
            logActivity('Importó una copia de seguridad')
          }}
        />
      )}

      {/* ── Modals ── */}
      {editingClient && (
        <ClientModal
          client={editingClient === 'new' ? null : editingClient}
          onClose={() => setEditingClient(null)}
          onSave={async (c) => { await save('clients', c); logActivity(`Guardó cliente ${c.name}`); setEditingClient(null) }}
        />
      )}
      {editingService && (
        <ServiceModal
          service={editingService === 'new' ? null : editingService}
          onClose={() => setEditingService(null)}
          onSave={async (s) => { await save('services', s); logActivity(`Guardó servicio ${s.name}`); setEditingService(null) }}
        />
      )}
      {editingInvoice && (
        <InvoiceModal
          invoice={editingInvoice === 'new' ? null : editingInvoice}
          clients={clients} services={services} settings={settings}
          onClose={() => setEditingInvoice(null)}
          onSave={async (inv, isNew) => {
            await save('invoices', inv)
            if (isNew) {
              await setDoc(doc(db, 'finanzas', ORG_ID, 'settings', 'main'), { ...settings, nextInvoiceNumber: settings.nextInvoiceNumber + 1 })
            }
            logActivity(`Guardó factura ${inv.number}`); setEditingInvoice(null)
          }}
        />
      )}
      {editingExpense && (
        <ExpenseModal
          expense={editingExpense === 'new' ? null : editingExpense}
          defaultDate={newExpenseDate}
          onClose={() => setEditingExpense(null)}
          onSave={async (e) => { await save('expenses', e); logActivity(`Guardó gasto ${e.description}`); setEditingExpense(null) }}
        />
      )}
      {editingEmployee && (
        <EmployeeModal
          employee={editingEmployee === 'new' ? null : editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSave={async (e) => { await save('employees', e); logActivity(`Guardó empleado ${e.name}`); setEditingEmployee(null) }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// RESUMEN — Panel de Control
// ────────────────────────────────────────────────────────────────
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MESES[m - 1]} de ${y}`
}
const lastNMonths = (n: number) => {
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  }
  return out
}

function ResumenView({ totals, invoices, expenses, settings, clientCount }: {
  totals: any; invoices: Invoice[]; expenses: Expense[]; settings: AppSettings; clientCount: number
}) {
  const cur = settings.currency || 'COP'
  const [range, setRange] = useState<3 | 6 | 12>(6)
  const [chartType, setChartType] = useState<'bar' | 'area' | 'line'>('area')
  const months = useMemo(() => lastNMonths(range), [range])
  const [selectedMonth, setSelectedMonth] = useState(months[months.length - 1])
  useEffect(() => { setSelectedMonth(m => months.includes(m) ? m : months[months.length - 1]) }, [months])

  const hasData = totals.cobrado > 0 || totals.gastosPagados > 0
  const margenNeto = totals.balance
  const salud = !hasData ? 100 : Math.max(0, Math.min(100, Math.round((totals.cobrado > 0 ? (margenNeto / totals.cobrado) * 100 : 0))))

  const chartData = useMemo(() => months.map(key => {
    const ingresos = invoices.filter(i => i.date.slice(0, 7) === key && i.status !== InvoiceStatus.CANCELLED && i.status !== InvoiceStatus.DRAFT)
      .reduce((s, i) => s + (i.amountPaid || 0), 0)
    const gastos = expenses.filter(e => e.date.slice(0, 7) === key).reduce((s, e) => s + e.amount, 0)
    return { key, label: monthLabel(key).split(' de ')[0], Ingresos: ingresos, Gastos: gastos }
  }), [months, invoices, expenses])

  const invoiceDist = useMemo(() => {
    const byStatus: Record<string, number> = {}
    invoices.forEach(i => { byStatus[i.status] = (byStatus[i.status] || 0) + 1 })
    return Object.entries(byStatus).map(([name, value]) => ({ name, value }))
  }, [invoices])
  const DIST_COLORS: Record<string, string> = {
    [InvoiceStatus.PAID]: T.secondary, [InvoiceStatus.PENDING]: T.warn,
    [InvoiceStatus.PARTIALLY_PAID]: T.primary, [InvoiceStatus.DRAFT]: T.muted, [InvoiceStatus.CANCELLED]: T.danger,
  }

  const gastosTotalMes = expenses.reduce((s, e) => s + e.amount, 0)
  const nominaPct = gastosTotalMes > 0 ? Math.round((totals.nominaMes / gastosTotalMes) * 100) : 0
  const porPagarGastos = totals.gastos - totals.gastosPagados

  const monthInvoices = invoices.filter(i => i.date.slice(0, 7) === selectedMonth)
  const monthExpenses = expenses.filter(e => e.date.slice(0, 7) === selectedMonth)
  const monthIngresos = monthInvoices.reduce((s, i) => s + (i.amountPaid || 0), 0)
  const monthEgresos = monthExpenses.reduce((s, e) => s + e.amount, 0)

  const KPI = [
    {
      label: 'Ingresos Recibidos', value: totals.cobrado, color: T.secondary, icon: 'trending_up',
      subA: ['Facturado Total:', totals.ingresos], subB: ['Por Cobrar:', totals.porCobrar],
    },
    {
      label: 'Gastos Pagados', value: totals.gastosPagados, color: T.tertiary, icon: 'trending_down',
      subA: ['Gastos Registrados:', totals.gastos], subB: ['Por Pagar:', porPagarGastos],
    },
    {
      label: 'Gastos de Nómina', value: totals.nominaMes, color: T.primary, icon: 'groups',
      subA: ['% del Total de Gastos:', null], subBRaw: `${nominaPct}%`,
    },
    {
      label: 'Balance Neto de Caja', value: totals.balance, color: '#2563EB', icon: 'monitor_heart',
      subA: ['Clientes Activos:', null], subBRaw: `${clientCount} registrados`,
    },
  ]

  return (
    <div>
      {/* Salud Financiera General */}
      <Card style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 800, color: T.onSurf, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Icon name="monitoring" size={18} />Salud Financiera General
          </h4>
          <p style={{ fontSize: 12, color: T.muted }}>Nivel basado en balance de caja real e ingresos acumulados vs egresos.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 32, fontWeight: 900, color: T.primaryC, lineHeight: 1 }}>{salud}<span style={{ fontSize: 16 }}>%</span></p>
          <p style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{!hasData ? 'SIN DATOS' : 'MARGEN'} · Margen Neto: {formatCurrency(margenNeto, cur)}</p>
        </div>
      </Card>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 16 }}>
        {KPI.map(k => (
          <Card key={k.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</span>
              <Icon name={k.icon} size={20} />
            </div>
            <p style={{ fontSize: 24, fontWeight: 900, color: k.color, marginBottom: 10 }}>{formatCurrency(k.value, cur)}</p>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, fontSize: 11, color: T.muted, display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{k.subA[0]}</span>
                <span style={{ color: T.onSurf, fontWeight: 600 }}>{k.subA[1] !== null ? formatCurrency(k.subA[1] as number, cur) : k.subBRaw}</span>
              </div>
              {k.subB && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{k.subB[0]}</span>
                  <span style={{ color: T.onSurf, fontWeight: 600 }}>{formatCurrency(k.subB[1] as number, cur)}</span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Flujo de caja + Distribución */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 800, color: T.onSurf, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="water_drop" size={16} />Flujo de Caja Interactivo
              </h4>
              <p style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Selecciona un punto en el gráfico para ver el detalle mensual</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[3, 6, 12].map(n => (
                  <button key={n} onClick={() => setRange(n as 3 | 6 | 12)} style={{
                    fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${range === n ? T.primaryC : T.border}`,
                    background: range === n ? 'rgba(124,58,237,0.1)' : 'transparent', color: range === n ? T.primary : T.muted,
                  }}>{n}M</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 2, borderLeft: `1px solid ${T.border}`, paddingLeft: 8 }}>
                {([['bar', 'bar_chart'], ['area', 'area_chart'], ['line', 'show_chart']] as const).map(([type, icon]) => (
                  <button key={type} onClick={() => setChartType(type)} style={{
                    ...iconBtn, width: 28, height: 28, borderRadius: 8,
                    color: chartType === type ? T.primary : T.muted,
                    borderColor: chartType === type ? T.primaryC : T.border,
                  }}><Icon name={icon} size={15} /></button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              {chartType === 'area' ? (
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="fIngresos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} /><stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fGastos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={T.tertiary} stopOpacity={0.35} /><stop offset="95%" stopColor={T.tertiary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: T.muted }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v), cur)} contentStyle={{ borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 12 }} />
                  <Area type="monotone" dataKey="Ingresos" stroke="#2563EB" fill="url(#fIngresos)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Gastos" stroke={T.tertiary} fill="url(#fGastos)" strokeWidth={2} />
                </AreaChart>
              ) : chartType === 'bar' ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: T.muted }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v), cur)} contentStyle={{ borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 12 }} />
                  <Bar dataKey="Ingresos" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gastos" fill={T.tertiary} radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: T.muted }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v), cur)} contentStyle={{ borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 12 }} />
                  <Line type="monotone" dataKey="Ingresos" stroke="#2563EB" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Gastos" stroke={T.tertiary} strokeWidth={2} dot={false} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: T.muted, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: T.tertiary, display: 'inline-block' }} />Gastos</span>
            <span style={{ fontSize: 11, color: T.muted, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: '#2563EB', display: 'inline-block' }} />Ingresos</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: 'uppercase', alignSelf: 'center', marginRight: 4 }}>Ver desglose del mes:</span>
            {months.map(m => (
              <button key={m} onClick={() => setSelectedMonth(m)} style={{
                fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                border: 'none', background: selectedMonth === m ? T.primaryC : T.surface,
                color: selectedMonth === m ? '#fff' : T.muted,
              }}>{monthLabel(m).split(' de ')[0]} de {m.split('-')[0]}</button>
            ))}
          </div>
        </Card>

        <Card>
          <h4 style={{ fontSize: 13, fontWeight: 800, color: T.onSurf, marginBottom: 4 }}>Distribución de Facturas</h4>
          <p style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>Estado general del cobro de cuentas en el sistema</p>
          {invoiceDist.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: T.muted }}>
              <Icon name="description" size={36} />
              <p style={{ fontSize: 12, marginTop: 8 }}>Sin facturas registradas</p>
            </div>
          ) : (
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={invoiceDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {invoiceDist.map((d, idx) => <Cell key={idx} fill={DIST_COLORS[d.name] || T.muted} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Desglose del mes seleccionado */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <span style={{
              fontSize: 10, fontWeight: 700, color: T.primary, background: 'rgba(124,58,237,0.1)',
              borderRadius: 999, padding: '3px 10px', textTransform: 'uppercase',
            }}>Desglose Detallado</span>
            <h4 style={{ fontSize: 16, fontWeight: 800, color: T.onSurf, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="calendar_month" size={18} />Análisis Financiero: {monthLabel(selectedMonth)}
            </h4>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, color: T.onSurf, background: T.surface,
            borderRadius: 999, padding: '5px 12px',
          }}>Balance neto del mes: {formatCurrency(monthIngresos - monthEgresos, cur)}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
          <Card style={{ background: `${T.secondary}0F`, border: `1px solid ${T.secondary}30` }}>
            <p style={{ fontSize: 11, color: T.secondary, fontWeight: 700, marginBottom: 4 }}>INGRESOS DEL MES</p>
            <p style={{ fontSize: 20, fontWeight: 900, color: T.onSurf }}>{formatCurrency(monthIngresos, cur)}</p>
            <p style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>Registros recibidos en caja</p>
          </Card>
          <Card style={{ background: `${T.tertiary}0F`, border: `1px solid ${T.tertiary}30` }}>
            <p style={{ fontSize: 11, color: T.tertiary, fontWeight: 700, marginBottom: 4 }}>EGRESOS DEL MES</p>
            <p style={{ fontSize: 20, fontWeight: 900, color: T.onSurf }}>{formatCurrency(monthEgresos, cur)}</p>
            <p style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>Pagos ejecutados</p>
          </Card>
          <Card style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.25)' }}>
            <p style={{ fontSize: 11, color: '#2563EB', fontWeight: 700, marginBottom: 4 }}>FLUJO NETO MENSUAL</p>
            <p style={{ fontSize: 20, fontWeight: 900, color: T.onSurf }}>{formatCurrency(monthIngresos - monthEgresos, cur)}</p>
            <p style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>Balance de caja directo</p>
          </Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.onSurf, marginBottom: 8 }}>● Cuentas de Cobro ({monthInvoices.length})</p>
            {monthInvoices.length === 0 ? (
              <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', padding: 14, background: T.surface, borderRadius: 10 }}>No hay cuentas de cobro generadas para este mes.</p>
            ) : monthInvoices.map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                <span style={{ color: T.onSurf }}>{i.number} · {i.clientName}</span>
                <span style={{ color: T.muted }}>{formatCurrency(i.total, cur)}</span>
              </div>
            ))}
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.onSurf, marginBottom: 8 }}>● Gastos del mes ({monthExpenses.length})</p>
            {monthExpenses.length === 0 ? (
              <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', padding: 14, background: T.surface, borderRadius: 10 }}>No hay gastos registrados para este mes.</p>
            ) : monthExpenses.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                <span style={{ color: T.onSurf }}>{e.description}</span>
                <span style={{ color: T.muted }}>{formatCurrency(e.amount, cur)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// FACTURAS (Ingresos)
// ────────────────────────────────────────────────────────────────
function FacturasView({ invoices, clients, services, settings, onNew, onEdit, onDelete, onToggleStatus }: {
  invoices: Invoice[]; clients: Client[]; services: ServiceItem[]; settings: AppSettings
  onNew: () => void; onEdit: (i: Invoice) => void; onDelete: (i: Invoice) => void; onToggleStatus: (i: Invoice) => void
}) {
  const sorted = [...invoices].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: T.onSurf }}>Facturas / Ingresos</h3>
        <button style={btnPrimary} onClick={onNew}>+ Nueva factura</button>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {sorted.length === 0 && <p style={{ padding: 18, fontSize: 13, color: T.muted }}>No hay facturas. Crea la primera.</p>}
        {sorted.map(i => (
          <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: T.onSurf }}>{i.number} · {i.clientName}</p>
              <p style={{ fontSize: 11, color: T.muted }}>Vence {i.dueDate} · {formatCurrency(i.total, settings.currency)}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge label={i.status} />
              <button style={iconBtn} onClick={() => downloadInvoicePdf(i, settings)} title="Descargar PDF"><Icon name="picture_as_pdf" size={16} /></button>
              <button style={iconBtn} onClick={() => onToggleStatus(i)} title="Marcar pagada/pendiente"><Icon name="check_circle" size={16} /></button>
              <button style={iconBtn} onClick={() => onEdit(i)}><Icon name="edit" size={16} /></button>
              <button style={iconBtn} onClick={() => onDelete(i)}><Icon name="delete" size={16} /></button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

function InvoiceModal({ invoice, clients, services, settings, onClose, onSave }: {
  invoice: Invoice | null; clients: Client[]; services: ServiceItem[]; settings: AppSettings
  onClose: () => void; onSave: (i: Invoice, isNew: boolean) => void
}) {
  const isNew = !invoice
  const [clientId, setClientId] = useState(invoice?.clientId || '')
  const [pickingClient, setPickingClient] = useState(isNew)
  const [date, setDate] = useState(invoice?.date || todayStr())
  const [dueDate, setDueDate] = useState(invoice?.dueDate || todayStr())
  const [items, setItems] = useState<InvoiceItem[]>(invoice?.items?.length ? invoice.items : [{ id: generateId(), serviceName: '', quantity: 1, unitPrice: 0, total: 0 }])
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status || InvoiceStatus.PENDING)
  const [notes, setNotes] = useState(invoice?.notes || '')
  const [amountPaid, setAmountPaid] = useState(invoice?.amountPaid || 0)
  const [isRecurring, setIsRecurring] = useState(invoice?.isRecurring || false)
  const [taxRate, setTaxRate] = useState(settings.taxRate)
  const previewRef = useRef<HTMLDivElement>(null)

  const subtotal = items.reduce((s, it) => s + it.total, 0)
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount
  const saldoPendiente = total - amountPaid

  const addItem = () => setItems([...items, { id: generateId(), serviceName: '', quantity: 1, unitPrice: 0, total: 0 }])
  const updateItem = (id: string, patch: Partial<InvoiceItem>) => {
    setItems(items.map(it => {
      if (it.id !== id) return it
      const next = { ...it, ...patch }
      next.total = next.quantity * next.unitPrice
      return next
    }))
  }

  const client = clients.find(c => c.id === clientId)
  const number = invoice?.number || `${settings.invoicePrefix}-${String(settings.nextInvoiceNumber).padStart(4, '0')}`

  const buildInvoice = (): Invoice | null => {
    if (!client) return null
    return {
      id: invoice?.id || generateId(), number, clientId: client.id, clientName: client.name, clientNit: client.nit,
      date, dueDate, items, subtotal, tax: taxRate, taxAmount, total, amountPaid, status, notes, isRecurring,
    }
  }

  // Imprimir/Descargar render a clean text-only document (buildInvoiceHtml),
  // never the live editable DOM — otherwise the output shows raw <input>/
  // <select> form controls instead of readable text.
  const handlePrint = () => {
    const inv = buildInvoice()
    if (!inv) { alert('Selecciona un cliente antes de imprimir.'); return }
    const w = window.open('', '_blank', 'width=850,height=1100')
    if (!w) return
    w.document.write(`<html><head><title>${number}</title></head><body>${buildInvoiceHtml(inv, settings)}</body></html>`)
    w.document.close()
    w.onload = () => { w.print() }
  }

  const handleDownload = () => {
    const inv = buildInvoice()
    if (!inv) { alert('Selecciona un cliente antes de descargar el PDF.'); return }
    downloadInvoicePdf(inv, settings)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      {/* toolbar */}
      <div style={{
        background: '#131313', color: '#fff', padding: '12px 20px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Editor de Factura</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
            background: 'rgba(255,255,255,0.12)', textTransform: 'uppercase',
          }}>{status}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ ...btnGhost, borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }} onClick={handlePrint}>
            <Icon name="print" size={14} /> Imprimir
          </button>
          <button style={{ ...btnGhost, borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }} onClick={handleDownload}>
            <Icon name="download" size={14} /> Descargar PDF
          </button>
          <button style={btnPrimary} onClick={() => {
            const inv = buildInvoice()
            if (inv) onSave(inv, isNew)
          }}><Icon name="check_circle" size={14} /> Guardar</button>
          <button style={{ ...btnPrimary, background: T.danger }} onClick={onClose}><Icon name="close" size={14} /> Cerrar</button>
        </div>
      </div>

      {/* live document preview / editor */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 16px', display: 'flex', justifyContent: 'center' }}>
        <div ref={previewRef} style={{
          background: '#fff', color: '#1F2937', width: 760, maxWidth: '100%', padding: 44, borderRadius: 4,
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)', fontFamily: 'Helvetica, Arial, sans-serif',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
            <div>
              {settings.logoUrl && <img src={settings.logoUrl} style={{ maxWidth: 140, maxHeight: 70, objectFit: 'contain', marginBottom: 10 }} />}
              <h2 style={{ fontSize: 24, fontWeight: 900, margin: '4px 0' }}>CUENTA DE COBRO</h2>
              <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>No. {number}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{settings.companyName || 'Relevvo Studio'}</p>
              <p style={{ fontSize: 11, color: '#6B7280', margin: '2px 0' }}>NIT: {settings.companyNit || '-'}</p>
              <p style={{ fontSize: 11, color: '#6B7280', margin: '2px 0' }}>{settings.companyAddress}</p>
              <p style={{ fontSize: 11, color: '#6B7280', margin: '2px 0' }}>{settings.companyPhone}</p>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #1F2937', marginBottom: 20 }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <div style={{ background: '#FFF9EC', borderRadius: 10, padding: '12px 16px', minWidth: 240 }}>
              <p style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', margin: '0 0 4px' }}>Cliente</p>
              {pickingClient ? (
                <select autoFocus style={inputStyle} value={clientId} onChange={e => { setClientId(e.target.value); setPickingClient(false) }}>
                  <option value="">Selecciona…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <>
                  <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{client?.name || '—'}</p>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: '2px 0' }}>NIT: {client?.nit || '-'}</p>
                  <a style={{ fontSize: 11, color: T.primaryC, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setPickingClient(true)}>Cambiar</a>
                </>
              )}
            </div>
            <div style={{ textAlign: 'right', fontSize: 12 }}>
              <p style={{ margin: '4px 0', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                Fecha de Emisión: <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '3px 6px', fontSize: 12 }} />
              </p>
              <p style={{ margin: '4px 0', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                Fecha de Vencimiento: <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '3px 6px', fontSize: 12 }} />
              </p>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
            <thead>
              <tr style={{ background: '#F0E6C8' }}>
                <th style={{ padding: '8px', textAlign: 'left', fontSize: 11 }}>Descripción</th>
                <th style={{ padding: '8px', textAlign: 'center', fontSize: 11, width: 70 }}>Cant.</th>
                <th style={{ padding: '8px', textAlign: 'right', fontSize: 11, width: 110 }}>Precio Unit.</th>
                <th style={{ padding: '8px', textAlign: 'right', fontSize: 11, width: 110 }}>Total</th>
                <th style={{ width: 30 }} />
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                    <select style={{ ...inputStyle, marginBottom: 4 }} value={it.serviceName} onChange={e => {
                      const svc = services.find(s => s.name === e.target.value)
                      updateItem(it.id, { serviceName: e.target.value, unitPrice: svc?.price ?? it.unitPrice })
                    }}>
                      <option value="">Seleccionar del catálogo…</option>
                      {services.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                    {it.serviceName && <p style={{ fontSize: 12, margin: 0 }}>{it.serviceName}</p>}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                    <input type="number" value={it.quantity} onChange={e => updateItem(it.id, { quantity: Number(e.target.value) })}
                      style={{ width: 50, textAlign: 'center', border: '1px solid #E5E7EB', borderRadius: 6, padding: '3px' }} />
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                    <input type="number" value={it.unitPrice} onChange={e => updateItem(it.id, { unitPrice: Number(e.target.value) })}
                      style={{ width: 90, textAlign: 'right', border: '1px solid #E5E7EB', borderRadius: 6, padding: '3px' }} />
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(it.total, settings.currency)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => setItems(items.filter(x => x.id !== it.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.danger }}>
                      <Icon name="delete" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <a style={{ fontSize: 12, color: T.primaryC, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }} onClick={addItem}>
            <Icon name="add" size={14} />Agregar Ítem
          </a>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
            <div style={{ width: 260 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}><span>Subtotal:</span><span>{formatCurrency(subtotal, settings.currency)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                <span>IVA <input type="number" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} style={{ width: 44, border: '1px solid #E5E7EB', borderRadius: 6, padding: '2px 4px', marginLeft: 4 }} />:</span>
                <span>{formatCurrency(taxAmount, settings.currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 900, padding: '8px 0', borderTop: '2px solid #1F2937', marginTop: 4 }}>
                <span>Total:</span><span>{formatCurrency(total, settings.currency)}</span>
              </div>
              <div style={{ background: '#FFF9EC', borderRadius: 10, padding: 12, marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                  <span>Abonado / Pagado:</span>
                  <input type="number" value={amountPaid} onChange={e => setAmountPaid(Number(e.target.value))} style={{ width: 90, textAlign: 'right', border: '1px solid #E5E7EB', borderRadius: 6, padding: '3px 6px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, color: saldoPendiente > 0 ? T.danger : T.secondary }}>
                  <span>Saldo Pendiente:</span><span>{formatCurrency(saldoPendiente, settings.currency)}</span>
                </div>
              </div>
            </div>
          </div>

          <p style={{ fontSize: 10, color: '#78716C', fontStyle: 'italic', marginBottom: 20, textTransform: 'uppercase' }}>
            Son: {numberToSpanishWords(total)}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, margin: '0 0 4px' }}>Datos Bancarios</p>
              <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>{settings.bankDetails || '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, margin: '0 0 4px' }}>Notas</p>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Gracias por su confianza…"
                style={{ width: '100%', fontSize: 11, color: '#374151', border: '1px solid #E5E7EB', borderRadius: 6, padding: 6, minHeight: 40 }} />
            </div>
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: '#FFF9EC',
            borderRadius: 8, padding: '8px 12px', marginBottom: 10, width: 'fit-content',
          }}>
            <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
            Factura Recurrente Mensual
          </label>

          <p style={{ fontSize: 10, color: '#9CA3AF', textAlign: 'center', marginTop: 24 }}>
            Documento generado electrónicamente por Relevvo Studio
          </p>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// GASTOS
// ────────────────────────────────────────────────────────────────
const DIAS_SEMANA = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']
function buildCalendarWeeks(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // Monday-first
  const gridStart = new Date(year, month, 1 - startOffset)
  const weeks: Date[][] = []
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) week.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + w * 7 + d))
    weeks.push(week)
  }
  return weeks
}
const dstr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function GastosView({ expenses, onNew, onQuickNew, onEdit, onDelete, onToggleStatus, onMoveDate }: {
  expenses: Expense[]; onNew: () => void; onQuickNew: (date: string) => void; onEdit: (e: Expense) => void
  onDelete: (e: Expense) => void; onToggleStatus: (e: Expense) => void; onMoveDate: (e: Expense, date: string) => void
}) {
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const [cursor, setCursor] = useState(new Date())
  const [category, setCategory] = useState<string>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = expenses.filter(e =>
    (!category || e.category === category) &&
    (!from || e.date >= from) &&
    (!to || e.date <= to)
  )
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date))
  const byDay = useMemo(() => {
    const map: Record<string, Expense[]> = {}
    filtered.forEach(e => { (map[e.date] ||= []).push(e) })
    return map
  }, [filtered])

  const weeks = buildCalendarWeeks(cursor.getFullYear(), cursor.getMonth())
  const monthName = cursor.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: T.onSurf }}>Registro de Gastos</h3>
        <button style={{ ...btnPrimary, background: T.tertiary }} onClick={onNew}>+ Registrar Gasto</button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <Field label="Categoría">
            <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Todas las categorías</option>
              {Object.values(ExpenseCategory).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Desde"><input type="date" style={inputStyle} value={from} onChange={e => setFrom(e.target.value)} /></Field>
          <Field label="Hasta"><input type="date" style={inputStyle} value={to} onChange={e => setTo(e.target.value)} /></Field>
          <button style={{ ...btnGhost, height: 38 }} onClick={() => { setCategory(''); setFrom(''); setTo('') }}>Limpiar Filtros</button>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
          <button style={iconBtn} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><Icon name="chevron_left" size={18} /></button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: T.onSurf, textTransform: 'capitalize' }}>{monthName}</p>
            <p style={{ fontSize: 10, color: T.muted }}>Calendario de Flujo de Caja (Ingresos y Egresos)</p>
          </div>
          <button style={iconBtn} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><Icon name="chevron_right" size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: `1px solid ${T.border}` }}>
          {DIAS_SEMANA.map(d => (
            <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: T.muted }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {weeks.flat().map((d, idx) => {
            const key = dstr(d)
            const inMonth = d.getMonth() === cursor.getMonth()
            const isToday = key === todayStr()
            const dayExpenses = byDay[key] || []
            const isDragOver = dragOverDay === key
            return (
              <div
                key={idx}
                onClick={() => { if (dayExpenses.length === 0) onQuickNew(key) }}
                onDragOver={e => { e.preventDefault(); setDragOverDay(key) }}
                onDragLeave={() => setDragOverDay(d => (d === key ? null : d))}
                onDrop={e => {
                  e.preventDefault()
                  const expId = e.dataTransfer.getData('text/expense-id')
                  const exp = expenses.find(x => x.id === expId)
                  if (exp && exp.date !== key) onMoveDate(exp, key)
                  setDragOverDay(null)
                }}
                style={{
                  minHeight: 88, padding: 8, borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
                  background: isDragOver ? 'rgba(124,58,237,0.12)' : isToday ? 'rgba(124,58,237,0.05)' : 'transparent',
                  opacity: inMonth ? 1 : 0.35, cursor: dayExpenses.length === 0 ? 'pointer' : 'default',
                  outline: isDragOver ? `2px dashed ${T.primaryC}` : 'none', outlineOffset: -2,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: isToday ? '#fff' : T.onSurf,
                    background: isToday ? T.primaryC : 'transparent', borderRadius: 999,
                    padding: isToday ? '2px 7px' : 0, display: 'inline-block',
                  }}>{d.getDate()}</span>
                  <button
                    onClick={e => { e.stopPropagation(); onQuickNew(key) }}
                    title="Registrar gasto este día"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, padding: 0, lineHeight: 0 }}
                  ><Icon name="add_circle" size={14} /></button>
                </div>
                <div style={{ display: 'grid', gap: 3, marginTop: 5 }}>
                  {dayExpenses.map(exp => (
                    <div
                      key={exp.id}
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/expense-id', exp.id)}
                      onClick={e => { e.stopPropagation(); onEdit(exp) }}
                      title={`${exp.description} · ${formatCurrency(exp.amount, 'COP')} — clic para editar, arrastra para cambiar de fecha`}
                      style={{
                        fontSize: 10, fontWeight: 700, color: T.tertiary, background: `${T.tertiary}12`,
                        borderRadius: 6, padding: '2px 5px', cursor: 'grab', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >-{formatCurrency(exp.amount, 'COP')}</div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {sorted.length === 0 && <p style={{ padding: 18, fontSize: 13, color: T.muted }}>No hay gastos registrados con estos filtros.</p>}
        {sorted.map(e => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: T.onSurf }}>{e.description}</p>
              <p style={{ fontSize: 11, color: T.muted }}>{e.category} · {e.date} · {formatCurrency(e.amount, 'COP')}{e.isRecurring ? ' · Recurrente' : ''}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge label={e.status} />
              <button style={iconBtn} onClick={() => onToggleStatus(e)}><Icon name="check_circle" size={16} /></button>
              <button style={iconBtn} onClick={() => onEdit(e)}><Icon name="edit" size={16} /></button>
              <button style={iconBtn} onClick={() => onDelete(e)}><Icon name="delete" size={16} /></button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

function ExpenseModal({ expense, defaultDate, onClose, onSave }: { expense: Expense | null; defaultDate?: string | null; onClose: () => void; onSave: (e: Expense) => void }) {
  const [description, setDescription] = useState(expense?.description || '')
  const [amount, setAmount] = useState(expense?.amount || 0)
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category || ExpenseCategory.OTHER)
  const [date, setDate] = useState(expense?.date || defaultDate || todayStr())
  const [isRecurring, setIsRecurring] = useState(expense?.isRecurring || false)
  const [status, setStatus] = useState<ExpenseStatus>(expense?.status || ExpenseStatus.PENDING)

  return (
    <Modal title={expense ? 'Editar gasto' : 'Nuevo gasto'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Descripción"><input style={inputStyle} value={description} onChange={e => setDescription(e.target.value)} /></Field>
        <Field label="Monto"><input type="number" style={inputStyle} value={amount} onChange={e => setAmount(Number(e.target.value))} /></Field>
        <Field label="Categoría">
          <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)}>
            {Object.values(ExpenseCategory).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Fecha"><input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Estado">
          <select style={inputStyle} value={status} onChange={e => setStatus(e.target.value as ExpenseStatus)}>
            {Object.values(ExpenseStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T.onSurf }}>
          <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} /> Gasto recurrente mensual
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button style={btnGhost} onClick={onClose}>Cancelar</button>
          <button style={btnPrimary} onClick={() => {
            if (!description.trim()) return
            onSave({ id: expense?.id || generateId(), description, amount, category, date, isRecurring, status, amountPaid: status === ExpenseStatus.PAID ? amount : expense?.amountPaid })
          }}>Guardar</button>
        </div>
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────────
// NÓMINA
// ────────────────────────────────────────────────────────────────
function NominaView({ employees, payroll, period, setPeriod, onNewEmployee, onEditEmployee, onDeleteEmployee, onGenerate, onTogglePaid, onEditEntry, onDeleteEntry }: {
  employees: Employee[]; payroll: PayrollEntry[]; period: string; setPeriod: (p: string) => void
  onNewEmployee: () => void; onEditEmployee: (e: Employee) => void; onDeleteEmployee: (e: Employee) => void
  onGenerate: () => void; onTogglePaid: (p: PayrollEntry) => void
  onEditEntry: (p: PayrollEntry, patch: Partial<PayrollEntry>) => void; onDeleteEntry: (p: PayrollEntry) => void
}) {
  const periodEntries = payroll.filter(p => p.period === period).sort((a, b) => a.employeeName.localeCompare(b.employeeName))
  const periodTotal = periodEntries.reduce((s, p) => s + p.total, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: T.onSurf }}>Nómina</h3>
        <button style={btnPrimary} onClick={onNewEmployee}>+ Nuevo empleado</button>
      </div>

      <Card style={{ marginBottom: 18 }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, color: T.onSurf, marginBottom: 10 }}>Equipo</h4>
        {employees.length === 0 && <p style={{ fontSize: 12, color: T.muted }}>Agrega tu primer empleado para empezar.</p>}
        {employees.map(e => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, color: T.onSurf, fontWeight: 600 }}>{e.name} {!e.active && <span style={{ color: T.muted, fontSize: 11 }}>(inactivo)</span>}</p>
              <p style={{ fontSize: 11, color: T.muted }}>{e.role} · {formatCurrency(e.baseSalary, 'COP')}/mes</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={iconBtn} onClick={() => onEditEmployee(e)}><Icon name="edit" size={16} /></button>
              <button style={iconBtn} onClick={() => onDeleteEmployee(e)}><Icon name="delete" size={16} /></button>
            </div>
          </div>
        ))}
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="month" style={{ ...inputStyle, width: 160 }} value={period} onChange={e => setPeriod(e.target.value)} />
            <button style={btnGhost} onClick={onGenerate}>Generar nómina del mes</button>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: T.onSurf }}>Total periodo: {formatCurrency(periodTotal, 'COP')}</span>
        </div>
        {periodEntries.length === 0 && <p style={{ padding: 18, fontSize: 13, color: T.muted }}>Sin registros para este periodo. Genera la nómina arriba.</p>}
        {periodEntries.map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: T.onSurf }}>{p.employeeName}</p>
              <p style={{ fontSize: 11, color: T.muted }}>
                Base {formatCurrency(p.baseSalary, 'COP')}
                {p.bonuses ? ` · Bonos ${formatCurrency(p.bonuses, 'COP')}` : ''}
                {p.deductions ? ` · Deducciones ${formatCurrency(p.deductions, 'COP')}` : ''}
                {' · '}Total {formatCurrency(p.total, 'COP')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge label={p.status} />
              <button style={iconBtn} onClick={() => onTogglePaid(p)} title="Marcar pagado/pendiente"><Icon name="check_circle" size={16} /></button>
              <button style={iconBtn} onClick={() => {
                const bonuses = Number(prompt('Bonos', String(p.bonuses)) ?? p.bonuses)
                const deductions = Number(prompt('Deducciones', String(p.deductions)) ?? p.deductions)
                onEditEntry(p, { bonuses, deductions })
              }}><Icon name="edit" size={16} /></button>
              <button style={iconBtn} onClick={() => onDeleteEntry(p)}><Icon name="delete" size={16} /></button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

function EmployeeModal({ employee, onClose, onSave }: { employee: Employee | null; onClose: () => void; onSave: (e: Employee) => void }) {
  const [name, setName] = useState(employee?.name || '')
  const [role, setRole] = useState(employee?.role || '')
  const [baseSalary, setBaseSalary] = useState(employee?.baseSalary || 0)
  const [bankAccount, setBankAccount] = useState(employee?.bankAccount || '')
  const [bankName, setBankName] = useState(employee?.bankName || '')
  const [active, setActive] = useState(employee?.active ?? true)

  return (
    <Modal title={employee ? 'Editar empleado' : 'Nuevo empleado'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Nombre"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Cargo"><input style={inputStyle} value={role} onChange={e => setRole(e.target.value)} /></Field>
        <Field label="Salario base mensual"><input type="number" style={inputStyle} value={baseSalary} onChange={e => setBaseSalary(Number(e.target.value))} /></Field>
        <Field label="Banco"><input style={inputStyle} value={bankName} onChange={e => setBankName(e.target.value)} /></Field>
        <Field label="Cuenta"><input style={inputStyle} value={bankAccount} onChange={e => setBankAccount(e.target.value)} /></Field>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T.onSurf }}>
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Activo
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button style={btnGhost} onClick={onClose}>Cancelar</button>
          <button style={btnPrimary} onClick={() => {
            if (!name.trim()) return
            onSave({ id: employee?.id || generateId(), name, role, baseSalary, bankAccount, bankName, active })
          }}>Guardar</button>
        </div>
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────────
// CLIENTES
// ────────────────────────────────────────────────────────────────
function ClientesView({ clients, onNew, onEdit, onDelete }: {
  clients: Client[]; onNew: () => void; onEdit: (c: Client) => void; onDelete: (c: Client) => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: T.onSurf }}>Clientes</h3>
        <button style={btnPrimary} onClick={onNew}>+ Nuevo cliente</button>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {clients.length === 0 && <p style={{ padding: 18, fontSize: 13, color: T.muted }}>No hay clientes registrados.</p>}
        {clients.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: T.onSurf }}>{c.name}</p>
              <p style={{ fontSize: 11, color: T.muted }}>{c.email} · {c.phone}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={iconBtn} onClick={() => onEdit(c)}><Icon name="edit" size={16} /></button>
              <button style={iconBtn} onClick={() => onDelete(c)}><Icon name="delete" size={16} /></button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

function ClientModal({ client, onClose, onSave }: { client: Client | null; onClose: () => void; onSave: (c: Client) => void }) {
  const [name, setName] = useState(client?.name || '')
  const [nit, setNit] = useState(client?.nit || '')
  const [email, setEmail] = useState(client?.email || '')
  const [phone, setPhone] = useState(client?.phone || '')
  const [address, setAddress] = useState(client?.address || '')
  const [city, setCity] = useState(client?.city || '')

  return (
    <Modal title={client ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Nombre / Razón social"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="NIT"><input style={inputStyle} value={nit} onChange={e => setNit(e.target.value)} /></Field>
        <Field label="Email"><input style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Teléfono"><input style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} /></Field>
        <Field label="Dirección"><input style={inputStyle} value={address} onChange={e => setAddress(e.target.value)} /></Field>
        <Field label="Ciudad"><input style={inputStyle} value={city} onChange={e => setCity(e.target.value)} /></Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button style={btnGhost} onClick={onClose}>Cancelar</button>
          <button style={btnPrimary} onClick={() => {
            if (!name.trim()) return
            onSave({ id: client?.id || generateId(), name, nit, email, phone, address, city })
          }}>Guardar</button>
        </div>
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────────
// SERVICIOS
// ────────────────────────────────────────────────────────────────
function ServiciosView({ services, onNew, onEdit, onDelete }: {
  services: ServiceItem[]; onNew: () => void; onEdit: (s: ServiceItem) => void; onDelete: (s: ServiceItem) => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: T.onSurf }}>Servicios</h3>
        <button style={btnPrimary} onClick={onNew}>+ Nuevo servicio</button>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {services.length === 0 && <p style={{ padding: 18, fontSize: 13, color: T.muted }}>No hay servicios registrados.</p>}
        {services.map(s => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: T.onSurf }}>{s.name}</p>
              <p style={{ fontSize: 11, color: T.muted }}>{s.description}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: T.onSurf }}>{formatCurrency(s.price, 'COP')}</span>
              <button style={iconBtn} onClick={() => onEdit(s)}><Icon name="edit" size={16} /></button>
              <button style={iconBtn} onClick={() => onDelete(s)}><Icon name="delete" size={16} /></button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

function ServiceModal({ service, onClose, onSave }: { service: ServiceItem | null; onClose: () => void; onSave: (s: ServiceItem) => void }) {
  const [name, setName] = useState(service?.name || '')
  const [description, setDescription] = useState(service?.description || '')
  const [price, setPrice] = useState(service?.price || 0)

  return (
    <Modal title={service ? 'Editar servicio' : 'Nuevo servicio'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Nombre"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Descripción"><textarea style={{ ...inputStyle, minHeight: 60 }} value={description} onChange={e => setDescription(e.target.value)} /></Field>
        <Field label="Precio"><input type="number" style={inputStyle} value={price} onChange={e => setPrice(Number(e.target.value))} /></Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button style={btnGhost} onClick={onClose}>Cancelar</button>
          <button style={btnPrimary} onClick={() => {
            if (!name.trim()) return
            onSave({ id: service?.id || generateId(), name, description, price })
          }}>Guardar</button>
        </div>
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ────────────────────────────────────────────────────────────────
function ConfigView({ settings, onSave, getExportData, onImport }: {
  settings: AppSettings; onSave: (s: AppSettings) => void
  getExportData: () => Record<string, unknown>; onImport: (data: any) => Promise<void>
}) {
  const [form, setForm] = useState<AppSettings>(settings)
  useEffect(() => setForm(settings), [settings])
  const set = (k: keyof AppSettings, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(getExportData(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `finanzas-relevvo-${todayStr()}.json`; a.click()
    URL.revokeObjectURL(url)
  }
  const handleImportFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (!confirm('Esto va a sobrescribir los registros existentes con los del archivo. ¿Continuar?')) return
        await onImport(data)
        alert('Datos importados correctamente.')
      } catch (e) {
        alert('El archivo no es un JSON válido de respaldo de Finanzas.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div style={{ maxWidth: 640, display: 'grid', gap: 16 }}>
      <Card>
        <h4 style={{ fontSize: 14, fontWeight: 800, color: T.onSurf, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="settings" size={18} />Configuración de Empresa
        </h4>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 12, background: T.surface, border: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
          }}>
            {form.logoUrl
              ? <img src={form.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: 10, color: T.muted, textAlign: 'center' }}>Sin Logo</span>}
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.onSurf, marginBottom: 2 }}>Logo / Foto de Perfil</p>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>Esta imagen aparecerá en tus facturas y documentos.</p>
            <label style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <Icon name="upload" size={14} />Subir Imagen
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files?.[0]; if (!file) return
                const reader = new FileReader()
                reader.onload = () => set('logoUrl', String(reader.result))
                reader.readAsDataURL(file)
              }} />
            </label>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Nombre de la empresa"><input style={inputStyle} value={form.companyName} onChange={e => set('companyName', e.target.value)} /></Field>
          <Field label="NIT"><input style={inputStyle} value={form.companyNit} onChange={e => set('companyNit', e.target.value)} /></Field>
          <Field label="Dirección"><input style={inputStyle} value={form.companyAddress} onChange={e => set('companyAddress', e.target.value)} /></Field>
          <Field label="Email"><input style={inputStyle} value={form.companyEmail} onChange={e => set('companyEmail', e.target.value)} /></Field>
          <Field label="Teléfono"><input style={inputStyle} value={form.companyPhone} onChange={e => set('companyPhone', e.target.value)} /></Field>
          <Field label="Moneda"><input style={inputStyle} value={form.currency} onChange={e => set('currency', e.target.value)} /></Field>
          <Field label="Impuesto (%)"><input type="number" style={inputStyle} value={form.taxRate} onChange={e => set('taxRate', Number(e.target.value))} /></Field>
          <Field label="Datos bancarios"><input style={inputStyle} value={form.bankDetails} onChange={e => set('bankDetails', e.target.value)} /></Field>
          <Field label="Prefijo factura"><input style={inputStyle} value={form.invoicePrefix} onChange={e => set('invoicePrefix', e.target.value)} /></Field>
          <Field label="Próximo consecutivo"><input type="number" style={inputStyle} value={form.nextInvoiceNumber} onChange={e => set('nextInvoiceNumber', Number(e.target.value))} /></Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button style={btnPrimary} onClick={() => onSave(form)}>Guardar Configuración</button>
        </div>
      </Card>

      <Card>
        <h4 style={{ fontSize: 14, fontWeight: 800, color: T.onSurf, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="cached" size={18} />Copia de Seguridad y Restauración
        </h4>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>
          Descarga una copia completa de tus datos (clientes, facturas, gastos, nómina) para guardarla en tu Google Drive,
          OneDrive o disco duro. Si algo sale mal, podrás restaurar todo usando este archivo.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: T.surface, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.onSurf, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="download" size={16} />Exportar Datos
            </p>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>Descargar archivo .JSON con toda tu información.</p>
            <button style={{ ...btnPrimary, width: '100%' }} onClick={handleExport}>Descargar Copia de Seguridad</button>
          </div>
          <div style={{ background: T.surface, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.onSurf, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="upload_file" size={16} />Importar Copia
            </p>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>Restaurar información desde un archivo guardado.</p>
            <label style={{ ...btnGhost, width: '100%', display: 'block', textAlign: 'center', cursor: 'pointer', boxSizing: 'border-box' }}>
              Seleccionar Archivo .JSON
              <input type="file" accept="application/json" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files?.[0]; if (file) handleImportFile(file)
              }} />
            </label>
          </div>
        </div>
      </Card>
    </div>
  )
}
