import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, ShieldCheck, ChevronRight, Calendar, Package, AlertTriangle, Tags, Settings, ClipboardList, Truck, Activity, Box, Users, DollarSign, ShoppingBag, Boxes, UserCheck, Factory, ArrowDownToLine } from 'lucide-react';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { Order, UserProfile } from '../../types';

export function AdminDashboard({ 
  orders, 
  users, 
  currentUserId,
  selectedDate,
  onDateChange,
  onStatClick, 
  onUsersClick,
  onInventoryTrackingClick,
  onReturnsClick,
  onDriverRouteClick,
  onActivityClick,
  onUnitsClick,
  onKareyControlClick,
  onSettingsClick,
  onCategoriesClick,
  onRefresh
}: { 
  orders: Order[]; 
  users: UserProfile[]; 
  currentUserId: string;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onStatClick: (status: Order['status'] | 'all') => void;
  onUsersClick: () => void;
  onInventoryTrackingClick: (p: 'day' | 'week' | 'month' | 'year', tab?: 'management' | 'sold' | 'waste' | 'entries' | 'suppliers') => void;
  onReturnsClick: () => void;
  onDriverRouteClick: () => void;
  onActivityClick?: () => void;
  onUnitsClick?: () => void;
  onKareyControlClick?: () => void;
  onSettingsClick: () => void;
  onProductsClick?: () => void;
  onCategoriesClick: () => void;
  onRefresh?: () => void;
}) {
  const [showStatuses, setShowStatuses] = useState(false);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');

  const { startOfPeriod, endOfPeriod } = useMemo(() => {
    const anchorDate = new Date(selectedDate + 'T00:00:00');
    const start = new Date(anchorDate);
    const end = new Date(anchorDate);

    if (period === 'week') {
      start.setDate(anchorDate.getDate() - anchorDate.getDay());
      start.setHours(0,0,0,0);
      end.setDate(start.getDate() + 6);
      end.setHours(23,59,59,999);
    } else if (period === 'month') {
      start.setDate(1);
      start.setHours(0,0,0,0);
      end.setMonth(start.getMonth() + 1, 0);
      end.setHours(23,59,59,999);
    } else if (period === 'year') {
      start.setMonth(0, 1);
      start.setHours(0,0,0,0);
      end.setFullYear(start.getFullYear(), 11, 31);
      end.setHours(23,59,59,999);
    }
    return { startOfPeriod: start, endOfPeriod: end };
  }, [selectedDate, period]);

  const stats = useMemo(() => {
    const s = {
      pending: 0,
      processing: 0,
      ready: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      totalRevenue: 0,
      totalOrders: 0,
      totalVolumeMoved: 0,
      uniqueClients: 0
    };

    const filteredOrders = orders.filter(o => {
      if (!o.createdAt) return false;
      const orderDate = new Date(o.createdAt.seconds * 1000);
      
      if (period === 'day') {
        return orderDate.toISOString().split('T')[0] === selectedDate;
      } else {
        return orderDate >= startOfPeriod && orderDate <= endOfPeriod;
      }
    });

    s.totalOrders = filteredOrders.length;
    const clientSet = new Set<string>();

    filteredOrders.forEach(o => {
      if (o.userId || o.userEmail || o.userName) {
        clientSet.add(o.userId || o.userEmail || o.userName);
      }
      if (o.status === 'pending') s.pending++;
      else if (o.status === 'processing') s.processing++;
      else if (o.status === 'ready') s.ready++;
      else if (o.status === 'shipped') s.shipped++;
      else if (o.status === 'delivered' || o.status === 'completed') {
        s.delivered++;
        s.totalRevenue += (o.adjustedTotal ?? o.total);
      }
      else if (o.status === 'cancelled') s.cancelled++;

      if (o.status !== 'cancelled') {
        o.items?.forEach(item => {
          s.totalVolumeMoved += Number(item.quantity) || 0;
        });
      }
    });

    s.uniqueClients = clientSet.size;
    return s;
  }, [orders, selectedDate, period, startOfPeriod, endOfPeriod]);

  const assignedOrdersCount = useMemo(() => {
    return orders.filter(o => o.driverId === currentUserId && o.status === 'shipped').length;
  }, [orders, currentUserId]);

  const todayIso = new Date().toISOString().split('T')[0];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      {/* Top Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Panel de Administración</h2>
          <p className="text-xs text-gray-400 font-medium">Control operativo, métricas en tiempo real y catálogo</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onRefresh} className="flex items-center gap-2 h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl border border-gray-200/60 shadow-xs">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Actualizar</span>
          </Button>
        </div>
      </div>

      {/* 1. Barra Superior de Filtros Rápida */}
      <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Selector de Periodo */}
        <div className="flex items-center gap-1.5">
          <div className="bg-gray-100/90 p-1 rounded-xl flex">
            {[
              { id: 'day', label: 'Hoy' },
              { id: 'week', label: 'Semana' },
              { id: 'month', label: 'Mes' },
              { id: 'year', label: 'Año' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id as 'day' | 'week' | 'month' | 'year')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                  period === p.id 
                    ? "bg-white text-blue-600 shadow-xs font-black" 
                    : "text-gray-500 hover:text-gray-900"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {selectedDate !== todayIso && (
            <button
              onClick={() => onDateChange(todayIso)}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-xl transition-colors shrink-0"
              title="Restablecer a fecha de hoy"
            >
              Ir a Hoy
            </button>
          )}
        </div>

        {/* DatePicker compacto & Rango */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {period !== 'day' && (
            <div className="hidden lg:block text-right pr-1">
              <span className="text-[10px] uppercase font-bold text-blue-600 block leading-tight">
                {period === 'week' ? 'Rango Semanal' : period === 'month' ? 'Rango Mensual' : 'Rango Anual'}
              </span>
              <span className="text-[11px] font-semibold text-gray-500">
                {startOfPeriod.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} - {endOfPeriod.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
              </span>
            </div>
          )}

          <div className="relative flex items-center flex-1 md:flex-initial">
            <Calendar className="w-3.5 h-3.5 text-gray-400 absolute left-3 pointer-events-none" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => onDateChange && onDateChange(e.target.value)}
              className="w-full md:w-40 pl-8 pr-2.5 py-1.5 bg-gray-50/80 hover:bg-gray-100/80 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 text-xs font-semibold text-gray-800 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* 2. Cuadrícula Horizontal de 4 Tarjetas KPI Compactas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Ingresos Totales */}
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs hover:border-emerald-200 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Ingresos Totales</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-emerald-600 leading-tight">
              ${stats.totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] font-semibold text-gray-400 mt-1 truncate">
              {stats.delivered} ventas entregadas
            </p>
          </div>
        </div>

        {/* KPI 2: Pedidos del Periodo */}
        <div 
          onClick={() => setShowStatuses(!showStatuses)}
          className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs hover:border-blue-200 transition-all flex flex-col justify-between cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Pedidos</span>
            <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-xl sm:text-2xl font-black text-blue-600 leading-tight">
                {stats.totalOrders}
              </p>
              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md">
                {stats.delivered} listos
              </span>
            </div>
            <p className="text-[10px] font-semibold text-gray-400 mt-1 truncate">
              {stats.pending + stats.processing + stats.shipped} en proceso activo
            </p>
          </div>
        </div>

        {/* KPI 3: Volumen / Cajas Movidas */}
        <div 
          onClick={() => onInventoryTrackingClick(period, 'sold')}
          className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs hover:border-purple-200 transition-all flex flex-col justify-between cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Volumen / Cajas</span>
            <div className="w-7 h-7 rounded-xl bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors flex items-center justify-center shrink-0">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-purple-700 leading-tight">
              {Math.round(stats.totalVolumeMoved).toLocaleString('es-MX')}
              <span className="text-xs font-semibold text-gray-400 ml-1">uds</span>
            </p>
            <p className="text-[10px] font-semibold text-gray-400 mt-1 truncate">
              Artículos en pedidos
            </p>
          </div>
        </div>

        {/* KPI 4: Clientes Atendidos */}
        <div 
          onClick={onUsersClick}
          className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs hover:border-amber-200 transition-all flex flex-col justify-between cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Clientes</span>
            <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-xl sm:text-2xl font-black text-amber-700 leading-tight">
                {stats.uniqueClients}
              </p>
              <span className="text-[10px] font-semibold text-gray-400">
                de {users.length} total
              </span>
            </div>
            <p className="text-[10px] font-semibold text-gray-400 mt-1 truncate">
              Compradores con pedido
            </p>
          </div>
        </div>
      </div>

      {/* Desglose Rápido de Estados de Pedido (Colapsable / Desplegable) */}
      <AnimatePresence>
        {showStatuses && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-200/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Estados de Pedido en este Periodo</span>
                <button 
                  onClick={() => onStatClick('all')} 
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Ver todos ({stats.totalOrders})
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  { status: 'pending' as const, label: 'Pendientes', count: stats.pending, color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
                  { status: 'processing' as const, label: 'Preparación', count: stats.processing, color: 'text-orange-600 bg-orange-50 border-orange-200' },
                  { status: 'ready' as const, label: 'Listos/Carga', count: stats.ready, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
                  { status: 'shipped' as const, label: 'En Ruta', count: stats.shipped, color: 'text-blue-600 bg-blue-50 border-blue-200' },
                  { status: 'delivered' as const, label: 'Entregados', count: stats.delivered, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
                  { status: 'cancelled' as const, label: 'Cancelados', count: stats.cancelled, color: 'text-red-600 bg-red-50 border-red-200' }
                ].map(item => (
                  <button
                    key={item.status}
                    onClick={() => onStatClick(item.status)}
                    className={cn("p-2.5 rounded-xl border text-center transition-transform active:scale-95", item.color)}
                  >
                    <p className="text-base font-black">{item.count}</p>
                    <p className="text-[10px] font-bold opacity-80 truncate">{item.label}</p>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4 Grandes Hubs Operativos */}
      <div className="space-y-6">
        {/* Hub 1: Operaciones & Logística */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                1. Operaciones & Logística
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">Flujo físico en calle y control de envases</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {onUnitsClick && (
              <button 
                onClick={onUnitsClick}
                className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-blue-300 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">Unidades / Camiones</p>
                    <p className="text-xs text-gray-500">Flotilla, mantenimiento y jabas en tránsito</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-600 transition-colors shrink-0" />
              </button>
            )}

            {onKareyControlClick && (
              <button 
                onClick={onKareyControlClick}
                className="bg-white p-5 rounded-3xl border border-amber-200/80 shadow-sm flex items-center justify-between hover:border-amber-400 hover:shadow-md transition-all text-left group bg-amber-50/15"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-3.5 bg-amber-100 text-amber-800 rounded-2xl group-hover:bg-amber-600 group-hover:text-white transition-colors shrink-0">
                    <Box className="w-6 h-6" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-bold text-amber-950 truncate">Control de Jabas Karey</p>
                    <p className="text-xs text-amber-700">Salidas, recepciones, adeudos de chofer y traspasos</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-amber-400 group-hover:text-amber-700 transition-colors shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* Hub 2: Catálogo e Inventario */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                2. Catálogo e Inventario
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">Ciclo de vida y existencias de producto</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button 
              onClick={() => onInventoryTrackingClick(period, 'management')}
              className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-emerald-300 hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">
                  <Package className="w-6 h-6" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">Inventario y Stock</p>
                  <p className="text-xs text-gray-500">Catálogo general, stock físico y costos</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-600 transition-colors shrink-0" />
            </button>

            <button 
              onClick={() => onInventoryTrackingClick(period, 'suppliers')}
              className="bg-white p-5 rounded-3xl border border-teal-100 shadow-sm flex items-center justify-between hover:border-teal-400 hover:shadow-md transition-all text-left group bg-teal-50/20"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-3.5 bg-teal-100 text-teal-700 rounded-2xl group-hover:bg-teal-600 group-hover:text-white transition-colors shrink-0">
                  <Factory className="w-6 h-6" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-bold text-gray-950 truncate">Proveedores & Entradas</p>
                  <p className="text-xs text-teal-800">Catálogo de proveedores y recepción</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-teal-400 group-hover:text-teal-700 transition-colors shrink-0" />
            </button>

            <button 
              onClick={onCategoriesClick}
              className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-orange-300 hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-3.5 bg-orange-50 text-orange-600 rounded-2xl group-hover:bg-orange-600 group-hover:text-white transition-colors shrink-0">
                  <Tags className="w-6 h-6" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">Categorías</p>
                  <p className="text-xs text-gray-500">Organización y subcategorías de venta</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-orange-600 transition-colors shrink-0" />
            </button>

            <button 
              onClick={onReturnsClick}
              className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-red-300 hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-3.5 bg-red-50 text-red-600 rounded-2xl group-hover:bg-red-600 group-hover:text-white transition-colors shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">Devoluciones y Mermas</p>
                  <p className="text-xs text-gray-500">Reingresos a stock físico o bajas por merma</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-red-600 transition-colors shrink-0" />
            </button>
          </div>
        </div>

        {/* Hub 3 & Hub 4: Personal y Administración */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hub 3: Personal y Clientes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  3. Personal y Clientes
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">Directorio y roles</span>
            </div>

            <button 
              onClick={onUsersClick}
              className="w-full bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-purple-300 hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-3.5 bg-purple-50 text-purple-600 rounded-2xl group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0">
                  <Users className="w-6 h-6" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">Gestión de Usuarios y Roles</p>
                  <p className="text-xs text-gray-500">Puestos operativos, precios de cliente y líneas de crédito</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-purple-600 transition-colors shrink-0" />
            </button>
          </div>

          {/* Hub 4: Administración y Auditoría */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  4. Administración & Auditoría
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">Control y sistema</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {onActivityClick && (
                <button 
                  onClick={onActivityClick}
                  className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-indigo-300 hover:shadow-md transition-all text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">Auditoría</p>
                      <p className="text-[10px] text-gray-400 truncate">Tiempos y actividad</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-600 shrink-0" />
                </button>
              )}

              <button 
                onClick={onSettingsClick}
                className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-slate-300 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl group-hover:bg-slate-800 group-hover:text-white transition-colors shrink-0">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">Configuración</p>
                    <p className="text-[10px] text-gray-400 truncate">Nombre y logo</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-slate-800 shrink-0" />
              </button>
            </div>
          </div>
        </div>

        {/* Módulo de Estados de Pedidos */}
        <div className="pt-2">
          <button 
            onClick={() => setShowStatuses(!showStatuses)}
            className="w-full bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-indigo-200 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-900">Monitor de Estados de Pedidos</p>
                <p className="text-xs text-gray-400">Ver pedidos pendientes, en preparación, listos, en ruta y entregados</p>
              </div>
            </div>
            <motion.div animate={{ rotate: showStatuses ? 90 : 0 }}>
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </motion.div>
          </button>

          <AnimatePresence>
            {showStatuses && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 overflow-hidden"
              >
                {[
                  { label: 'Pendientes', value: stats.pending, color: 'bg-orange-100 text-orange-600', status: 'pending' },
                  { label: 'Preparación', value: stats.processing, color: 'bg-blue-100 text-blue-600', status: 'processing' },
                  { label: 'Listos', value: stats.ready, color: 'bg-purple-100 text-purple-600', status: 'ready' },
                  { label: 'En Ruta', value: stats.shipped, color: 'bg-indigo-100 text-indigo-600', status: 'shipped' },
                  { label: 'Entregados', value: stats.delivered, color: 'bg-green-100 text-green-600', status: 'delivered' },
                  { label: 'Cancelados', value: stats.cancelled, color: 'bg-red-100 text-red-600', status: 'cancelled' },
                ].map((stat, i) => (
                  <button 
                    key={i} 
                    onClick={() => onStatClick(stat.status as Order['status'])}
                    className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between items-start hover:border-gray-300 transition-colors"
                  >
                    <span className="text-xs font-bold text-gray-500">{stat.label}</span>
                    <span className={cn("text-lg font-black px-2.5 py-0.5 rounded-lg mt-2", stat.color)}>{stat.value}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {assignedOrdersCount > 0 && (
          <button 
            onClick={onDriverRouteClick}
            className="w-full bg-blue-600 p-5 rounded-3xl shadow-lg shadow-blue-200 flex items-center justify-between hover:bg-blue-700 transition-colors text-white"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl">
                <Truck className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold">Mi Ruta de Entrega</p>
                <p className="text-xs opacity-80">{assignedOrdersCount} pedidos asignados</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 opacity-50" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
