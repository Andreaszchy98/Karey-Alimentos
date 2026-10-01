import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  ChevronRight, 
  ChevronDown,
  Activity, 
  Truck, 
  PackageCheck, 
  Package, 
  CreditCard, 
  CheckCircle2, 
  Filter, 
  Clock, 
  FileText,
  Search,
  Calendar,
  Store,
  ArrowRight,
  X,
  ShoppingBag,
  RotateCcw,
  AlertTriangle,
  Timer,
  Scale,
  DollarSign,
  Box,
  UserCheck
} from 'lucide-react';
import { Order, DeliveryRoute, UserProfile, Return, ContainerMovement } from '../../types';
import { cn } from '../../components/ui';

function toJsDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  if (ts instanceof Date) return ts;
  if (typeof (ts as { seconds?: number }).seconds === 'number') {
    return new Date((ts as { seconds: number }).seconds * 1000);
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function formatTime(ts: unknown): string {
  const d = toJsDate(ts);
  if (!d) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(ts: unknown): string {
  const d = toJsDate(ts);
  if (!d) return 'Sin fecha';
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Helper to evaluate delivery punctuality
interface PunctualityResult {
  status: 'on_time' | 'delayed' | 'in_window' | 'overdue_in_transit' | 'not_applicable';
  label: string;
  badgeClass: string;
  detail: string;
  delayMinutes?: number;
  fulfillmentMinutes?: number;
}

function evaluatePunctuality(order: Order): PunctualityResult {
  const createdAt = toJsDate(order.createdAt);
  const deliveredAt = toJsDate(order.deliveredAt);
  const isDelivered = ['delivered', 'completed'].includes(order.status) || !!deliveredAt;

  let targetEndMinutes: number | null = null;
  const slotStr = order.deliverySlot || (order.deliveryWindowEnd ? `${order.deliveryWindowStart || ''}-${order.deliveryWindowEnd}` : '');

  if (slotStr) {
    const matches = slotStr.match(/(\d{1,2}):(\d{2})(?:\s*-\s*|\s*a\s*)(\d{1,2}):(\d{2})/i);
    if (matches) {
      const endHour = parseInt(matches[3], 10);
      const endMin = parseInt(matches[4], 10);
      targetEndMinutes = endHour * 60 + endMin;
    }
  }

  if (isDelivered && deliveredAt) {
    const fulfillmentMinutes = createdAt ? Math.round((deliveredAt.getTime() - createdAt.getTime()) / (60 * 1000)) : undefined;

    if (targetEndMinutes !== null) {
      const deliveredMinutes = deliveredAt.getHours() * 60 + deliveredAt.getMinutes();
      const diff = deliveredMinutes - targetEndMinutes;

      if (diff > 10) {
        return {
          status: 'delayed',
          label: `Con Retraso (+${diff}m)`,
          badgeClass: 'bg-red-50 text-red-700 border-red-200',
          detail: `Entregado a las ${formatTime(deliveredAt)} · Ventana pactada: ${slotStr}`,
          delayMinutes: diff,
          fulfillmentMinutes
        };
      } else {
        return {
          status: 'on_time',
          label: 'A Tiempo',
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          detail: `Entregado a las ${formatTime(deliveredAt)} · Dentro de ventana (${slotStr})`,
          fulfillmentMinutes
        };
      }
    }

    return {
      status: 'on_time',
      label: fulfillmentMinutes !== undefined ? `Entregado (${fulfillmentMinutes} min)` : 'Entregado',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      detail: `Completado a las ${formatTime(deliveredAt)}${fulfillmentMinutes ? ` en ${fulfillmentMinutes} minutos` : ''}`,
      fulfillmentMinutes
    };
  }

  if (order.status === 'shipped') {
    if (targetEndMinutes !== null) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      if (currentMinutes > targetEndMinutes + 10) {
        return {
          status: 'overdue_in_transit',
          label: 'En Ruta · Fuera de Horario',
          badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
          detail: `Ventana prometida (${slotStr}) vencida hace ${currentMinutes - targetEndMinutes} min`
        };
      }
      return {
        status: 'in_window',
        label: 'En Ruta · A Tiempo',
        badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
        detail: `En camino dentro de la ventana (${slotStr})`
      };
    }
    return {
      status: 'in_window',
      label: 'En Ruta',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      detail: 'En reparto con el chofer'
    };
  }

  return {
    status: 'not_applicable',
    label: order.status === 'ready' ? 'Listo en Espera' : order.status === 'processing' ? 'En Preparación' : 'Pendiente',
    badgeClass: 'bg-gray-50 text-gray-600 border-gray-200',
    detail: slotStr ? `Ventana solicitada: ${slotStr}` : 'Sin ventana horaria fija'
  };
}

export function AdminActivityView({
  orders,
  users,
  routes,
  returns = [],
  containerMovements: externalMovements,
  onBack
}: {
  orders: Order[];
  users: UserProfile[];
  routes: DeliveryRoute[];
  returns?: Return[];
  containerMovements?: ContainerMovement[];
  onBack: () => void;
}) {
  // Top view tab
  const [activeMainTab, setActiveMainTab] = useState<'orders' | 'jabas'>('orders');

  // Filter states for orders
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('all');
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [selectedDateRange, setSelectedDateRange] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>('all');
  const [customDate, setCustomDate] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedReturnFilter, setSelectedReturnFilter] = useState<'all' | 'with_returns' | 'no_returns'>('all');
  const [selectedPunctualityFilter, setSelectedPunctualityFilter] = useState<'all' | 'on_time' | 'delayed'>('all');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Filter states for jabas
  const [jabaFilterStatus, setJabaFilterStatus] = useState<'all' | 'shortage' | 'reconciled' | 'open'>('all');
  const [jabaSearchTerm, setJabaSearchTerm] = useState('');
  const [internalMovements, setInternalMovements] = useState<ContainerMovement[]>([]);

  useEffect(() => {
    if (externalMovements && externalMovements.length > 0) return;
    const q = query(collection(db, 'containerMovements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const docs: ContainerMovement[] = [];
      snap.forEach((d) => docs.push({ id: d.id, ...d.data() } as ContainerMovement));
      setInternalMovements(docs);
    }, (err) => {
      console.warn("Could not load container movements in admin view:", err);
    });
    return () => unsub();
  }, [externalMovements]);

  const containerMovements = useMemo(() => {
    return (externalMovements && externalMovements.length > 0) ? externalMovements : internalMovements;
  }, [externalMovements, internalMovements]);

  // Lookup maps
  const userMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    users.forEach(u => map.set(u.uid, u));
    return map;
  }, [users]);

  const routeMap = useMemo(() => {
    const map = new Map<string, DeliveryRoute>();
    routes.forEach(r => map.set(r.id, r));
    return map;
  }, [routes]);

  // Map of returns grouped by orderId
  const returnsByOrderId = useMemo(() => {
    const map = new Map<string, Return[]>();
    returns.forEach(ret => {
      if (ret.orderId) {
        const list = map.get(ret.orderId) || [];
        list.push(ret);
        map.set(ret.orderId, list);
      }
    });
    return map;
  }, [returns]);

  // List of staff members who have participated or are staff
  const staffList = useMemo(() => {
    const staffMap = new Map<string, { id: string; name: string; role?: string }>();
    
    users.filter(u => ['admin', 'dispatcher', 'preparer', 'loader', 'driver', 'store_sales', 'inventory'].includes(u.role)).forEach(u => {
      staffMap.set(u.uid, { id: u.uid, name: u.name, role: u.role });
    });

    orders.forEach(o => {
      if (o.dispatchedBy && o.dispatchedByName) staffMap.set(o.dispatchedBy, { id: o.dispatchedBy, name: o.dispatchedByName, role: 'dispatcher' });
      if (o.preparedBy && o.preparedByName) staffMap.set(o.preparedBy, { id: o.preparedBy, name: o.preparedByName, role: 'preparer' });
      if (o.loadedBy && o.loadedByName) staffMap.set(o.loadedBy, { id: o.loadedBy, name: o.loadedByName, role: 'loader' });
      if (o.processedBy && o.processedByName) staffMap.set(o.processedBy, { id: o.processedBy, name: o.processedByName, role: 'store_sales' });
      if (o.driverId && !staffMap.has(o.driverId)) {
        const u = userMap.get(o.driverId);
        if (u) staffMap.set(o.driverId, { id: o.driverId, name: u.name, role: 'driver' });
      }
    });

    return Array.from(staffMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [users, orders, userMap]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return orders.filter(order => {
      const orderDate = toJsDate(order.createdAt) || new Date();
      const orderReturns = returnsByOrderId.get(order.id) || [];
      const hasReturns = !!order.hasReturns || (order.returnedItems && order.returnedItems.length > 0) || orderReturns.length > 0;
      const punctuality = evaluatePunctuality(order);

      // Text search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const folio = order.id.toLowerCase();
        const client = (order.userName || '').toLowerCase();
        const phone = (order.userPhone || '').toLowerCase();
        const address = (order.address || '').toLowerCase();
        const route = order.routeId ? (routeMap.get(order.routeId)?.name || '').toLowerCase() : '';
        const hasMatchingProduct = order.items?.some(i => i.name.toLowerCase().includes(term));

        if (!folio.includes(term) && !client.includes(term) && !phone.includes(term) && !address.includes(term) && !route.includes(term) && !hasMatchingProduct) {
          return false;
        }
      }

      // Staff filter
      if (selectedStaff !== 'all') {
        const staffObj = staffList.find(s => s.id === selectedStaff);
        const staffName = staffObj?.name.toLowerCase();
        
        const matched = 
          order.dispatchedBy === selectedStaff || 
          order.preparedBy === selectedStaff || 
          order.loadedBy === selectedStaff || 
          order.processedBy === selectedStaff || 
          order.driverId === selectedStaff ||
          (staffName && (
            (order.dispatchedByName && order.dispatchedByName.toLowerCase().includes(staffName)) ||
            (order.preparedByName && order.preparedByName.toLowerCase().includes(staffName)) ||
            (order.loadedByName && order.loadedByName.toLowerCase().includes(staffName)) ||
            (order.processedByName && order.processedByName.toLowerCase().includes(staffName))
          ));

        if (!matched) return false;
      }

      // Channel / Route filter
      if (selectedChannel !== 'all') {
        if (selectedChannel === 'pickup' && order.type !== 'pickup') return false;
        if (selectedChannel === 'delivery' && order.type !== 'delivery') return false;
        if (selectedChannel.startsWith('route-') && order.routeId !== selectedChannel.replace('route-', '')) return false;
      }

      // Status filter
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'pending' && !['pending', 'accepted'].includes(order.status)) return false;
        if (selectedStatus === 'processing' && order.status !== 'processing') return false;
        if (selectedStatus === 'ready' && order.status !== 'ready') return false;
        if (selectedStatus === 'shipped' && order.status !== 'shipped') return false;
        if (selectedStatus === 'delivered' && !['delivered', 'completed'].includes(order.status)) return false;
      }

      // Returns filter
      if (selectedReturnFilter === 'with_returns' && !hasReturns) return false;
      if (selectedReturnFilter === 'no_returns' && hasReturns) return false;

      // Punctuality filter
      if (selectedPunctualityFilter === 'on_time' && punctuality.status !== 'on_time') return false;
      if (selectedPunctualityFilter === 'delayed' && !['delayed', 'overdue_in_transit'].includes(punctuality.status)) return false;

      // Date filter
      if (customDate) {
        const targetDate = new Date(customDate + 'T00:00:00');
        const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
        if (orderDate < targetDate || orderDate >= nextDay) return false;
      } else if (selectedDateRange === 'today') {
        if (orderDate < startOfToday) return false;
      } else if (selectedDateRange === 'yesterday') {
        if (orderDate < startOfYesterday || orderDate >= startOfToday) return false;
      } else if (selectedDateRange === 'week') {
        if (orderDate < startOfWeek) return false;
      } else if (selectedDateRange === 'month') {
        if (orderDate < startOfMonth) return false;
      }

      return true;
    }).sort((a, b) => {
      const dateA = toJsDate(a.createdAt)?.getTime() || 0;
      const dateB = toJsDate(b.createdAt)?.getTime() || 0;
      return dateB - dateA;
    });
  }, [orders, searchTerm, selectedStaff, selectedChannel, selectedStatus, selectedReturnFilter, selectedPunctualityFilter, selectedDateRange, customDate, routeMap, staffList, returnsByOrderId]);

  // Overall metrics summary
  const metrics = useMemo(() => {
    let delivered = 0;
    let inProgress = 0;
    let returnsCount = 0;
    let onTimeCount = 0;
    let delayedCount = 0;

    orders.forEach(o => {
      const orderReturns = returnsByOrderId.get(o.id) || [];
      const hasReturns = !!o.hasReturns || (o.returnedItems && o.returnedItems.length > 0) || orderReturns.length > 0;
      if (hasReturns) returnsCount++;

      const p = evaluatePunctuality(o);
      if (p.status === 'on_time') onTimeCount++;
      if (p.status === 'delayed' || p.status === 'overdue_in_transit') delayedCount++;

      if (['delivered', 'completed'].includes(o.status)) delivered++;
      else inProgress++;
    });

    return {
      total: orders.length,
      delivered,
      inProgress,
      returnsCount,
      onTimeCount,
      delayedCount
    };
  }, [orders, returnsByOrderId]);

  // Routes with container vales (for backward compatibility)
  const jabaRoutes = useMemo(() => {
    return routes.filter(r => r.containerVale && ((r.containerVale.jvOut || 0) + (r.containerVale.jnOut || 0) > 0));
  }, [routes]);

  // Filtered container movements (source of truth from Karey module)
  const filteredMovements = useMemo(() => {
    return containerMovements.filter(m => {
      const shortage = (m.jvShortage || 0) + (m.jnShortage || 0);
      if (jabaFilterStatus === 'shortage' && shortage <= 0 && m.status !== 'pantano') return false;
      if (jabaFilterStatus === 'reconciled' && m.status !== 'completed') return false;
      if (jabaFilterStatus === 'open' && m.status !== 'active' && m.status !== 'loading' && m.status !== 'pantano') return false;

      if (jabaSearchTerm.trim()) {
        const term = jabaSearchTerm.toLowerCase();
        const folio = (m.folio || '').toLowerCase();
        const unit = (m.unitNumber || '').toLowerCase();
        const driver = (m.driverName || '').toLowerCase();
        const reg = (m.registeredByName || '').toLowerCase();
        const rec = (m.reconciledByName || '').toLowerCase();

        if (!folio.includes(term) && !unit.includes(term) && !driver.includes(term) && !reg.includes(term) && !rec.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }, [containerMovements, jabaFilterStatus, jabaSearchTerm]);

  const jabaMetrics = useMemo(() => {
    let totalOut = 0;
    let totalReturned = 0;
    let totalShortage = 0;
    let totalDebt = 0;
    let shortageCount = 0;

    // From ContainerMovements (Karey Module)
    containerMovements.forEach(m => {
      totalOut += (m.jvOut || 0) + (m.jnOut || 0);
      totalReturned += (m.jvIn || 0) + (m.jnIn || 0);
      const shortage = (m.jvShortage || 0) + (m.jnShortage || 0);
      if (shortage > 0) {
        totalShortage += shortage;
        totalDebt += (m.payrollDeductionAmount || 0);
        shortageCount++;
      }
    });

    // Plus route container vales if any not in movements
    if (containerMovements.length === 0) {
      jabaRoutes.forEach(r => {
        const vale = r.containerVale;
        if (vale) {
          const qOut = (vale.jvOut || 0) + (vale.jnOut || 0);
          totalOut += qOut;
        }
      });
    }

    return {
      totalVales: containerMovements.length > 0 ? containerMovements.length : jabaRoutes.length,
      totalOut,
      totalReturned,
      totalShortage,
      totalDebt,
      shortageCount
    };
  }, [containerMovements, jabaRoutes]);

  const hasActiveFilters = 
    searchTerm !== '' || 
    selectedStaff !== 'all' || 
    selectedChannel !== 'all' || 
    selectedDateRange !== 'all' || 
    customDate !== '' || 
    selectedStatus !== 'all' ||
    selectedReturnFilter !== 'all' ||
    selectedPunctualityFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedStaff('all');
    setSelectedChannel('all');
    setSelectedDateRange('all');
    setCustomDate('');
    setSelectedStatus('all');
    setSelectedReturnFilter('all');
    setSelectedPunctualityFilter('all');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-24 max-w-7xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-2xl transition-colors shadow-sm"
            title="Volver al Panel"
          >
            <ChevronRight className="w-5 h-5 text-gray-700 rotate-180" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              Supervisión de Actividad y Logística
            </h2>
            <p className="text-xs text-gray-500">Trazabilidad completa por pedido, control de vales de jabas retornables y métricas operativas</p>
          </div>
        </div>

        {/* Top Tab Selector */}
        <div className="flex items-center bg-gray-100/80 p-1 rounded-2xl border border-gray-200 self-start sm:self-auto">
          <button
            onClick={() => setActiveMainTab('orders')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              activeMainTab === 'orders' 
                ? "bg-white text-indigo-700 shadow-sm" 
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Activity className="w-4 h-4" />
            <span>Trazabilidad de Pedidos ({metrics.total})</span>
          </button>
          <button
            onClick={() => setActiveMainTab('jabas')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              activeMainTab === 'jabas' 
                ? "bg-white text-amber-800 shadow-sm" 
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Box className="w-4 h-4 text-amber-600" />
            <span>Vales de Jabas {jabaMetrics.shortageCount > 0 && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.2 rounded-full">{jabaMetrics.shortageCount}</span>}</span>
          </button>
        </div>
      </div>

      {activeMainTab === 'orders' ? (
        <>
          {/* Summary metrics header */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-100 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Pedidos</span>
              <span className="text-xl font-black text-gray-900">{metrics.total}</span>
            </div>
            <div className="bg-white border border-emerald-100 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-emerald-600 block">Entregas a Tiempo</span>
              <span className="text-xl font-black text-emerald-700">{metrics.onTimeCount}</span>
            </div>
            <div className="bg-white border border-red-100 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-red-500 block">Con Retraso</span>
              <span className="text-xl font-black text-red-600">{metrics.delayedCount}</span>
            </div>
            <div className="bg-white border border-amber-100 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-amber-600 block">Con Devolución</span>
              <span className="text-xl font-black text-amber-700">{metrics.returnsCount}</span>
            </div>
          </div>

          {/* Unified Filter Panel */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">Filtros de Supervisión</span>
              </div>
              {hasActiveFilters && (
                <button 
                  onClick={clearFilters}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-xl transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Search input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por folio (#1234), cliente, producto ordenado, teléfono, dirección o ruta..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-medium text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* Dropdowns row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {/* Employee Filter */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Colaborador
                </label>
                <select
                  value={selectedStaff}
                  onChange={(e) => setSelectedStaff(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2 text-xs font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Todos los colaboradores</option>
                  {staffList.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name} {staff.role ? `(${staff.role})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Route / Channel Filter */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Canal / Ruta
                </label>
                <select
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2 text-xs font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Todos los canales</option>
                  <option value="pickup">En Tienda / Pick-up</option>
                  <option value="delivery">A Domicilio (Todas)</option>
                  {routes.map(r => (
                    <option key={r.id} value={`route-${r.id}`}>
                      Ruta: {r.name} (Unidad {r.unitNumber || 'S/N'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Período
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={customDate ? 'custom' : selectedDateRange}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        // keep custom
                      } else {
                        setCustomDate('');
                        setSelectedDateRange(e.target.value as any);
                      }
                    }}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-2 py-2 text-xs font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Todo el historial</option>
                    <option value="today">Hoy</option>
                    <option value="yesterday">Ayer</option>
                    <option value="week">Últimos 7 días</option>
                    <option value="month">Últimos 30 días</option>
                    {customDate && <option value="custom">Fecha exacta</option>}
                  </select>
                  <input 
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-8 bg-gray-50 border border-gray-200 rounded-xl px-1 py-1 text-xs text-gray-700 outline-none cursor-pointer"
                    title="Seleccionar fecha específica"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Estado
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2 text-xs font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Todos los estados</option>
                  <option value="pending">Pendiente Despacho</option>
                  <option value="processing">En Preparación</option>
                  <option value="ready">Listo para Entrega</option>
                  <option value="shipped">En Ruta con Chofer</option>
                  <option value="delivered">Entregado</option>
                </select>
              </div>

              {/* Returns Filter */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Devoluciones
                </label>
                <select
                  value={selectedReturnFilter}
                  onChange={(e) => setSelectedReturnFilter(e.target.value as any)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2 text-xs font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Todas las órdenes</option>
                  <option value="with_returns">⚠️ Con Devolución</option>
                  <option value="no_returns">✅ Sin Devolución</option>
                </select>
              </div>

              {/* Punctuality Filter */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Puntualidad
                </label>
                <select
                  value={selectedPunctualityFilter}
                  onChange={(e) => setSelectedPunctualityFilter(e.target.value as any)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2 text-xs font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">Todos los tiempos</option>
                  <option value="on_time">🟢 A Tiempo</option>
                  <option value="delayed">🔴 Con Retraso</option>
                </select>
              </div>
            </div>
          </div>

          {/* Orders Consolidated List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-bold text-gray-500">
                Mostrando <strong className="text-gray-900">{filteredOrders.length}</strong> {filteredOrders.length === 1 ? 'pedido auditado' : 'pedidos auditados'}
              </p>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl border border-dashed border-gray-200 text-center space-y-3">
                <FileText className="w-12 h-12 text-gray-300 mx-auto" />
                <p className="text-sm font-bold text-gray-700">No se encontraron pedidos con estos criterios</p>
                <p className="text-xs text-gray-400">Intenta ajustando los filtros de colaborador, fecha, devoluciones o búsqueda.</p>
                {hasActiveFilters && (
                  <button 
                    onClick={clearFilters}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
                  >
                    Limpiar todos los filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map(order => {
                  const isExpanded = expandedOrderId === order.id;
                  const route = order.routeId ? routeMap.get(order.routeId) : null;
                  const driver = order.driverId ? userMap.get(order.driverId) : null;

                  // Step status determinations
                  const isDispatched = !!(order.dispatchedAt || order.dispatchedBy || order.status !== 'pending');
                  const isPrepared = !!(order.preparedAt || order.preparedBy || ['ready', 'shipped', 'delivered', 'completed'].includes(order.status));
                  const isLoaded = !!(order.loadedAt || order.loadedBy || order.onboarded || ['shipped', 'delivered', 'completed'].includes(order.status));
                  const isPaid = order.paymentStatus === 'paid' || !!order.paidAt;
                  const isDelivered = ['delivered', 'completed'].includes(order.status) || !!order.deliveredAt;

                  const dispatcherName = order.dispatchedByName || (order.dispatchedBy ? userMap.get(order.dispatchedBy)?.name : null) || (isDispatched ? 'Despachador' : null);
                  const preparerName = order.preparedByName || (order.preparedBy ? userMap.get(order.preparedBy)?.name : null) || (isPrepared ? 'Preparador' : null);
                  const loaderName = order.loadedByName || (order.loadedBy ? userMap.get(order.loadedBy)?.name : null) || (isLoaded ? 'Cargador' : null);
                  const cashierName = order.processedByName || (order.processedBy ? userMap.get(order.processedBy)?.name : null) || (isPaid && order.paymentMethod !== 'online' ? 'Cajero' : null);
                  const driverName = driver?.name || (order.driverId ? 'Chófer asignado' : null);

                  // Returns data
                  const orderReturns = returnsByOrderId.get(order.id) || [];
                  const hasReturns = !!order.hasReturns || (order.returnedItems && order.returnedItems.length > 0) || orderReturns.length > 0;
                  const allReturnedItems = [
                    ...(order.returnedItems || []),
                    ...orderReturns.flatMap(r => r.items || [])
                  ];
                  const totalReturnReduction = orderReturns.reduce((sum, r) => sum + (r.totalReduction || 0), 0) || (order.discount || 0);

                  // Punctuality data
                  const punctuality = evaluatePunctuality(order);

                  // Total items and weights summary
                  const totalItemsCount = order.items?.reduce((acc, i) => acc + (i.quantity || 1), 0) || 0;
                  const totalPreparerWeight = order.items?.reduce((acc, i) => acc + (i.preparerWeight || 0), 0) || 0;
                  const hasJabas = order.items?.some(i => i.packaging === 'jaba');

                  return (
                    <div 
                      key={order.id}
                      className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden hover:border-indigo-200 transition-all"
                    >
                      {/* Main Card Header */}
                      <div className="p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-50">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0",
                              order.type === 'delivery' ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-purple-50 text-purple-600 border border-purple-100"
                            )}>
                              {order.type === 'delivery' ? <Truck className="w-5 h-5" /> : <Store className="w-5 h-5" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-gray-900">
                                  Pedido #{order.id.slice(-6).toUpperCase()}
                                </span>
                                <span className="text-gray-300 font-light">•</span>
                                <span className="text-xs font-bold text-indigo-700">
                                  {order.userName}
                                </span>
                                {hasJabas && (
                                  <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black px-1.5 py-0.2 rounded-md flex items-center gap-1">
                                    <Box className="w-2.5 h-2.5" />
                                    Jaba
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                                <Calendar className="w-3 h-3" />
                                <span>{formatDateTime(order.createdAt)}</span>
                                {order.address && order.type === 'delivery' && (
                                  <>
                                    <span className="text-gray-300">•</span>
                                    <span className="truncate max-w-[200px] text-gray-500">{order.address}</span>
                                  </>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Status Badges, Punctuality & Returns indicators */}
                          <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                            {/* Punctuality Badge */}
                            <div 
                              className={cn("flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-xl border", punctuality.badgeClass)}
                              title={punctuality.detail}
                            >
                              <Timer className="w-3 h-3" />
                              <span>{punctuality.label}</span>
                            </div>

                            {/* Returns Badge */}
                            {hasReturns ? (
                              <div className="flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-xl">
                                <RotateCcw className="w-3 h-3 text-amber-600" />
                                <span>Con Devolución</span>
                              </div>
                            ) : (
                              <div className="hidden sm:flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50/70 border border-emerald-100 px-2 py-0.5 rounded-xl">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                <span>Sin devoluciones</span>
                              </div>
                            )}

                            {route && (
                              <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-xl border border-indigo-100">
                                <Truck className="w-3 h-3" />
                                {route.name} (Unidad {route.unitNumber})
                              </span>
                            )}

                            <span className={cn(
                              "text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-xl",
                              order.status === 'delivered' || order.status === 'completed' ? "bg-emerald-100 text-emerald-800" :
                              order.status === 'shipped' ? "bg-blue-100 text-blue-800" :
                              order.status === 'ready' ? "bg-purple-100 text-purple-800" :
                              order.status === 'processing' ? "bg-amber-100 text-amber-800" :
                              "bg-gray-100 text-gray-700"
                            )}>
                              {order.status === 'delivered' || order.status === 'completed' ? 'Entregado' :
                               order.status === 'shipped' ? 'En Ruta' :
                               order.status === 'ready' ? 'Listo' :
                               order.status === 'processing' ? 'En Prep' : 'Pendiente'}
                            </span>

                            <span className="text-sm font-black text-gray-900 bg-gray-50 px-3 py-1 rounded-xl border border-gray-100">
                              ${(order.adjustedTotal ?? order.total).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* Consolidated Pipeline Flow (Exact representation requested) */}
                        <div className="mt-3.5 bg-gradient-to-r from-gray-50 to-indigo-50/30 p-3.5 rounded-2xl border border-gray-100 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-800 leading-relaxed font-medium">
                            <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded-lg border border-gray-200 text-[11px]">
                              Pedido #{order.id.slice(-6).toUpperCase()} de {order.userName}
                            </span>
                            <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span className="text-blue-800 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100 text-[11px]">
                              despachado por <strong>{dispatcherName || 'Pendiente'}</strong>{order.dispatchedAt ? ` (${formatTime(order.dispatchedAt)})` : ''}
                            </span>
                            <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span className="text-purple-800 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-100 text-[11px]">
                              preparado por <strong>{preparerName || 'Pendiente'}</strong>{order.preparedAt ? ` (${formatTime(order.preparedAt)})` : ''}
                            </span>
                            {order.type === 'delivery' && (
                              <>
                                <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
                                <span className="text-orange-800 bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-100 text-[11px]">
                                  cargado por <strong>{loaderName || 'Pendiente'}</strong>{order.loadedAt ? ` (${formatTime(order.loadedAt)})` : ''}
                                </span>
                              </>
                            )}
                            <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span className="text-green-800 bg-green-50 px-2 py-0.5 rounded-lg border border-green-100 text-[11px]">
                              entregado por <strong>{driverName || (order.type === 'pickup' ? 'Tienda' : 'Asignado')}</strong>{order.deliveredAt ? ` (${formatTime(order.deliveredAt)})` : ''}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-200/50">
                            <span>⏱ {punctuality.detail}</span>
                            {route && <span>Ruta: <strong>{route.name}</strong> (Unidad #{route.unitNumber})</span>}
                          </div>
                        </div>

                        {/* Expand Button */}
                        <button
                          onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                          className="w-full mt-3 pt-2.5 border-t border-gray-50 flex items-center justify-between text-xs font-semibold text-gray-500 hover:text-indigo-600 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span>{isExpanded ? 'Ocultar detalle de pedido y devoluciones' : `Ver detalle del pedido (${order.items?.length || 0} productos)${hasReturns ? ' · ⚠️ Tiene Devolución' : ''}`}</span>
                          </div>
                          <ChevronDown className={cn("w-4 h-4 transition-transform", isExpanded ? "rotate-180 text-indigo-600" : "")} />
                        </button>
                      </div>

                      {/* Expanded details section */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-gray-50/70 border-t border-gray-100 p-4 sm:p-5 space-y-4"
                          >
                            {/* 1. What the customer ordered */}
                            <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                  <ShoppingBag className="w-4 h-4 text-indigo-600" />
                                  Artículos Ordenados ({order.items.length} productos distintos · {totalItemsCount} unidades/kg)
                                </h4>
                                {totalPreparerWeight > 0 && (
                                  <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                                    <Scale className="w-3 h-3 text-purple-600" />
                                    Peso total verificado: <strong>{totalPreparerWeight.toFixed(2)} kg</strong>
                                  </span>
                                )}
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase text-[10px]">
                                      <th className="pb-2 font-bold">Producto</th>
                                      <th className="pb-2 font-bold text-center">Cant.</th>
                                      <th className="pb-2 font-bold text-center">Empaque</th>
                                      <th className="pb-2 font-bold text-right">Precio</th>
                                      <th className="pb-2 font-bold text-center">Peso Prep.</th>
                                      <th className="pb-2 font-bold text-center">Peso Carga</th>
                                      <th className="pb-2 font-bold text-right">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                    {order.items.map((item, idx) => {
                                      const weight = item.loaderWeight || item.preparerWeight;
                                      const itemSubtotal = item.unit === 'Kg'
                                        ? (item.price * (weight || (item.approxWeight ? item.approxWeight * item.quantity : item.quantity)))
                                        : (item.price * item.quantity);
                                      return (
                                        <tr key={idx} className="hover:bg-gray-50/50">
                                          <td className="py-2.5 pr-2 font-semibold text-gray-900">
                                            {item.name}
                                            {item.unit === 'Kg' && item.approxWeight && (
                                              <span className="text-[10px] text-gray-400 font-normal block">
                                                ({item.approxWeight} Kg/pieza aprox.)
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2.5 px-2 text-center font-bold text-gray-800">
                                            {item.quantity} {item.unit || 'Pza'}
                                          </td>
                                          <td className="py-2.5 px-2 text-center">
                                            <span className={cn(
                                              "text-[9px] px-2 py-0.5 rounded-full font-bold uppercase",
                                              item.packaging === 'jaba_negra'
                                                ? "bg-gray-900 text-white border border-gray-800"
                                                : (item.packaging === 'jaba_verde' || item.packaging === 'jaba')
                                                ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                                : "bg-blue-50 text-blue-700 border border-blue-100"
                                            )}>
                                              {item.packaging === 'jaba_negra' ? '⚫ Jaba Negra' : (item.packaging === 'jaba_verde' || item.packaging === 'jaba') ? '🟢 Jaba Verde' : '🛍️ Bolsa'}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-2 text-right text-gray-600">
                                            ${item.price.toFixed(2)}{item.unit === 'Kg' ? '/Kg' : ''}
                                          </td>
                                          <td className="py-2.5 px-2 text-center text-purple-700 font-medium">
                                            {item.preparerWeight ? `${item.preparerWeight.toFixed(2)} kg` : <span className="text-gray-300">-</span>}
                                          </td>
                                          <td className="py-2.5 px-2 text-center text-orange-700 font-medium">
                                            {item.loaderWeight ? `${item.loaderWeight.toFixed(2)} kg` : <span className="text-gray-300">-</span>}
                                          </td>
                                          <td className="py-2.5 pl-2 text-right font-black text-gray-900">
                                            ${itemSubtotal.toFixed(2)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs font-semibold">
                                <span className="text-gray-500">Total Liquidado del Pedido:</span>
                                <span className="text-sm font-black text-gray-900">${(order.adjustedTotal ?? order.total).toFixed(2)}</span>
                              </div>
                            </div>

                            {/* 2. Devoluciones / Retornos */}
                            {hasReturns ? (
                              <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                    <RotateCcw className="w-4 h-4 text-amber-700" />
                                    Devoluciones Registradas en este Pedido
                                  </h4>
                                  {totalReturnReduction > 0 && (
                                    <span className="text-xs font-bold text-amber-800 bg-amber-100/80 px-2.5 py-1 rounded-xl">
                                      Monto Afectado / Descuento: -${totalReturnReduction.toFixed(2)}
                                    </span>
                                  )}
                                </div>

                                <div className="space-y-2">
                                  {allReturnedItems.map((retItem, rIdx) => (
                                    <div key={rIdx} className="bg-white p-3 rounded-xl border border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-gray-900">{retItem.name}</span>
                                          <span className="bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded-md text-[10px]">
                                            Devuelto: {retItem.quantity} {retItem.unit || 'pzs'}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-amber-800 mt-1">
                                          <strong>Motivo:</strong> {(retItem as any).reason || 'Merma / Inconformidad del cliente'}
                                        </p>
                                      </div>

                                      <div className="text-right shrink-0">
                                        <span className="font-black text-red-600 block">
                                          -${((retItem.price || 0) * (retItem.quantity || 1)).toFixed(2)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}

                                  {orderReturns.map((rDoc) => (
                                    <div key={rDoc.id} className="text-[11px] text-amber-900 bg-amber-100/40 p-2.5 rounded-xl flex items-center justify-between">
                                      <span>
                                        <strong>Resolución:</strong> {rDoc.resolution === 'stock' ? 'Reingresado a inventario' : rDoc.resolution === 'waste' ? 'Descartado como Merma' : 'Pendiente de resolución'}
                                      </span>
                                      <span className="font-medium text-amber-700">
                                        Estado: {rDoc.status === 'approved' ? 'Aprobada' : rDoc.status === 'rejected' ? 'Rechazada' : 'En revisión'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="bg-emerald-50/60 border border-emerald-100 p-3 rounded-2xl flex items-center justify-between text-xs text-emerald-800">
                                <span className="flex items-center gap-1.5 font-medium">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  Pedido sin devoluciones ni mermas reportadas. Entrega 100% conforme.
                                </span>
                                <span className="text-[10px] font-bold text-emerald-700 uppercase">Sin reclamos</span>
                              </div>
                            )}

                            {/* 3. Punctuality and Delivery Audit */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div className="bg-white p-3.5 rounded-2xl border border-gray-100 space-y-2">
                                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                                  Auditoría de Tiempo y Puntualidad
                                </h4>
                                <div className="space-y-1.5 text-gray-600 text-[11px]">
                                  <p className="flex items-center justify-between">
                                    <span>Ventana acordada:</span>
                                    <strong className="text-gray-900">{order.deliverySlot || 'Inmediata / Sin franja fija'}</strong>
                                  </p>
                                  <p className="flex items-center justify-between">
                                    <span>Hora de pedido:</span>
                                    <span>{formatDateTime(order.createdAt)}</span>
                                  </p>
                                  <p className="flex items-center justify-between">
                                    <span>Hora de despacho:</span>
                                    <span>{order.dispatchedAt ? formatDateTime(order.dispatchedAt) : 'Pendiente'}</span>
                                  </p>
                                  <p className="flex items-center justify-between">
                                    <span>Hora de entrega final:</span>
                                    <strong className={isDelivered ? "text-emerald-700" : "text-gray-400"}>
                                      {order.deliveredAt ? formatDateTime(order.deliveredAt) : (isDelivered ? 'Entregado' : 'Aún en proceso')}
                                    </strong>
                                  </p>
                                  <div className="pt-2 border-t border-gray-50 flex items-center justify-between">
                                    <span className="font-bold text-gray-900">Resultado:</span>
                                    <span className={cn("px-2 py-0.5 rounded-lg font-bold text-[10px]", punctuality.badgeClass)}>
                                      {punctuality.label}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-white p-3.5 rounded-2xl border border-gray-100 space-y-2">
                                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                  <Activity className="w-3.5 h-3.5 text-indigo-600" />
                                  Datos del Cliente y Logística
                                </h4>
                                <div className="space-y-1.5 text-gray-600 text-[11px]">
                                  <p><strong>Cliente:</strong> {order.userName} ({order.userEmail || 'Sin correo'})</p>
                                  {order.userPhone && <p><strong>Teléfono:</strong> {order.userPhone}</p>}
                                  {order.address && <p><strong>Dirección:</strong> {order.address}</p>}
                                  {order.notes && <p className="text-amber-800 bg-amber-50/70 p-1.5 rounded-lg"><strong>Nota:</strong> {order.notes}</p>}
                                  {route && (
                                    <p>
                                      <strong>Ruta asignada:</strong> {route.name} (Unidad #{route.unitNumber || 'S/N'})
                                      {route.assignedByName ? ` · Despachada por ${route.assignedByName}` : ''}
                                    </p>
                                  )}
                                  {driver && <p><strong>Repartidor a cargo:</strong> {driver.name} ({driver.email})</p>}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Vales de Jabas View Tab */
        <div className="space-y-6">
          {/* Metrics summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-100 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Jabas Salientes</span>
              <span className="text-xl font-black text-amber-700">{jabaMetrics.totalOut}</span>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Jabas Regresadas</span>
              <span className="text-xl font-black text-emerald-700">{jabaMetrics.totalReturned}</span>
            </div>
            <div className="bg-white border border-red-100 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-red-500 block">Faltante Total</span>
              <span className="text-xl font-black text-red-600">{jabaMetrics.totalShortage} jabas</span>
            </div>
            <div className="bg-white border border-red-100 rounded-2xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-red-500 block">Adeudo Acumulado Choferes</span>
              <span className="text-xl font-black text-red-700">${jabaMetrics.totalDebt.toFixed(2)} MXN</span>
            </div>
          </div>

          {/* Filter Bar for Jabas */}
          <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                value={jabaSearchTerm}
                onChange={(e) => setJabaSearchTerm(e.target.value)}
                placeholder="Buscar por ruta, chofer, unidad o cargador..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-gray-500">Filtrar:</span>
              <select
                value={jabaFilterStatus}
                onChange={(e) => setJabaFilterStatus(e.target.value as any)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">Todos los vales ({containerMovements.length > 0 ? containerMovements.length : jabaRoutes.length})</option>
                <option value="shortage">⚠️ Con Faltante / Adeudo / Pantano</option>
                <option value="reconciled">✅ Conciliados / Completados</option>
                <option value="open">🚚 Abiertos en Ruta / Pantano</option>
              </select>
            </div>
          </div>

          {/* List of Jaba Vales */}
          {filteredMovements.length === 0 && jabaRoutes.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-dashed border-gray-200 text-center space-y-3">
              <Box className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="text-sm font-bold text-gray-700">No hay vales de jabas con estos criterios</p>
              <p className="text-xs text-gray-400">Los vales se registran por el empleado de Inventario Karey al despachar y recibir unidades.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMovements.map(mov => {
                const totalOut = (mov.jvOut || 0) + (mov.jnOut || 0);
                const totalIn = (mov.jvIn || 0) + (mov.jnIn || 0);
                const totalShortage = (mov.jvShortage || 0) + (mov.jnShortage || 0);
                const isShortage = totalShortage > 0;
                const isPantano = mov.status === 'pantano';
                const isCompleted = mov.status === 'completed';

                return (
                  <div 
                    key={mov.id}
                    className={cn(
                      "bg-white rounded-3xl border p-5 shadow-sm space-y-3.5 transition-all",
                      isPantano ? "border-rose-300 bg-rose-50/20" :
                      isShortage ? "border-red-200 bg-red-50/20" :
                      isCompleted ? "border-emerald-200 bg-emerald-50/10" :
                      "border-amber-200 bg-amber-50/10"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-gray-900 text-sm font-mono">{mov.folio}</h4>
                          <span className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md font-bold">
                            Unidad #{mov.unitNumber}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">
                          <strong>Chofer:</strong> {mov.driverName}
                        </p>
                        {mov.routeName && (
                          <p className="text-[11px] text-gray-400">
                            Ruta: {mov.routeName}
                          </p>
                        )}
                      </div>

                      <span className={cn(
                        "text-[10px] font-black uppercase px-2.5 py-1 rounded-xl",
                        isPantano ? "bg-rose-100 text-rose-800 border border-rose-200" :
                        isShortage ? "bg-red-100 text-red-800 border border-red-200" :
                        isCompleted ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                        "bg-amber-100 text-amber-800 border border-amber-200"
                      )}>
                        {isPantano ? '⚠️ PANTANO' :
                         isShortage ? `Faltante (${totalShortage})` :
                         isCompleted ? 'Conciliado OK' : 'En Ruta (Abierto)'}
                      </span>
                    </div>

                    {/* Quantities output vs returned */}
                    <div className="grid grid-cols-2 gap-3 p-3 bg-white rounded-2xl border border-gray-100 text-xs">
                      <div>
                        <span className="text-gray-400 text-[10px] uppercase font-bold block">Salida:</span>
                        <span className="text-base font-black text-amber-900">{totalOut} Jabas</span>
                        <div className="flex gap-1.5 my-1">
                          <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                            JV: {mov.jvOut || 0}
                          </span>
                          <span className="bg-gray-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                            JN: {mov.jnOut || 0}
                          </span>
                        </div>
                        {mov.registeredByName && (
                          <span className="text-[10px] text-gray-500 block">Registró: <strong>{mov.registeredByName}</strong></span>
                        )}
                        <span className="text-[9px] text-gray-400 block">{formatDateTime(mov.exitTime || mov.createdAt)}</span>
                      </div>

                      <div>
                        <span className="text-gray-400 text-[10px] uppercase font-bold block">Retorno Físico:</span>
                        <span className="text-base font-black text-gray-900">
                          {mov.entryTime ? `${totalIn} Jabas` : isPantano ? 'Cerrado en Pantano' : 'Pendiente'}
                        </span>
                        {mov.entryTime && (
                          <div className="flex gap-1.5 my-1">
                            <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                              JV: {mov.jvIn || 0}
                            </span>
                            <span className="bg-gray-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                              JN: {mov.jnIn || 0}
                            </span>
                          </div>
                        )}
                        {mov.reconciledByName && (
                          <span className="text-[10px] text-gray-500 block">Recibió: <strong>{mov.reconciledByName}</strong></span>
                        )}
                        {mov.entryTime && (
                          <span className="text-[9px] text-gray-400 block">{formatDateTime(mov.entryTime)}</span>
                        )}
                      </div>
                    </div>

                    {/* Shortage calculation and debt notice */}
                    {isShortage && (
                      <div className="p-3 bg-red-100/80 rounded-2xl border border-red-200 text-red-900 text-xs space-y-1">
                        <div className="flex justify-between font-bold">
                          <span className="flex items-center gap-1 text-red-800">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Faltan {totalShortage} jabas ({mov.jvShortage || 0} JV / {mov.jnShortage || 0} JN)
                          </span>
                          <span className="font-black text-sm text-red-900">
                            -${(mov.payrollDeductionAmount || 0).toFixed(2)} MXN
                          </span>
                        </div>
                        <p className="text-[10px] text-red-700">
                          Faltante registrado para descuento en nómina del chofer.
                        </p>
                      </div>
                    )}

                    {mov.notes && (
                      <div className="text-[11px] text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                        <strong>Notas:</strong> {mov.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
