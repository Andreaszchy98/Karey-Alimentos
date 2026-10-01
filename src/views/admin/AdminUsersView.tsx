import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, 
  RotateCcw, 
  Settings, 
  X, 
  Search, 
  Users, 
  UserCheck, 
  Briefcase, 
  ShoppingBag, 
  Building2, 
  Truck, 
  Package, 
  Scale, 
  ShieldCheck, 
  Store, 
  Boxes, 
  Phone, 
  Mail, 
  Filter,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  DollarSign,
  TrendingDown,
  Receipt,
  Wallet,
  ArrowUpRight,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button, Input } from '../../components/ui';
import { cn } from '../../components/ui';
import { UserProfile, UserRole, ToastType, Order } from '../../types';
import { calculateClientCreditBalance } from '../../lib/orders';

export const ROLE_CONFIG: Record<UserRole, {
  label: string;
  category: 'employee' | 'client';
  color: string;
  bgColor: string;
  borderColor: string;
  icon: any;
  description: string;
  area: string;
}> = {
  admin: {
    label: 'Administrador General',
    category: 'employee',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    icon: ShieldCheck,
    description: 'Control total de la plataforma, finanzas, usuarios y configuración.',
    area: 'Dirección'
  },
  dispatcher: {
    label: 'Despachador de Rutas',
    category: 'employee',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: Truck,
    description: 'Asignación de pedidos a choferes y organización de rutas de entrega.',
    area: 'Logística'
  },
  preparer: {
    label: 'Preparador / Pesador',
    category: 'employee',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: Scale,
    description: 'Pesaje de quesos y embutidos, tarado de jabas y surtido de bultos.',
    area: 'Almacén'
  },
  driver: {
    label: 'Conductor / Chofer',
    category: 'employee',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: Truck,
    description: 'Entrega en ruta a clientes, cobro de pedidos y retorno de jabas.',
    area: 'Reparto'
  },
  loader: {
    label: 'Cargador / Estibador',
    category: 'employee',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    icon: Package,
    description: 'Carga física en vehículos y verificación de conteo de bultos.',
    area: 'Logística'
  },
  store_sales: {
    label: 'Cajero / Mostrador',
    category: 'employee',
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    icon: Store,
    description: 'Ventas directas en mostrador, tickets y cobros en punto de venta.',
    area: 'Ventas'
  },
  inventory: {
    label: 'Encargado de Inventario',
    category: 'employee',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    icon: Boxes,
    description: 'Recepción de mercancía por proveedor, ajustes y registro de mermas.',
    area: 'Almacén'
  },
  karey_inventory: {
    label: 'Control Jabas Karey',
    category: 'employee',
    color: 'text-cyan-800',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
    icon: Boxes,
    description: 'Auditoría y control de peso de jabas origen Karey.',
    area: 'Almacén'
  },
  client: {
    label: 'Cliente Particular',
    category: 'client',
    color: 'text-slate-700',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-200',
    icon: ShoppingBag,
    description: 'Comprador individual. Acceso a catálogo público y seguimiento de pedidos.',
    area: 'Clientes'
  },
  company: {
    label: 'Cliente Empresa / Mayorista',
    category: 'client',
    color: 'text-sky-800',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
    icon: Building2,
    description: 'Comprador institucional o mayorista con condiciones comerciales.',
    area: 'Clientes'
  }
};

const EMPLOYEE_ROLES: UserRole[] = [
  'admin',
  'dispatcher',
  'preparer',
  'driver',
  'loader',
  'store_sales',
  'inventory',
  'karey_inventory'
];

const CLIENT_ROLES: UserRole[] = ['client', 'company'];

interface AdminUsersViewProps {
  users: UserProfile[];
  orders?: Order[];
  onBack: () => void;
  onRefresh?: () => void;
  showToast?: (msg: string, type?: ToastType) => void;
}

export function AdminUsersView({ users, orders = [], onBack, onRefresh, showToast }: AdminUsersViewProps) {
  const [activeTab, setActiveTab] = useState<'employees' | 'clients' | 'credits' | 'all'>('employees');
  const [searchTerm, setSearchTerm] = useState('');
  const [employeeAreaFilter, setEmployeeAreaFilter] = useState<string>('all');
  const [clientTypeFilter, setClientTypeFilter] = useState<string>('all');
  const [creditStatusFilter, setCreditStatusFilter] = useState<'all' | 'debtors' | 'with_limit' | 'without_limit'>('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [creditModalUser, setCreditModalUser] = useState<UserProfile | null>(null);
  const [creditModalTab, setCreditModalTab] = useState<'payment' | 'limit'>('payment');
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>('');
  const [newLimitInput, setNewLimitInput] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Split and metrics
  const { employees, clients, companies, totalDebt, totalCreditLimit, debtorsCount } = useMemo(() => {
    const emp: UserProfile[] = [];
    const cli: UserProfile[] = [];
    const comp: UserProfile[] = [];
    let debtSum = 0;
    let limitSum = 0;
    let debtors = 0;

    users.forEach(u => {
      if (EMPLOYEE_ROLES.includes(u.role)) {
        emp.push(u);
      } else {
        cli.push(u);
      }

      if (u.role === 'company') {
        comp.push(u);
        const bal = calculateClientCreditBalance(u.uid, orders);
        const lim = u.creditLimit || 0;
        debtSum += bal;
        limitSum += lim;
        if (bal > 0) debtors++;
      }
    });

    // Sort companies by debt descending by default
    comp.sort((a, b) => calculateClientCreditBalance(b.uid, orders) - calculateClientCreditBalance(a.uid, orders));

    return { 
      employees: emp, 
      clients: cli, 
      companies: comp, 
      totalDebt: debtSum, 
      totalCreditLimit: limitSum, 
      debtorsCount: debtors 
    };
  }, [users, orders]);

  // Filtered list based on active tab and search
  const filteredUsers = useMemo(() => {
    let list: UserProfile[] = [];

    if (activeTab === 'employees') {
      list = employees;
      if (employeeAreaFilter !== 'all') {
        list = list.filter(u => ROLE_CONFIG[u.role]?.area === employeeAreaFilter || u.role === employeeAreaFilter);
      }
    } else if (activeTab === 'clients') {
      list = clients;
      if (clientTypeFilter !== 'all') {
        list = list.filter(u => u.role === clientTypeFilter);
      }
    } else if (activeTab === 'credits') {
      list = companies;
      if (creditStatusFilter === 'debtors') {
        list = list.filter(u => calculateClientCreditBalance(u.uid, orders) > 0);
      } else if (creditStatusFilter === 'with_limit') {
        list = list.filter(u => (u.creditLimit || 0) > 0);
      } else if (creditStatusFilter === 'without_limit') {
        list = list.filter(u => !(u.creditLimit && u.creditLimit > 0));
      }
    } else {
      list = users;
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(u => 
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q)) ||
        (ROLE_CONFIG[u.role]?.label.toLowerCase().includes(q))
      );
    }

    return list;
  }, [activeTab, employees, clients, companies, users, orders, employeeAreaFilter, clientTypeFilter, creditStatusFilter, searchTerm]);

  const updateUserRole = async (uid: string, newRole: UserRole) => {
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      if (showToast) {
        showToast(`Rol actualizado a "${ROLE_CONFIG[newRole]?.label || newRole}"`, 'success');
      }
      setSelectedUser(null);
      if (onRefresh) onRefresh();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
      if (showToast) {
        showToast('Error al actualizar el rol', 'error');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openCreditModal = (user: UserProfile, defaultTab: 'payment' | 'limit' = 'payment') => {
    setCreditModalUser(user);
    setCreditModalTab(defaultTab);
    setNewLimitInput(String(user.creditLimit || 0));
    const bal = calculateClientCreditBalance(user.uid, orders);
    setPaymentAmountInput(bal > 0 ? String(bal) : '');
  };

  const handleSaveCreditLimit = async () => {
    if (!creditModalUser) return;
    const parsedLimit = Math.max(0, Number(newLimitInput) || 0);
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'users', creditModalUser.uid), {
        creditLimit: parsedLimit
      });
      if (showToast) {
        showToast(`Límite de crédito actualizado a $${parsedLimit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, 'success');
      }
      setCreditModalUser(prev => prev ? { ...prev, creditLimit: parsedLimit } : null);
      if (onRefresh) onRefresh();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${creditModalUser.uid}`);
      if (showToast) {
        showToast('Error al actualizar el límite de crédito', 'error');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRegisterPayment = async () => {
    if (!creditModalUser) return;
    const monto = Number(paymentAmountInput);
    if (isNaN(monto) || monto <= 0) {
      if (showToast) showToast('Ingresa un monto válido mayor a 0', 'error');
      return;
    }

    // Pedidos a crédito pendientes de este cliente, del más antiguo al más reciente
    const pendingCreditOrders = orders
      .filter(o => o.userId === creditModalUser.uid && o.paymentMethod === 'credit' && o.paymentStatus === 'pending')
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));

    let remaining = monto;
    const batch = writeBatch(db);
    for (const order of pendingCreditOrders) {
      if (remaining <= 0) break;
      const orderTotal = order.adjustedTotal ?? order.total;
      if (orderTotal <= remaining) {
        batch.update(doc(db, 'orders', order.id), { paymentStatus: 'paid', paidAt: serverTimestamp() });
        remaining -= orderTotal;
      }
      // Nota: si el monto pagado no alcanza a cubrir el siguiente pedido completo,
      // ese pedido se queda pendiente (no hay pagos parciales de un solo pedido, solo pedidos completos).
    }

    setIsUpdating(true);
    try {
      await batch.commit();
      if (showToast) {
        showToast(`Pago de $${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} aplicado a los pedidos más antiguos.`, 'success');
      }
      setPaymentAmountInput('');
      if (onRefresh) onRefresh();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${creditModalUser.uid}`);
      if (showToast) showToast('Error al registrar el pago', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-24"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronRight className="w-6 h-6 rotate-180 text-gray-700" />
          </Button>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
              Personal y Clientes
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Administración de empleados, puestos operativos y directorio de clientes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onRefresh} 
              className="h-10 px-3.5 flex items-center gap-2 rounded-xl text-xs font-semibold border-gray-200 hover:bg-gray-50 text-gray-700 shadow-xs"
            >
              <RotateCcw className="w-4 h-4 text-gray-500" />
              <span>Actualizar</span>
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards de Segmentación */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          onClick={() => { setActiveTab('employees'); setEmployeeAreaFilter('all'); }}
          className={cn(
            "p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-center justify-between",
            activeTab === 'employees' 
              ? "bg-purple-900 text-white border-purple-900 shadow-md ring-2 ring-purple-600/30" 
              : "bg-white text-gray-900 border-gray-100 shadow-xs hover:border-purple-200 hover:bg-purple-50/30"
          )}
        >
          <div className="flex items-center gap-3.5">
            <div className={cn(
              "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0",
              activeTab === 'employees' ? "bg-white/10 text-purple-200" : "bg-purple-50 text-purple-600"
            )}>
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <p className={cn("text-[11px] font-bold uppercase tracking-wider", activeTab === 'employees' ? "text-purple-200" : "text-gray-400")}>
                Personal
              </p>
              <p className="text-xl font-black mt-0.5">
                {employees.length}
              </p>
              <p className={cn("text-[10px] font-medium mt-0.5", activeTab === 'employees' ? "text-purple-200/80" : "text-gray-500")}>
                Puestos operativos
              </p>
            </div>
          </div>
          <ChevronRight className={cn("w-4 h-4 shrink-0", activeTab === 'employees' ? "text-purple-300" : "text-gray-300")} />
        </button>

        <button
          onClick={() => { setActiveTab('clients'); setClientTypeFilter('all'); }}
          className={cn(
            "p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-center justify-between",
            activeTab === 'clients' 
              ? "bg-blue-900 text-white border-blue-900 shadow-md ring-2 ring-blue-600/30" 
              : "bg-white text-gray-900 border-gray-100 shadow-xs hover:border-blue-200 hover:bg-blue-50/30"
          )}
        >
          <div className="flex items-center gap-3.5">
            <div className={cn(
              "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0",
              activeTab === 'clients' ? "bg-white/10 text-blue-200" : "bg-blue-50 text-blue-600"
            )}>
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <p className={cn("text-[11px] font-bold uppercase tracking-wider", activeTab === 'clients' ? "text-blue-200" : "text-gray-400")}>
                Clientes
              </p>
              <p className="text-xl font-black mt-0.5">
                {clients.length}
              </p>
              <p className={cn("text-[10px] font-medium mt-0.5", activeTab === 'clients' ? "text-blue-200/80" : "text-gray-500")}>
                {companies.length} empresas
              </p>
            </div>
          </div>
          <ChevronRight className={cn("w-4 h-4 shrink-0", activeTab === 'clients' ? "text-blue-300" : "text-gray-300")} />
        </button>

        <button
          onClick={() => { setActiveTab('credits'); setCreditStatusFilter('all'); }}
          className={cn(
            "p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-center justify-between",
            activeTab === 'credits' 
              ? "bg-emerald-900 text-white border-emerald-900 shadow-md ring-2 ring-emerald-600/30" 
              : "bg-white text-gray-900 border-gray-100 shadow-xs hover:border-emerald-200 hover:bg-emerald-50/30"
          )}
        >
          <div className="flex items-center gap-3.5">
            <div className={cn(
              "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0",
              activeTab === 'credits' ? "bg-white/10 text-emerald-200" : "bg-emerald-50 text-emerald-600"
            )}>
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className={cn("text-[11px] font-bold uppercase tracking-wider", activeTab === 'credits' ? "text-emerald-200" : "text-gray-400")}>
                Créditos Empresa
              </p>
              <p className="text-xl font-black mt-0.5 text-emerald-600">
                ${totalDebt.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              <p className={cn("text-[10px] font-medium mt-0.5", activeTab === 'credits' ? "text-emerald-200/80" : "text-gray-500")}>
                {debtorsCount} con saldo deudor
              </p>
            </div>
          </div>
          <ChevronRight className={cn("w-4 h-4 shrink-0", activeTab === 'credits' ? "text-emerald-300" : "text-gray-300")} />
        </button>

        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            "p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-center justify-between",
            activeTab === 'all' 
              ? "bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-600/30" 
              : "bg-white text-gray-900 border-gray-100 shadow-xs hover:border-slate-300 hover:bg-slate-50/30"
          )}
        >
          <div className="flex items-center gap-3.5">
            <div className={cn(
              "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0",
              activeTab === 'all' ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700"
            )}>
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className={cn("text-[11px] font-bold uppercase tracking-wider", activeTab === 'all' ? "text-slate-300" : "text-gray-400")}>
                Total Cuentas
              </p>
              <p className="text-xl font-black mt-0.5">
                {users.length}
              </p>
              <p className={cn("text-[10px] font-medium mt-0.5", activeTab === 'all' ? "text-slate-300/80" : "text-gray-500")}>
                Usuarios registrados
              </p>
            </div>
          </div>
          <ChevronRight className={cn("w-4 h-4 shrink-0", activeTab === 'all' ? "text-slate-300" : "text-gray-300")} />
        </button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Tabs Selector */}
          <div className="flex items-center p-1 bg-gray-100/80 rounded-xl overflow-x-auto shrink-0">
            <button
              onClick={() => setActiveTab('employees')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0",
                activeTab === 'employees' 
                  ? "bg-white text-purple-900 shadow-xs" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Personal ({employees.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0",
                activeTab === 'clients' 
                  ? "bg-white text-blue-900 shadow-xs" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Clientes ({clients.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('credits')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0",
                activeTab === 'credits' 
                  ? "bg-white text-emerald-900 shadow-xs" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Créditos & Cobranza ({companies.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0",
                activeTab === 'all' 
                  ? "bg-white text-gray-900 shadow-xs" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Todos ({users.length})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeTab === 'employees' 
                  ? "Buscar empleado por nombre, correo, puesto..." 
                  : activeTab === 'clients' 
                  ? "Buscar cliente por nombre, teléfono, empresa..." 
                  : activeTab === 'credits'
                  ? "Buscar empresa por nombre, correo o saldo..."
                  : "Buscar usuario..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 transition-colors"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sub-filtros específicos por pestaña */}
        {activeTab === 'employees' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 border-t border-gray-100">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-2 shrink-0 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Área:
            </span>
            {[
              { id: 'all', label: 'Todos los Puestos' },
              { id: 'Dirección', label: 'Dirección' },
              { id: 'Logística', label: 'Logística' },
              { id: 'Reparto', label: 'Reparto / Choferes' },
              { id: 'Almacén', label: 'Almacén & Jabas' },
              { id: 'Ventas', label: 'Ventas Mostrador' }
            ].map(area => (
              <button
                key={area.id}
                onClick={() => setEmployeeAreaFilter(area.id)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0",
                  employeeAreaFilter === area.id
                    ? "bg-purple-100 text-purple-800 border border-purple-200 font-black"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                )}
              >
                {area.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 border-t border-gray-100">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-2 shrink-0 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Tipo:
            </span>
            {[
              { id: 'all', label: 'Todos los Clientes' },
              { id: 'client', label: 'Particulares' },
              { id: 'company', label: 'Empresas / Mayoristas' }
            ].map(type => (
              <button
                key={type.id}
                onClick={() => setClientTypeFilter(type.id)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0",
                  clientTypeFilter === type.id
                    ? "bg-blue-100 text-blue-800 border border-blue-200 font-black"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                )}
              >
                {type.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'credits' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 border-t border-gray-100">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-2 shrink-0 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Estado de Cuenta:
            </span>
            {[
              { id: 'all', label: 'Todas las Empresas' },
              { id: 'debtors', label: `Con Saldo Deudor (${debtorsCount})` },
              { id: 'with_limit', label: 'Con Límite Autorizado' },
              { id: 'without_limit', label: 'Sin Límite Asignado' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setCreditStatusFilter(f.id as any)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0",
                  creditStatusFilter === f.id
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200 font-black"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Banner Resumen de Crédito cuando se está en pestaña Créditos */}
      {activeTab === 'credits' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-red-100 shadow-xs flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Cartera por Cobrar (Deuda Total)</p>
              <p className="text-2xl font-black text-red-600 mt-0.5">
                ${totalDebt.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {debtorsCount} empresas con pagos pendientes
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-xs flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Línea de Crédito Otorgada</p>
              <p className="text-2xl font-black text-blue-900 mt-0.5">
                ${totalCreditLimit.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Tope total autorizado por administración
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Crédito Disponible Global</p>
              <p className="text-2xl font-black text-emerald-700 mt-0.5">
                ${Math.max(0, totalCreditLimit - totalDebt).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Margen disponible para pedidos futuros
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Grid de Resultados */}
      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-xs space-y-3">
          <div className="w-14 h-14 bg-gray-50 text-gray-400 rounded-2xl flex items-center justify-center mx-auto">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-900">No se encontraron usuarios</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {searchTerm 
              ? `No hay coincidencias para "${searchTerm}". Intenta con otro término o limpia el buscador.`
              : 'No hay usuarios en esta categoría.'}
          </p>
          {searchTerm && (
            <Button variant="outline" size="sm" onClick={() => setSearchTerm('')} className="mt-2 text-xs">
              Limpiar búsqueda
            </Button>
          )}
        </div>
      ) : activeTab === 'credits' ? (
        /* Vista Especial de Cobranza y Gestión de Créditos */
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-bold text-gray-500">
              Mostrando {filteredUsers.length} empresas ordenadas por saldo deudor
            </p>
            <p className="text-[11px] text-gray-400 font-medium italic">
              El cliente solo puede usar crédito si saldo &lt; límite autorizado
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map(u => {
              const limit = u.creditLimit || 0;
              const balance = calculateClientCreditBalance(u.uid, orders);
              const available = Math.max(0, limit - balance);
              const usagePercent = limit > 0 ? Math.min(100, Math.round((balance / limit) * 100)) : 0;
              const hasDebt = balance > 0;
              const isOverLimit = limit > 0 && balance >= limit;

              return (
                <div 
                  key={u.uid}
                  className={cn(
                    "bg-white rounded-2xl p-4 border shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4",
                    hasDebt ? "border-red-200 ring-1 ring-red-100" : limit > 0 ? "border-emerald-200" : "border-gray-100"
                  )}
                >
                  {/* Info Superior */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={cn(
                          "w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 border",
                          hasDebt 
                            ? "bg-red-50 text-red-700 border-red-200" 
                            : limit > 0 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                            : "bg-sky-50 text-sky-700 border-sky-200"
                        )}>
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-black text-gray-950 text-sm leading-snug truncate">
                            {u.name || 'Empresa sin nombre'}
                          </h4>
                          <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                            <span className="truncate">{u.email}</span>
                          </p>
                          {u.phone && (
                            <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                              <span>{u.phone}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <span className={cn(
                        "text-[10px] font-black uppercase px-2 py-0.5 rounded-md shrink-0 border",
                        isOverLimit 
                          ? "bg-red-100 text-red-800 border-red-200"
                          : hasDebt 
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : limit > 0 
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      )}>
                        {isOverLimit ? 'Límite Topado' : hasDebt ? 'Con Deuda' : limit > 0 ? 'Al Corriente' : 'Sin Límite'}
                      </span>
                    </div>

                    {/* Barra de Consumo de Crédito */}
                    <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100 space-y-2">
                      <div className="flex justify-between items-baseline text-xs">
                        <span className="text-gray-500 font-medium">Saldo Deudor (Debe):</span>
                        <span className={cn("font-black text-sm", hasDebt ? "text-red-600" : "text-gray-700")}>
                          ${balance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      {limit > 0 && (
                        <div className="space-y-1">
                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all",
                                usagePercent >= 100 ? "bg-red-600" : usagePercent >= 75 ? "bg-amber-500" : "bg-emerald-500"
                              )}
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-gray-400 font-medium">
                            <span>Límite: ${limit.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</span>
                            <span>{usagePercent}% usado</span>
                            <span>Disp: ${available.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</span>
                          </div>
                        </div>
                      )}

                      {limit === 0 && (
                        <p className="text-[11px] text-gray-400 italic">
                          Sin límite configurado ($0.00). La opción de crédito no estará disponible para este cliente.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Botones de Acción de Cobranza */}
                  <div className="pt-2 border-t border-gray-100 flex items-center gap-2">
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => openCreditModal(u, 'payment')}
                      className={cn(
                        "flex-1 h-9 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-2xs",
                        hasDebt ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-emerald-100" : "hover:bg-gray-50 text-gray-700"
                      )}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>{hasDebt ? 'Abonar / Liquidar' : 'Registrar Pago'}</span>
                    </Button>

                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openCreditModal(u, 'limit')}
                      className="h-9 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-1 shrink-0"
                      title="Modificar límite de crédito autorizado"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Límite</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map(u => {
            const roleInfo = ROLE_CONFIG[u.role] || ROLE_CONFIG.client;
            const RoleIcon = roleInfo.icon;
            const isEmp = roleInfo.category === 'employee';
            const isCompany = u.role === 'company';
            const limit = u.creditLimit || 0;
            const balance = calculateClientCreditBalance(u.uid, orders);
            const available = Math.max(0, limit - balance);

            return (
              <div 
                key={u.uid} 
                className={cn(
                  "bg-white rounded-2xl p-4 border shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 group",
                  isEmp ? "border-purple-100/80 hover:border-purple-300" : isCompany ? "border-sky-100 hover:border-sky-300" : "border-gray-100 hover:border-blue-200"
                )}
              >
                {/* Cabecera de la Tarjeta */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn(
                      "w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 border",
                      isEmp 
                        ? "bg-purple-50 text-purple-700 border-purple-100" 
                        : isCompany
                        ? "bg-sky-50 text-sky-700 border-sky-100"
                        : "bg-gray-100 text-gray-700 border-gray-200"
                    )}>
                      {(u.name || u.email || 'U').charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-gray-950 text-sm leading-snug truncate">
                          {u.name || 'Usuario sin nombre'}
                        </h4>
                      </div>

                      <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </p>

                      {u.phone && (
                        <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                          <span>{u.phone}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Si es Empresa, mostramos su resumen de crédito */}
                {isCompany && (
                  <div className="p-2.5 bg-sky-50/60 rounded-xl border border-sky-100/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-sky-900 font-bold flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-sky-700" /> Línea de Crédito:
                      </span>
                      <span className="font-black text-sky-950">
                        ${limit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-gray-600">
                      <span>Deuda: <strong className={balance > 0 ? "text-red-600 font-bold" : "text-gray-700"}>${balance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></span>
                      <span>Disp: <strong className="text-emerald-700 font-bold">${available.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></span>
                    </div>

                    <button
                      onClick={() => openCreditModal(u, balance > 0 ? 'payment' : 'limit')}
                      className="w-full py-1 text-[10px] font-bold text-sky-800 hover:text-sky-950 hover:bg-sky-100/60 rounded-md transition-colors flex items-center justify-center gap-1"
                    >
                      <span>Gestionar Crédito & Cobranza</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Badge de Rol y Categoría */}
                <div className="pt-2 border-t border-gray-50 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border",
                      roleInfo.bgColor,
                      roleInfo.color,
                      roleInfo.borderColor
                    )}>
                      <RoleIcon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{roleInfo.label}</span>
                    </span>
                    
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                      {roleInfo.area}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {isCompany && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openCreditModal(u, 'payment')}
                        className="h-8 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg flex items-center gap-1"
                        title="Gestionar crédito"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Crédito</span>
                      </Button>
                    )}

                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setSelectedUser(u)}
                      className="h-8 px-2.5 text-xs font-semibold text-gray-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg flex items-center gap-1.5 shrink-0"
                      title="Modificar rol o permisos"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Gestión de Crédito (Límite & Registro de Pagos) */}
      <AnimatePresence>
        {creditModalUser && (
          <div className="fixed inset-0 bg-black/60 z-[110] flex items-end sm:items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              {/* Header Modal */}
              <div className="flex justify-between items-start pb-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-gray-900 leading-tight">Crédito Comercial</h3>
                    <p className="text-xs text-gray-500 font-medium">
                      {creditModalUser.name || creditModalUser.email}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setCreditModalUser(null)} 
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tarjeta de Estado Actual de la Cuenta */}
              {(() => {
                const modalUserBalance = calculateClientCreditBalance(creditModalUser.uid, orders);
                const modalUserLimit = creditModalUser.creditLimit || 0;
                const modalUserAvailable = Math.max(0, modalUserLimit - modalUserBalance);

                return (
                  <>
                    <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-3 shadow-md">
                      <div className="flex justify-between items-center text-xs text-slate-300">
                        <span className="font-bold uppercase tracking-wider">Estado de Cuenta</span>
                        <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-200 text-[10px] font-black uppercase">
                          Cliente Empresa
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800">
                        <div>
                          <p className="text-[10px] text-slate-400 font-medium uppercase">Límite Autorizado</p>
                          <p className="text-base font-black text-white mt-0.5">
                            ${modalUserLimit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-red-300 font-medium uppercase">Saldo Deudor</p>
                          <p className="text-base font-black text-red-400 mt-0.5">
                            ${modalUserBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-300 font-medium uppercase">Disponible</p>
                          <p className="text-base font-black text-emerald-400 mt-0.5">
                            ${modalUserAvailable.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Tabs de Acción: Registrar Pago vs Ajustar Límite */}
                    <div className="flex p-1 bg-gray-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setCreditModalTab('payment');
                          setPaymentAmountInput(modalUserBalance > 0 ? String(modalUserBalance) : '');
                        }}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                          creditModalTab === 'payment' ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
                        )}
                      >
                        <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Abonar / Registrar Pago</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCreditModalTab('limit');
                          setNewLimitInput(String(modalUserLimit));
                        }}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                          creditModalTab === 'limit' ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
                        )}
                      >
                        <Settings className="w-3.5 h-3.5 text-sky-600" />
                        <span>Modificar Límite</span>
                      </button>
                    </div>

                    {/* Formulario según pestaña seleccionada */}
                    {creditModalTab === 'payment' ? (
                      <div className="space-y-4 pt-1">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700">
                            Monto a Abonar / Liquidar ($ MXN)
                          </label>
                          <div className="relative">
                            <DollarSign className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={paymentAmountInput}
                              onChange={(e) => setPaymentAmountInput(e.target.value)}
                              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors"
                            />
                          </div>
                        </div>

                        {/* Botones de Monto Rápido */}
                        {modalUserBalance > 0 && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setPaymentAmountInput(String(modalUserBalance))}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold transition-colors border border-emerald-200"
                            >
                              Liquidar Total (${modalUserBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })})
                            </button>
                            {modalUserBalance > 500 && (
                              <button
                                type="button"
                                onClick={() => setPaymentAmountInput('500')}
                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                              >
                                $500.00
                              </button>
                            )}
                            {modalUserBalance > 1000 && (
                              <button
                                type="button"
                                onClick={() => setPaymentAmountInput('1000')}
                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                              >
                                $1,000.00
                              </button>
                            )}
                            {modalUserBalance > 5000 && (
                              <button
                                type="button"
                                onClick={() => setPaymentAmountInput('5000')}
                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                              >
                                $5,000.00
                              </button>
                            )}
                          </div>
                        )}

                        {/* Previsualización del saldo restante */}
                        {Number(paymentAmountInput) > 0 && (
                          <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 text-xs flex items-center justify-between">
                            <span className="text-emerald-900 font-semibold">Nuevo saldo deudor tras el abono:</span>
                            <span className="font-black text-emerald-950 text-sm">
                              ${Math.max(0, modalUserBalance - Number(paymentAmountInput)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}

                        <div className="flex gap-2.5 pt-2">
                          <Button 
                            variant="outline" 
                            onClick={() => setCreditModalUser(null)} 
                            className="flex-1 h-11 text-xs font-bold rounded-xl"
                          >
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleRegisterPayment} 
                            disabled={isUpdating || !paymentAmountInput || Number(paymentAmountInput) <= 0}
                            className="flex-[2] h-11 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 shadow-md"
                          >
                            {isUpdating ? 'Registrando...' : 'Aplicar Abono / Pago'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 pt-1">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-700">
                            Límite de Crédito Autorizado ($ MXN)
                          </label>
                          <div className="relative">
                            <DollarSign className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="number"
                              step="100"
                              min="0"
                              placeholder="0.00"
                              value={newLimitInput}
                              onChange={(e) => setNewLimitInput(e.target.value)}
                              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600 transition-colors"
                            />
                          </div>
                          <p className="text-[11px] text-gray-500">
                            0 o vacío = Sin crédito autorizado. Si se asigna un límite, el cliente podrá seleccionar "Pagar a crédito" en el checkout hasta alcanzar este tope.
                          </p>
                        </div>

                        {/* Preajustes rápidos de límite */}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setNewLimitInput('0')}
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold transition-colors border border-red-200"
                          >
                            $0 (Sin crédito)
                          </button>
                          {['2000', '5000', '10000', '20000', '50000'].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setNewLimitInput(val)}
                              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                            >
                              ${Number(val).toLocaleString('es-MX')}
                            </button>
                          ))}
                        </div>

                        <div className="flex gap-2.5 pt-2">
                          <Button 
                            variant="outline" 
                            onClick={() => setCreditModalUser(null)} 
                            className="flex-1 h-11 text-xs font-bold rounded-xl"
                          >
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleSaveCreditLimit} 
                            disabled={isUpdating}
                            className="flex-[2] h-11 text-xs font-bold rounded-xl bg-sky-700 hover:bg-sky-800 text-white shadow-sky-200 shadow-md"
                          >
                            {isUpdating ? 'Guardando...' : 'Guardar Límite Autorizado'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Asignación / Cambio de Rol */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-white w-full max-w-xl rounded-t-3xl sm:rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              {/* Header Modal */}
              <div className="flex justify-between items-start pb-4 border-b border-gray-100">
                <div>
                  <h3 className="font-black text-lg text-gray-900">Gestionar Puesto / Rol</h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    Asigna permisos operativos o designa como cliente
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedUser(null)} 
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Info del usuario */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Usuario Seleccionado</p>
                <p className="font-black text-gray-900 text-sm">{selectedUser.name || 'Sin nombre asignado'}</p>
                <p className="text-xs text-gray-500 font-medium">{selectedUser.email}</p>
                {selectedUser.phone && (
                  <p className="text-xs text-gray-500 font-medium">Tel: {selectedUser.phone}</p>
                )}
                <div className="pt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 font-medium">Rol actual:</span>
                    <span className={cn(
                      "text-[10px] font-black uppercase px-2 py-0.5 rounded-md",
                      ROLE_CONFIG[selectedUser.role]?.bgColor || "bg-gray-100",
                      ROLE_CONFIG[selectedUser.role]?.color || "text-gray-700"
                    )}>
                      {ROLE_CONFIG[selectedUser.role]?.label || selectedUser.role}
                    </span>
                  </div>

                  {selectedUser.role === 'company' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const target = selectedUser;
                        setSelectedUser(null);
                        openCreditModal(target, 'limit');
                      }}
                      className="h-7 px-2 text-[11px] font-bold text-sky-800 bg-sky-50 border-sky-200 hover:bg-sky-100 rounded-lg flex items-center gap-1"
                    >
                      <Building2 className="w-3 h-3" />
                      <span>Gestionar Crédito</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Selector de Roles Agrupado */}
              <div className="space-y-4">
                {/* Grupo 1: Personal y Operación */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <Briefcase className="w-3.5 h-3.5 text-purple-600" />
                    <p className="text-xs font-black text-purple-900 uppercase tracking-wider">
                      Personal Operativo de la Empresa
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {EMPLOYEE_ROLES.map((r) => {
                      const cfg = ROLE_CONFIG[r];
                      const Icon = cfg.icon;
                      const isSelected = selectedUser.role === r;

                      return (
                        <button
                          key={r}
                          disabled={isUpdating}
                          onClick={() => updateUserRole(selectedUser.uid, r)}
                          className={cn(
                            "p-3 rounded-xl border text-left transition-all flex items-start gap-2.5",
                            isSelected 
                              ? "border-purple-600 bg-purple-50 ring-2 ring-purple-600/20" 
                              : "border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/20"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                            cfg.bgColor,
                            cfg.color
                          )}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-bold leading-tight", isSelected ? "text-purple-950 font-black" : "text-gray-900")}>
                                {cfg.label}
                              </p>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                            </div>
                            <p className="text-[10px] text-gray-500 leading-tight mt-0.5 line-clamp-2">
                              {cfg.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grupo 2: Clientes y Empresas */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2 px-1">
                    <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
                    <p className="text-xs font-black text-blue-900 uppercase tracking-wider">
                      Clientes y Compradores
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CLIENT_ROLES.map((r) => {
                      const cfg = ROLE_CONFIG[r];
                      const Icon = cfg.icon;
                      const isSelected = selectedUser.role === r;

                      return (
                        <button
                          key={r}
                          disabled={isUpdating}
                          onClick={() => updateUserRole(selectedUser.uid, r)}
                          className={cn(
                            "p-3 rounded-xl border text-left transition-all flex items-start gap-2.5",
                            isSelected 
                              ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600/20" 
                              : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/20"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                            cfg.bgColor,
                            cfg.color
                          )}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-bold leading-tight", isSelected ? "text-blue-950 font-black" : "text-gray-900")}>
                                {cfg.label}
                              </p>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                            </div>
                            <p className="text-[10px] text-gray-500 leading-tight mt-0.5">
                              {cfg.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Botón Cerrar */}
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedUser(null)} 
                  className="w-full h-11 text-xs font-bold rounded-xl"
                >
                  Cancelar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
