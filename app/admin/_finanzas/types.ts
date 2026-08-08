export enum AppView {
  DASHBOARD = 'DASHBOARD',
  CLIENTS = 'CLIENTS',
  SERVICES = 'SERVICES',
  INVOICES = 'INVOICES',
  EXPENSES = 'EXPENSES',
  PAYROLL = 'PAYROLL',
  WORKSPACE = 'WORKSPACE',
  SETTINGS = 'SETTINGS',
}

export interface Client {
  id: string;
  name: string;
  nit: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  title?: string;
  value?: number;
  stage?: string;
  paymentTerms?: 'Mes Vencido' | 'Principio de Mes' | 'Contado' | 'Anticipado';
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  price: number;
}

export interface InvoiceItem {
  id: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export enum InvoiceStatus {
  DRAFT = 'Borrador',
  PENDING = 'Pendiente',
  PARTIALLY_PAID = 'Pago Parcial',
  PAID = 'Pagada',
  CANCELLED = 'Anulada'
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  clientNit: string;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
  notes: string;
  isRecurring?: boolean;
}

export enum ExpenseCategory {
  OFFICE = 'Oficina',
  SOFTWARE = 'Software',
  SERVICES = 'Servicios Públicos',
  SALARY = 'Nómina',
  TAXES = 'Impuestos',
  MARKETING = 'Marketing',
  OTHER = 'Otros'
}

export enum ExpenseStatus {
  PENDING = 'Pendiente',
  PAID = 'Pagado',
  PARTIALLY_PAID = 'Pago Parcial'
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  isRecurring: boolean;
  status: ExpenseStatus;
  amountPaid?: number;
}

export interface AppSettings {
  companyName: string;
  companyNit: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  currency: string;
  taxRate: number;
  logoUrl: string;
  bankDetails: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  followUpQuestions?: string[];
}

// ── Nómina ──────────────────────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  role: string;
  baseSalary: number;
  bankAccount?: string;
  bankName?: string;
  active: boolean;
}

export enum PayrollStatus {
  PENDING = 'Pendiente',
  PAID = 'Pagado'
}

export interface PayrollEntry {
  id: string;
  employeeId: string;
  employeeName: string; // Denormalized
  period: string; // 'YYYY-MM'
  baseSalary: number;
  bonuses: number;
  deductions: number;
  total: number;
  status: PayrollStatus;
  paidDate?: string;
  notes?: string;
}
