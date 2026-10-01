import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Truck, 
  Package, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw, 
  Users, 
  DollarSign, 
  Calendar, 
  Filter, 
  CheckCircle2, 
  Clock, 
  ArrowRightLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  List,
  LayoutGrid,
  Plus
} from 'lucide-react';
import { Button, Input, cn } from '../../components/ui';
import { Unit, ContainerMovement, UserProfile, AppSettings, ToastType, Page } from '../../types';

export function KareyDashboard({
  units,
  movements,
  drivers,
  appSettings,
  onNavigate,
  onRefresh,
  showToast
}: {
  units: Unit[];
  movements: ContainerMovement[];
  drivers: UserProfile[];
  appSettings?: AppSettings;
  onNavigate: (page: Page) => void;
  onRefresh?: () => void;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [dateFilter, setDateFilter] = useState('');
  const [selectedDriverFilter, setSelectedDriverFilter] = useState('');
  const [isFleetExpanded, setIsFleetExpanded] = useState(false);
  const [fleetStatusFilter, setFleetStatusFilter] = useState<'all' | 'in_route' | 'in_pantano' | 'available' | 'maintenance'>('all');
  const [fleetSearch, setFleetSearch] = useState('');
  const [fleetViewMode, setFleetViewMode] = useState<'list' | 'grid'>('list');
  const containerCost = appSettings?.containerUnitCost || 150;

  // Key metrics calculation
  const metrics = useMemo(() => {
    let totalJvInRoute = 0;
    let totalJnInRoute = 0;
    let activeUnitsCount = 0;
    let pantanoUnitsCount = 0;
    let availableUnitsCount = 0;
    let maintenanceUnitsCount = 0;

    units.forEach((u) => {
      if (u.status === 'in_route') {
        activeUnitsCount++;
        totalJvInRoute += u.jvPending || 0;
        totalJnInRoute += u.jnPending || 0;
      } else if (u.status === 'in_pantano') {
        pantanoUnitsCount++;
        totalJvInRoute += u.jvPending || 0;
        totalJnInRoute += u.jnPending || 0;
      } else if (u.status === 'available') {
        availableUnitsCount++;
      } else if (u.status === 'maintenance') {
        maintenanceUnitsCount++;
      }
    });

    // Monthly shortages
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let missingJvCount = 0;
    let missingJnCount = 0;

    movements.forEach((m) => {
      if (m.status === 'completed' && m.entryTime) {
        const entryDate = new Date((m.entryTime.seconds || 0) * 1000);
        if (entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear) {
          const diffJv = Math.max(0, m.jvOut - (m.jvIn ?? m.jvOut));
          const diffJn = Math.max(0, m.jnOut - (m.jnIn ?? m.jnOut));
          missingJvCount += diffJv;
          missingJnCount += diffJn;
        }
      }
    });

    const totalMissingPieces = missingJvCount + missingJnCount;
    const totalMissingAmount = totalMissingPieces * containerCost;

    return {
      totalJvInRoute,
      totalJnInRoute,
      totalJabasInRoute: totalJvInRoute + totalJnInRoute,
      activeUnitsCount,
      pantanoUnitsCount,
      availableUnitsCount,
      maintenanceUnitsCount,
      missingJvCount,
      missingJnCount,
      totalMissingPieces,
      totalMissingAmount
    };
  }, [units, movements, containerCost]);

  // Filtered movements list
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (dateFilter && m.exitTime) {
        const exitDate = new Date((m.exitTime.seconds || 0) * 1000).toISOString().split('T')[0];
        if (exitDate !== dateFilter) return false;
      }
      if (selectedDriverFilter && m.driverId !== selectedDriverFilter) {
        return false;
      }
      return true;
    });
  }, [movements, dateFilter, selectedDriverFilter]);

  // Filtered fleet units list
  const filteredFleetUnits = useMemo(() => {
    return units.filter((unit) => {
      if (fleetStatusFilter !== 'all' && unit.status !== fleetStatusFilter) {
        return false;
      }
      if (fleetSearch.trim()) {
        const q = fleetSearch.toLowerCase();
        const matchNumber = unit.number.toLowerCase().includes(q);
        const matchDriver = (unit.lastDriverName || '').toLowerCase().includes(q);
        const matchRoute = (unit.lastRouteName || '').toLowerCase().includes(q);
        if (!matchNumber && !matchDriver && !matchRoute) {
          return false;
        }
      }
      return true;
    });
  }, [units, fleetStatusFilter, fleetSearch]);

  const getStatusBadge = (status: Unit['status']) => {
    switch (status) {
      case 'available':
        return <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200">Disponible</span>;
      case 'loading':
        return <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-200">En Carga</span>;
      case 'in_route':
        return <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-200">En Ruta</span>;
      case 'in_pantano':
        return <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 animate-pulse">En Pantano</span>;
      case 'maintenance':
        return <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg border border-gray-300">Mantenimiento</span>;
      default:
        return <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg">{status}</span>;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-24 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-6 rounded-3xl shadow-lg">
        <div>
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
            <span>Karey Alimentos</span>
            <span>•</span>
            <span>Control de Contenedores Retornables</span>
          </div>
          <h2 className="text-2xl font-black text-white mt-1">Panel de Inventario de Jabas</h2>
          <p className="text-xs text-emerald-100/80 mt-1">
            Gestión de vales de salida, retornos de unidades, traspasos y conciliación de choferes
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Actualizar
            </Button>
          )}
        </div>
      </div>

      {/* Pantano Warning Banner if any units in pantano */}
      {metrics.pantanoUnitsCount > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-600 text-white rounded-2xl animate-bounce">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-rose-900">
                ¡Atención! {metrics.pantanoUnitsCount} Unidad(es) en Estado "Pantano"
              </h3>
              <p className="text-xs text-rose-700">
                Camiones con vales de salida anteriores no cerrados antes de un nuevo despacho. Requiere conciliación inmediata.
              </p>
            </div>
          </div>
          <Button
            onClick={() => onNavigate('karey-return')}
            className="bg-rose-600 hover:bg-rose-700 text-white gap-2 shrink-0 rounded-2xl"
          >
            <ArrowDownLeft className="w-4 h-4" />
            Conciliar Retornos
          </Button>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Jabas en Ruta */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Jabas en Ruta Total</span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-3xl font-black text-gray-900">{metrics.totalJabasInRoute}</span>
            <span className="text-xs text-gray-400 ml-1">piezas</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-50">
            <span className="text-emerald-700 font-bold">Verdes (JV): {metrics.totalJvInRoute}</span>
            <span className="text-gray-800 font-bold">Negras (JN): {metrics.totalJnInRoute}</span>
          </div>
        </div>

        {/* Card 2: Unidades en Tránsito */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Unidades Activas</span>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-3xl font-black text-blue-600">{metrics.activeUnitsCount}</span>
            <span className="text-xs text-gray-400 ml-1">/ {units.length} camiones</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-gray-50 text-gray-500">
            <span>Disponibles: <b className="text-emerald-600">{metrics.availableUnitsCount}</b></span>
            <span>Pantano: <b className="text-rose-600">{metrics.pantanoUnitsCount}</b></span>
          </div>
        </div>

        {/* Card 3: Faltantes del Mes (Piezas) */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Faltantes Mes Actual</span>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-3xl font-black text-amber-600">{metrics.totalMissingPieces}</span>
            <span className="text-xs text-gray-400 ml-1">jabas no devueltas</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-50">
            <span className="text-gray-500">JV: <b>{metrics.missingJvCount}</b></span>
            <span className="text-gray-500">JN: <b>{metrics.missingJnCount}</b></span>
          </div>
        </div>

        {/* Card 4: Importe Faltantes */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Monto por Cobrar ($)</span>
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div>
            <span className="text-3xl font-black text-rose-600">
              ${metrics.totalMissingAmount.toLocaleString('es-MX')}
            </span>
            <span className="text-[10px] text-gray-400 ml-1">MXN (@${containerCost}/c.u)</span>
          </div>
          <div className="text-[11px] pt-2 border-t border-gray-50 text-gray-500 truncate">
            Cargos aplicables a nómina choferes
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => onNavigate('karey-movement')}
          className="bg-white p-5 rounded-3xl border border-emerald-100 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all text-left group flex flex-col justify-between h-36"
        >
          <div className="flex items-center justify-between">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <ArrowUpRight className="w-6 h-6" />
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-600 transition-colors" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-gray-900">Registrar Salida / Carga</h4>
            <p className="text-xs text-gray-400 mt-0.5">Crear vale de jabas antes de ruta</p>
          </div>
        </button>

        <button
          onClick={() => onNavigate('karey-return')}
          className="bg-white p-5 rounded-3xl border border-blue-100 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-left group flex flex-col justify-between h-36"
        >
          <div className="flex items-center justify-between">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <ArrowDownLeft className="w-6 h-6" />
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-600 transition-colors" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-gray-900">Recepción y Cierre</h4>
            <p className="text-xs text-gray-400 mt-0.5">Contar jabas y cerrar vale de viaje</p>
          </div>
        </button>

        <button
          onClick={() => onNavigate('karey-transfer')}
          className="bg-white p-5 rounded-3xl border border-purple-100 shadow-sm hover:border-purple-300 hover:shadow-md transition-all text-left group flex flex-col justify-between h-36"
        >
          <div className="flex items-center justify-between">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-purple-600 transition-colors" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-gray-900">Traspaso entre Unidades</h4>
            <p className="text-xs text-gray-400 mt-0.5">Transferir carga por descompostura</p>
          </div>
        </button>

        <button
          onClick={() => onNavigate('karey-balances')}
          className="bg-white p-5 rounded-3xl border border-amber-100 shadow-sm hover:border-amber-300 hover:shadow-md transition-all text-left group flex flex-col justify-between h-36"
        >
          <div className="flex items-center justify-between">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Users className="w-6 h-6" />
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-amber-600 transition-colors" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-gray-900">Balances de Choferes</h4>
            <p className="text-xs text-gray-400 mt-0.5">Historial y cobro de faltantes</p>
          </div>
        </button>
      </div>

      {/* Active Movements / Vales in Transit Section */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              Vales de Salida Activos ({movements.filter(m => m.status === 'active' || m.status === 'pantano' || m.status === 'loading').length})
            </h3>
            <p className="text-xs text-gray-400">
              Vales generados por cargadores/preparadores. Revisa que el chofer traiga las jabas de vuelta al regresar.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => onNavigate('karey-return')}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs gap-1.5 h-9 px-3.5 font-bold shrink-0 self-stretch sm:self-auto justify-center shadow-xs"
          >
            <ArrowDownLeft className="w-4 h-4" />
            Recepción y Cierre de Vales
          </Button>
        </div>

        {movements.filter(m => m.status === 'active' || m.status === 'pantano' || m.status === 'loading').length === 0 ? (
          <div className="p-6 bg-gray-50/70 rounded-2xl border border-dashed border-gray-200 text-center text-xs text-gray-400">
            No hay vales activos en tránsito pendientes de retorno en este momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {movements
              .filter(m => m.status === 'active' || m.status === 'pantano' || m.status === 'loading')
              .map(m => {
                const exitTimeStr = m.exitTime?.seconds 
                  ? new Date(m.exitTime.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'En curso';

                return (
                  <div 
                    key={m.id}
                    className={cn(
                      "p-4 rounded-2xl border transition-all space-y-3",
                      m.status === 'pantano' 
                        ? "bg-rose-50/50 border-rose-300 ring-2 ring-rose-200"
                        : "bg-blue-50/30 border-blue-100 hover:border-blue-300"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-gray-900">{m.folio}</span>
                        {m.status === 'pantano' ? (
                          <span className="text-[9px] font-black uppercase bg-rose-600 text-white px-2 py-0.5 rounded-full">
                            Pantano
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase bg-blue-600 text-white px-2 py-0.5 rounded-full">
                            En Tránsito
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-black text-gray-700 bg-white px-2 py-0.5 rounded-md border border-gray-200">
                        Unidad: {m.unitNumber}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-400 block text-[10px]">Chofer</span>
                        <span className="font-bold text-gray-800 truncate block">{m.driverName}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">Salida</span>
                        <span className="font-medium text-gray-700">{exitTimeStr}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                          {m.jvOut} JV
                        </span>
                        <span className="font-bold text-gray-800 bg-gray-200/70 px-2 py-0.5 rounded-md">
                          {m.jnOut} JN
                        </span>
                        <span className="font-bold text-blue-900">Total: {m.jvOut + m.jnOut}</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => onNavigate('karey-return')}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] h-7 px-3 rounded-lg font-bold flex items-center gap-1 shrink-0"
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        Recepción y Cierre
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Units Fleet Status Section - Dropdown / Collapsible */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden transition-all">
        {/* Dropdown Header Bar */}
        <button
          type="button"
          onClick={() => setIsFleetExpanded(prev => !prev)}
          className="w-full p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left hover:bg-gray-50/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-gray-900">
                  Estado de la Flota ({units.length} Unidades)
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {isFleetExpanded ? 'Lista Desplegada' : 'Clic para desplegar lista'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Semáforo operativo de camiones, choferes y conteo de jabas pendientes
              </p>
            </div>
          </div>

          {/* Quick status summary chips & Chevron toggle */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
                {metrics.availableUnitsCount} Disp.
              </span>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                {metrics.activeUnitsCount} Ruta
              </span>
              {metrics.pantanoUnitsCount > 0 && (
                <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 animate-pulse">
                  {metrics.pantanoUnitsCount} Pantano
                </span>
              )}
            </div>

            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 transition-transform duration-200",
              isFleetExpanded ? "rotate-180 bg-emerald-100 text-emerald-700" : ""
            )}>
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </button>

        {/* Collapsible Dropdown Content */}
        <AnimatePresence initial={false}>
          {isFleetExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="border-t border-gray-100"
            >
              <div className="p-5 sm:p-6 space-y-4 bg-gray-50/30">
                {/* Controls Bar: Search, Status Filter & View Mode */}
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                  <div className="flex flex-1 flex-col sm:flex-row gap-2">
                    {/* Search by unit / driver */}
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        value={fleetSearch}
                        onChange={(e) => setFleetSearch(e.target.value)}
                        placeholder="Buscar por Nº de unidad, chofer o ruta..."
                        className="pl-9 text-xs bg-white"
                      />
                    </div>

                    {/* Status filter dropdown */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Filter className="w-3.5 h-3.5 text-gray-400 hidden sm:block" />
                      <select
                        value={fleetStatusFilter}
                        onChange={(e) => setFleetStatusFilter(e.target.value as any)}
                        className="text-xs bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="all">Todos los estados ({units.length})</option>
                        <option value="available">🟢 Disponibles ({metrics.availableUnitsCount})</option>
                        <option value="in_route">🔵 En Ruta ({metrics.activeUnitsCount})</option>
                        <option value="in_pantano">🔴 En Pantano ({metrics.pantanoUnitsCount})</option>
                        <option value="maintenance">⚪ En Mantenimiento ({metrics.maintenanceUnitsCount})</option>
                      </select>
                    </div>
                  </div>

                  {/* View Mode Toggle */}
                  <div className="flex items-center gap-1 bg-white border border-gray-200 p-1 rounded-xl shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setFleetViewMode('list')}
                      className={cn(
                        "p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors",
                        fleetViewMode === 'list'
                          ? "bg-emerald-600 text-white"
                          : "text-gray-500 hover:text-gray-800"
                      )}
                      title="Vista en lista desplegable"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>Lista</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFleetViewMode('grid')}
                      className={cn(
                        "p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors",
                        fleetViewMode === 'grid'
                          ? "bg-emerald-600 text-white"
                          : "text-gray-500 hover:text-gray-800"
                      )}
                      title="Vista en cuadrícula"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Cuadrícula</span>
                    </button>
                  </div>
                </div>

                {/* Fleet Units List / Grid */}
                {units.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs bg-white rounded-2xl border border-dashed border-gray-200">
                    No hay unidades registradas en el sistema. El administrador debe agregarlas desde "Unidades / Camiones".
                  </div>
                ) : filteredFleetUnits.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs bg-white rounded-2xl border border-dashed border-gray-200">
                    No se encontraron unidades con los filtros seleccionados.
                  </div>
                ) : fleetViewMode === 'list' ? (
                  /* Compact Desplegable List View */
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100 shadow-2xs">
                    {filteredFleetUnits.map((unit) => (
                      <div
                        key={unit.id}
                        className={cn(
                          "p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-gray-50/80",
                          unit.status === 'in_pantano' ? "bg-rose-50/30" : ""
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0",
                            unit.status === 'in_pantano'
                              ? "bg-rose-100 text-rose-800"
                              : unit.status === 'in_route'
                              ? "bg-blue-100 text-blue-800"
                              : unit.status === 'available'
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-gray-100 text-gray-700"
                          )}>
                            <Truck className="w-4 h-4" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm text-gray-900">{unit.number}</span>
                              {getStatusBadge(unit.status)}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                              <span>
                                Chofer: <strong className="text-gray-700">{unit.lastDriverName || 'Sin asignar'}</strong>
                              </span>
                              {unit.lastRouteName && (
                                <span className="truncate max-w-[200px]">
                                  Ruta: <strong className="text-gray-700">{unit.lastRouteName}</strong>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Jabas Pending Counter & Action */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                          <div className="flex items-center gap-3 text-xs">
                            <div className="flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                              <span className="text-[10px] text-emerald-800 font-bold">JV:</span>
                              <span className="font-extrabold text-emerald-700">{unit.jvPending || 0}</span>
                            </div>
                            <div className="flex items-center gap-1 bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200">
                              <span className="text-[10px] text-gray-700 font-bold">JN:</span>
                              <span className="font-extrabold text-gray-900">{unit.jnPending || 0}</span>
                            </div>
                          </div>

                          {unit.status === 'in_pantano' && (
                            <Button
                              size="sm"
                              onClick={() => onNavigate('karey-return')}
                              className="bg-rose-600 hover:bg-rose-700 text-white text-[11px] h-7 px-3 rounded-lg font-bold shadow-xs shrink-0"
                            >
                              Conciliar Vale
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Grid View */
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredFleetUnits.map((unit) => (
                      <div
                        key={unit.id}
                        className={cn(
                          "p-4 rounded-2xl border transition-all space-y-2.5",
                          unit.status === 'in_pantano'
                            ? "bg-rose-50/50 border-rose-300 ring-2 ring-rose-200"
                            : unit.status === 'in_route'
                            ? "bg-blue-50/30 border-blue-200"
                            : unit.status === 'maintenance'
                            ? "bg-gray-50 border-gray-200 opacity-75"
                            : "bg-white border-gray-100 hover:border-gray-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-gray-900">{unit.number}</span>
                          {getStatusBadge(unit.status)}
                        </div>

                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between text-gray-500">
                            <span>Jabas Verdes (JV):</span>
                            <span className="font-bold text-emerald-700">{unit.jvPending || 0}</span>
                          </div>
                          <div className="flex justify-between text-gray-500">
                            <span>Jabas Negras (JN):</span>
                            <span className="font-bold text-gray-800">{unit.jnPending || 0}</span>
                          </div>
                          <div className="flex justify-between text-gray-500 pt-1 border-t border-gray-100">
                            <span className="truncate">Chofer:</span>
                            <span className="font-medium text-gray-700 truncate max-w-[120px]">
                              {unit.lastDriverName || 'Ninguno'}
                            </span>
                          </div>
                        </div>

                        {unit.status === 'in_pantano' && (
                          <Button
                            size="sm"
                            onClick={() => onNavigate('karey-return')}
                            className="w-full bg-rose-600 hover:bg-rose-700 text-white text-[11px] h-7 rounded-xl mt-2"
                          >
                            Conciliar Vale Pendiente
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Movements History Section */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              Historial Reciente de Vales y Movimientos
            </h3>
            <p className="text-xs text-gray-400">Auditoría completa de salidas y retornos</p>
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="text-xs h-9 w-36"
            />
            {dateFilter && (
              <Button size="sm" variant="outline" onClick={() => setDateFilter('')} className="text-xs h-9">
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {filteredMovements.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-xs">
            No se encontraron movimientos registrados para los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-4 rounded-l-2xl">Folio / Fecha</th>
                  <th className="py-3 px-4">Unidad</th>
                  <th className="py-3 px-4">Chofer</th>
                  <th className="py-3 px-4 text-center">Salida (JV / JN)</th>
                  <th className="py-3 px-4 text-center">Retorno (JV / JN)</th>
                  <th className="py-3 px-4 text-center">Diferencia</th>
                  <th className="py-3 px-4 rounded-r-2xl text-right">Estatus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMovements.slice(0, 15).map((m) => {
                  const exitDateStr = m.exitTime
                    ? new Date((m.exitTime.seconds || 0) * 1000).toLocaleString('es-MX', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })
                    : 'N/A';

                  const jvDiff = m.status === 'completed' ? Math.max(0, m.jvOut - (m.jvIn ?? m.jvOut)) : 0;
                  const jnDiff = m.status === 'completed' ? Math.max(0, m.jnOut - (m.jnIn ?? m.jnOut)) : 0;
                  const totalDiff = jvDiff + jnDiff;

                  return (
                    <tr key={m.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-black text-gray-900">{m.folio}</div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {exitDateStr}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded-md">
                          {m.unitNumber}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-800">
                        {m.driverName}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-emerald-700 font-bold">{m.jvOut} JV</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-gray-800 font-bold">{m.jnOut} JN</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {m.status === 'completed' ? (
                          <>
                            <span className="text-emerald-700 font-bold">{m.jvIn ?? 0} JV</span>
                            <span className="text-gray-400 mx-1">/</span>
                            <span className="text-gray-800 font-bold">{m.jnIn ?? 0} JN</span>
                          </>
                        ) : (
                          <span className="text-gray-400 italic">Pendiente</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {m.status === 'completed' ? (
                          totalDiff > 0 ? (
                            <span className="px-2 py-0.5 bg-rose-50 text-rose-700 font-black rounded-lg border border-rose-200">
                              -{totalDiff} ({`$${totalDiff * containerCost}`})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-200">
                              Completo (0)
                            </span>
                          )
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {m.status === 'completed' ? (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-200">
                            Cerrado
                          </span>
                        ) : m.status === 'pantano' ? (
                          <span className="px-2.5 py-1 bg-rose-50 text-rose-700 font-black rounded-lg border border-rose-300 animate-pulse">
                            Pantano
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200">
                            En Ruta
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
