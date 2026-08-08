'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { User } from 'firebase/auth'
import { useSession } from 'next-auth/react'
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { db, initAuth } from './firebase'
import { formatCurrency, generateId } from './utils'

// Fixed shared workspace path — this panel is internal-only (already gated
// by the /admin NextAuth login), so the whole team reads/writes the same
// Firestore data instead of a per-Google-account uid namespace.
const ORG_ID = 'relevvo'
import {
  Client, ServiceItem, Invoice, InvoiceItem, InvoiceStatus,
  Expense, ExpenseCategory, ExpenseStatus,
  Employee, PayrollEntry, PayrollStatus, AppSettings,
} from './types'

// ── Design tokens (mirrors app/admin/page.tsx T object) ──────────
const T = {
  bg: '#131313', sidebar: '#1C1B1B', card: 'rgba(255,255,255,0.04)', cardHigh: '#2A2A2A',
  primary: '#D2BBFF', primaryC: '#7C3AED', secondary: '#41E575', tertiary: '#FFB0CD',
  surface: '#201F1F', onSurf: '#E5E2E1', muted: '#8B96A2',
  border: 'rgba(255,255,255,0.07)', borderMd: 'rgba(255,255,255,0.11)',
  danger: '#F87171', warn: '#FBBF24',
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
  background: T.primaryC, color: '#fff', border: 'none', borderRadius: 10,
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
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18, ...style,
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
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{title}</h3>
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
    <div>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SUB_NAV.map(n => {
            const active = sub === n.id
            return (
              <button key={n.id} onClick={() => setSub(n.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
                border: `1px solid ${active ? T.primaryC : T.border}`,
                background: active ? 'rgba(124,58,237,0.15)' : 'transparent',
                color: active ? T.primary : T.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                <Icon name={n.icon} size={16} />{n.label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: T.muted }}>
          <Icon name="account_circle" size={16} /><span>{displayName}</span>
        </div>
      </div>

      {sub === 'resumen' && <ResumenView totals={totals} invoices={invoices} expenses={expenses} settings={settings} />}
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
          onNew={() => setEditingExpense('new')} onEdit={(e) => setEditingExpense(e)}
          onDelete={async (e) => { await remove('expenses', e.id); logActivity(`Eliminó gasto ${e.description}`) }}
          onToggleStatus={async (e) => {
            const nextStatus = e.status === ExpenseStatus.PAID ? ExpenseStatus.PENDING : ExpenseStatus.PAID
            await save('expenses', { ...e, status: nextStatus, amountPaid: nextStatus === ExpenseStatus.PAID ? e.amount : e.amountPaid })
            logActivity(`Actualizó estado de gasto ${e.description} a ${nextStatus}`)
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
        <ConfigView settings={settings} onSave={async (s) => {
          if (!user) return
          await setDoc(doc(db, 'finanzas', ORG_ID, 'settings', 'main'), s)
          logActivity('Actualizó configuración')
        }} />
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
// RESUMEN
// ────────────────────────────────────────────────────────────────
function ResumenView({ totals, invoices, expenses, settings }: {
  totals: any; invoices: Invoice[]; expenses: Expense[]; settings: AppSettings
}) {
  const cur = settings.currency || 'COP'
  const stats = [
    { label: 'Cobrado', value: totals.cobrado, color: T.secondary, icon: 'trending_up' },
    { label: 'Por cobrar', value: totals.porCobrar, color: T.warn, icon: 'schedule' },
    { label: 'Gastos pagados', value: totals.gastosPagados, color: T.danger, icon: 'trending_down' },
    { label: 'Nómina pendiente', value: totals.nominaPendiente, color: T.primary, icon: 'badge' },
  ]
  const recent = [...invoices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  const recentExp = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 20 }}>
        <Card style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(124,58,237,0.05))' }}>
          <p style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>Balance (cobrado − gastos pagados)</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: totals.balance >= 0 ? T.secondary : T.danger }}>
            {formatCurrency(totals.balance, cur)}
          </p>
        </Card>
        {stats.map(s => (
          <Card key={s.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: s.color }}>
              <Icon name={s.icon} size={18} /><span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{s.label}</span>
            </div>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{formatCurrency(s.value, cur)}</p>
          </Card>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Últimas facturas</h4>
          {recent.length === 0 && <p style={{ fontSize: 12, color: T.muted }}>Sin facturas registradas.</p>}
          {recent.map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ color: T.onSurf }}>{i.number} · {i.clientName}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: T.muted }}>{formatCurrency(i.total, cur)}</span>
                <Badge label={i.status} />
              </div>
            </div>
          ))}
        </Card>
        <Card>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Últimos gastos</h4>
          {recentExp.length === 0 && <p style={{ fontSize: 12, color: T.muted }}>Sin gastos registrados.</p>}
          {recentExp.map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ color: T.onSurf }}>{e.description} · {e.category}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: T.muted }}>{formatCurrency(e.amount, cur)}</span>
                <Badge label={e.status} />
              </div>
            </div>
          ))}
        </Card>
      </div>
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
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Facturas / Ingresos</h3>
        <button style={btnPrimary} onClick={onNew}>+ Nueva factura</button>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {sorted.length === 0 && <p style={{ padding: 18, fontSize: 13, color: T.muted }}>No hay facturas. Crea la primera.</p>}
        {sorted.map(i => (
          <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{i.number} · {i.clientName}</p>
              <p style={{ fontSize: 11, color: T.muted }}>Vence {i.dueDate} · {formatCurrency(i.total, settings.currency)}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge label={i.status} />
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
  const [date, setDate] = useState(invoice?.date || todayStr())
  const [dueDate, setDueDate] = useState(invoice?.dueDate || todayStr())
  const [items, setItems] = useState<InvoiceItem[]>(invoice?.items || [])
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status || InvoiceStatus.PENDING)
  const [notes, setNotes] = useState(invoice?.notes || '')

  const subtotal = items.reduce((s, it) => s + it.total, 0)
  const taxAmount = subtotal * (settings.taxRate / 100)
  const total = subtotal + taxAmount

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

  return (
    <Modal title={isNew ? 'Nueva factura' : `Editar ${invoice!.number}`} onClose={onClose} wide>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Cliente">
            <select style={inputStyle} value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">Selecciona…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Estado">
            <select style={inputStyle} value={status} onChange={e => setStatus(e.target.value as InvoiceStatus)}>
              {Object.values(InvoiceStatus).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Fecha"><input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Vence"><input type="date" style={inputStyle} value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={labelStyle}>Ítems</span>
            <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11 }} onClick={addItem}>+ Agregar</button>
          </div>
          {items.map(it => (
            <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 100px 100px 30px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <select style={inputStyle} value={it.serviceName} onChange={e => {
                const svc = services.find(s => s.name === e.target.value)
                updateItem(it.id, { serviceName: e.target.value, unitPrice: svc?.price ?? it.unitPrice })
              }}>
                <option value="">Servicio…</option>
                {services.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <input type="number" style={inputStyle} value={it.quantity} onChange={e => updateItem(it.id, { quantity: Number(e.target.value) })} />
              <input type="number" style={inputStyle} value={it.unitPrice} onChange={e => updateItem(it.id, { unitPrice: Number(e.target.value) })} />
              <span style={{ fontSize: 12, color: T.onSurf }}>{formatCurrency(it.total, settings.currency)}</span>
              <button style={{ ...iconBtn, width: 26, height: 26 }} onClick={() => setItems(items.filter(x => x.id !== it.id))}><Icon name="close" size={14} /></button>
            </div>
          ))}
        </div>

        <Field label="Notas"><textarea style={{ ...inputStyle, minHeight: 60 }} value={notes} onChange={e => setNotes(e.target.value)} /></Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, fontSize: 13, color: T.muted, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
          <span>Subtotal: {formatCurrency(subtotal, settings.currency)}</span>
          <span>Impuesto ({settings.taxRate}%): {formatCurrency(taxAmount, settings.currency)}</span>
          <span style={{ color: '#fff', fontWeight: 800 }}>Total: {formatCurrency(total, settings.currency)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button style={btnGhost} onClick={onClose}>Cancelar</button>
          <button style={btnPrimary} onClick={() => {
            if (!client) return
            const number = invoice?.number || `${settings.invoicePrefix}-${String(settings.nextInvoiceNumber).padStart(4, '0')}`
            onSave({
              id: invoice?.id || generateId(), number, clientId: client.id, clientName: client.name, clientNit: client.nit,
              date, dueDate, items, subtotal, tax: settings.taxRate, taxAmount, total,
              amountPaid: invoice?.amountPaid || (status === InvoiceStatus.PAID ? total : 0), status, notes,
            }, isNew)
          }}>Guardar</button>
        </div>
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────────
// GASTOS
// ────────────────────────────────────────────────────────────────
function GastosView({ expenses, onNew, onEdit, onDelete, onToggleStatus }: {
  expenses: Expense[]; onNew: () => void; onEdit: (e: Expense) => void; onDelete: (e: Expense) => void; onToggleStatus: (e: Expense) => void
}) {
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Gastos</h3>
        <button style={btnPrimary} onClick={onNew}>+ Nuevo gasto</button>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {sorted.length === 0 && <p style={{ padding: 18, fontSize: 13, color: T.muted }}>No hay gastos registrados.</p>}
        {sorted.map(e => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{e.description}</p>
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

function ExpenseModal({ expense, onClose, onSave }: { expense: Expense | null; onClose: () => void; onSave: (e: Expense) => void }) {
  const [description, setDescription] = useState(expense?.description || '')
  const [amount, setAmount] = useState(expense?.amount || 0)
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category || ExpenseCategory.OTHER)
  const [date, setDate] = useState(expense?.date || todayStr())
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
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Nómina</h3>
        <button style={btnPrimary} onClick={onNewEmployee}>+ Nuevo empleado</button>
      </div>

      <Card style={{ marginBottom: 18 }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Equipo</h4>
        {employees.length === 0 && <p style={{ fontSize: 12, color: T.muted }}>Agrega tu primer empleado para empezar.</p>}
        {employees.map(e => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{e.name} {!e.active && <span style={{ color: T.muted, fontSize: 11 }}>(inactivo)</span>}</p>
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
          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Total periodo: {formatCurrency(periodTotal, 'COP')}</span>
        </div>
        {periodEntries.length === 0 && <p style={{ padding: 18, fontSize: 13, color: T.muted }}>Sin registros para este periodo. Genera la nómina arriba.</p>}
        {periodEntries.map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{p.employeeName}</p>
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
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Clientes</h3>
        <button style={btnPrimary} onClick={onNew}>+ Nuevo cliente</button>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {clients.length === 0 && <p style={{ padding: 18, fontSize: 13, color: T.muted }}>No hay clientes registrados.</p>}
        {clients.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.name}</p>
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
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Servicios</h3>
        <button style={btnPrimary} onClick={onNew}>+ Nuevo servicio</button>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {services.length === 0 && <p style={{ padding: 18, fontSize: 13, color: T.muted }}>No hay servicios registrados.</p>}
        {services.map(s => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{s.name}</p>
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
function ConfigView({ settings, onSave }: { settings: AppSettings; onSave: (s: AppSettings) => void }) {
  const [form, setForm] = useState<AppSettings>(settings)
  useEffect(() => setForm(settings), [settings])
  const set = (k: keyof AppSettings, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ maxWidth: 560 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 14 }}>Configuración</h3>
      <Card>
        <div style={{ display: 'grid', gap: 14 }}>
          <Field label="Nombre de la empresa"><input style={inputStyle} value={form.companyName} onChange={e => set('companyName', e.target.value)} /></Field>
          <Field label="NIT"><input style={inputStyle} value={form.companyNit} onChange={e => set('companyNit', e.target.value)} /></Field>
          <Field label="Dirección"><input style={inputStyle} value={form.companyAddress} onChange={e => set('companyAddress', e.target.value)} /></Field>
          <Field label="Email"><input style={inputStyle} value={form.companyEmail} onChange={e => set('companyEmail', e.target.value)} /></Field>
          <Field label="Teléfono"><input style={inputStyle} value={form.companyPhone} onChange={e => set('companyPhone', e.target.value)} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Moneda"><input style={inputStyle} value={form.currency} onChange={e => set('currency', e.target.value)} /></Field>
            <Field label="Impuesto (%)"><input type="number" style={inputStyle} value={form.taxRate} onChange={e => set('taxRate', Number(e.target.value))} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Prefijo factura"><input style={inputStyle} value={form.invoicePrefix} onChange={e => set('invoicePrefix', e.target.value)} /></Field>
            <Field label="Próximo consecutivo"><input type="number" style={inputStyle} value={form.nextInvoiceNumber} onChange={e => set('nextInvoiceNumber', Number(e.target.value))} /></Field>
          </div>
          <Field label="Datos bancarios"><textarea style={{ ...inputStyle, minHeight: 60 }} value={form.bankDetails} onChange={e => set('bankDetails', e.target.value)} /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={btnPrimary} onClick={() => onSave(form)}>Guardar cambios</button>
          </div>
        </div>
      </Card>
    </div>
  )
}
