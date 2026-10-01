import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, 
  Users, 
  DollarSign, 
  Package, 
  AlertTriangle, 
  Calendar, 
  Search, 
  Printer, 
  Filter, 
  Clock, 
  CheckCircle2,
  ChevronDown
} from 'lucide-react';
import { Button, Input, cn } from '../../components/ui';
import { ContainerMovement, UserProfile, AppSettings, ToastType } from '../../types';

export function KareyDriverBalances({
  drivers,
  movements,
  appSettings,
  onBack,
  showToast
}: {
  drivers: UserProfile[];
  movements: ContainerMovement[];
  appSettings?: AppSettings;
  onBack: () => void;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [selectedDriverId, setSelectedDriverId] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);

  const containerCost = appSettings?.containerUnitCost || 150;

  // Filtered movements based on date range
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      if (m.exitTime) {
        const exitDateStr = new Date((m.exitTime.seconds || 0) * 1000).toISOString().split('T')[0];
        if (startDate && exitDateStr < startDate) return false;
        if (endDate && exitDateStr > endDate) return false;
      }
      return true;
    });
  }, [movements, startDate, endDate]);

  // Aggregate balance per driver
  const driverBalances = useMemo(() => {
    const map = new Map<string, {
      driver: UserProfile;
      totalJvOut: number;
      totalJnOut: number;
      totalJvIn: number;
      totalJnIn: number;
      missingJv: number;
      missingJn: number;
      totalMissing: number;
      totalMissingCost: number;
      movements: ContainerMovement[];
    }>();

    // Initialize all drivers
    drivers.forEach(d => {
      map.set(d.uid, {
        driver: d,
        totalJvOut: 0,
        totalJnOut: 0,
        totalJvIn: 0,
        totalJnIn: 0,
        missingJv: 0,
        missingJn: 0,
        totalMissing: 0,
        totalMissingCost: 0,
        movements: []
      });
    });

    // Populate movements
    filteredMovements.forEach(m => {
      let rec = map.get(m.driverId);
      if (!rec) {
        rec = {
          driver: { uid: m.driverId, name: m.driverName, email: '', role: 'driver' },
          totalJvOut: 0,
          totalJnOut: 0,
          totalJvIn: 0,
          totalJnIn: 0,
          missingJv: 0,
          missingJn: 0,
          totalMissing: 0,
          totalMissingCost: 0,
          movements: []
        };
        map.set(m.driverId, rec);
      }

      rec.totalJvOut += m.jvOut || 0;
      rec.totalJnOut += m.jnOut || 0;
      rec.movements.push(m);

      if (m.status === 'completed') {
        const jvInVal = m.jvIn ?? m.jvOut;
        const jnInVal = m.jnIn ?? m.jnOut;
        rec.totalJvIn += jvInVal;
        rec.totalJnIn += jnInVal;

        const diffJv = Math.max(0, m.jvOut - jvInVal);
        const diffJn = Math.max(0, m.jnOut - jnInVal);
        rec.missingJv += diffJv;
        rec.missingJn += diffJn;
      }
    });

    // Calculate totals
    const list = Array.from(map.values()).map(item => {
      const totalMissing = item.missingJv + item.missingJn;
      const totalMissingCost = totalMissing * containerCost;
      return { ...item, totalMissing, totalMissingCost };
    });

    // Filter by selected driver if not 'all'
    if (selectedDriverId !== 'all') {
      return list.filter(b => b.driver.uid === selectedDriverId);
    }

    return list.sort((a, b) => b.totalMissingCost - a.totalMissingCost);
  }, [drivers, filteredMovements, selectedDriverId, containerCost]);

  // Overall Global Summary
  const globalSummary = useMemo(() => {
    let totalJvOut = 0;
    let totalJnOut = 0;
    let totalJvIn = 0;
    let totalJnIn = 0;
    let totalMissingJv = 0;
    let totalMissingJn = 0;
    let totalMissingCost = 0;

    driverBalances.forEach(b => {
      totalJvOut += b.totalJvOut;
      totalJnOut += b.totalJnOut;
      totalJvIn += b.totalJvIn;
      totalJnIn += b.totalJnIn;
      totalMissingJv += b.missingJv;
      totalMissingJn += b.missingJn;
      totalMissingCost += b.totalMissingCost;
    });

    return {
      totalJvOut,
      totalJnOut,
      totalJvIn,
      totalJnIn,
      totalMissingJv,
      totalMissingJn,
      totalMissing: totalMissingJv + totalMissingJn,
      totalMissingCost
    };
  }, [driverBalances]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-24 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={onBack} className="rounded-full w-9 h-9 p-0 flex items-center justify-center">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Balances y Liquidación por Chofer</h2>
            <p className="text-xs text-gray-500">Historial acumulado de jabas entregadas, devueltas y faltantes a nómina</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-2 bg-white text-gray-700 hover:bg-gray-50 rounded-2xl"
          >
            <Printer className="w-4 h-4" />
            Imprimir / Exportar
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-[200px] flex-1">
          <Users className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={selectedDriverId}
            onChange={(e) => setSelectedDriverId(e.target.value)}
            className="w-full text-xs h-9 bg-gray-50 border border-gray-200 rounded-xl px-2.5"
          >
            <option value="all">Todos los choferes</option>
            {drivers.map(d => (
              <option key={d.uid} value={d.uid}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Desde:</span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-xs h-9 w-36"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Hasta:</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="text-xs h-9 w-36"
          />
        </div>

        {(startDate || endDate || selectedDriverId !== 'all') && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setSelectedDriverId('all');
            }}
            className="text-xs h-9 rounded-xl"
          >
            Restablecer
          </Button>
        )}
      </div>

      {/* Global Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Entregadas (Histórico)</span>
          <span className="text-2xl font-black text-gray-900">{globalSummary.totalJvOut + globalSummary.totalJnOut}</span>
          <div className="text-xs text-gray-500 flex gap-2">
            <span className="text-emerald-700 font-bold">{globalSummary.totalJvOut} JV</span>
            <span>•</span>
            <span className="text-gray-900 font-bold">{globalSummary.totalJnOut} JN</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Devueltas</span>
          <span className="text-2xl font-black text-emerald-600">{globalSummary.totalJvIn + globalSummary.totalJnIn}</span>
          <div className="text-xs text-gray-500 flex gap-2">
            <span className="text-emerald-700 font-bold">{globalSummary.totalJvIn} JV</span>
            <span>•</span>
            <span className="text-gray-900 font-bold">{globalSummary.totalJnIn} JN</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Faltantes Totales (Pzas)</span>
          <span className="text-2xl font-black text-amber-600">{globalSummary.totalMissing}</span>
          <div className="text-xs text-gray-500 flex gap-2">
            <span>JV: <b className="text-rose-600">-{globalSummary.totalMissingJv}</b></span>
            <span>•</span>
            <span>JN: <b className="text-rose-600">-{globalSummary.totalMissingJn}</b></span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Monto a Cobrar (Nómina)</span>
          <span className="text-2xl font-black text-rose-600">
            ${globalSummary.totalMissingCost.toLocaleString('es-MX')}
          </span>
          <span className="text-[10px] text-gray-400 block">@${containerCost} MXN / jaba</span>
        </div>
      </div>

      {/* Driver List with Expandable Movements Breakdown */}
      <div className="space-y-4">
        {driverBalances.length === 0 ? (
          <div className="bg-white p-8 rounded-3xl border border-gray-100 text-center text-xs text-gray-400">
            No se encontraron choferes con registros bajo los filtros actuales.
          </div>
        ) : (
          driverBalances.map((balance) => {
            const isExpanded = expandedDriverId === balance.driver.uid;

            return (
              <div
                key={balance.driver.uid}
                className={cn(
                  "bg-white rounded-3xl border shadow-sm transition-all overflow-hidden",
                  balance.totalMissing > 0 ? "border-rose-200" : "border-gray-100"
                )}
              >
                {/* Driver Summary Row */}
                <div
                  onClick={() => setExpandedDriverId(isExpanded ? null : balance.driver.uid)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-3 rounded-2xl",
                      balance.totalMissing > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                    )}>
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900">{balance.driver.name}</h3>
                      <p className="text-xs text-gray-400">
                        {balance.movements.length} viajes registrados
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="bg-gray-50 p-2.5 rounded-xl text-center min-w-[90px]">
                      <span className="text-[10px] text-gray-400 block">Entregadas</span>
                      <span className="font-bold text-gray-800">{balance.totalJvOut + balance.totalJnOut}</span>
                    </div>

                    <div className="bg-gray-50 p-2.5 rounded-xl text-center min-w-[90px]">
                      <span className="text-[10px] text-gray-400 block">Devueltas</span>
                      <span className="font-bold text-emerald-700">{balance.totalJvIn + balance.totalJnIn}</span>
                    </div>

                    <div className={cn(
                      "p-2.5 rounded-xl text-center min-w-[90px]",
                      balance.totalMissing > 0 ? "bg-rose-50 border border-rose-200" : "bg-gray-50"
                    )}>
                      <span className="text-[10px] text-gray-400 block">Faltante</span>
                      <span className={cn(
                        "font-black",
                        balance.totalMissing > 0 ? "text-rose-600" : "text-gray-800"
                      )}>
                        {balance.totalMissing > 0 ? `-${balance.totalMissing}` : '0'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-rose-50/50 border border-rose-100 rounded-xl text-center min-w-[110px]">
                      <span className="text-[10px] text-rose-800 font-bold block">Cobro Nómina</span>
                      <span className="font-black text-rose-700">
                        ${balance.totalMissingCost.toLocaleString('es-MX')}
                      </span>
                    </div>

                    <ChevronDown className={cn("w-5 h-5 text-gray-400 transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </div>

                {/* Expanded Trips Table */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-gray-100 bg-gray-50/30 p-5 space-y-3"
                    >
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Desglose de Vales y Rutas del Chofer ({balance.movements.length})
                      </h4>

                      {balance.movements.length === 0 ? (
                        <div className="text-center py-4 text-xs text-gray-400">
                          Sin movimientos en el periodo seleccionado.
                        </div>
                      ) : (
                        <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-bold">
                              <tr>
                                <th className="py-2.5 px-3">Folio / Fecha</th>
                                <th className="py-2.5 px-3">Unidad</th>
                                <th className="py-2.5 px-3 text-center">Salida (JV / JN)</th>
                                <th className="py-2.5 px-3 text-center">Retorno (JV / JN)</th>
                                <th className="py-2.5 px-3 text-center">Faltante</th>
                                <th className="py-2.5 px-3 text-center">Costo ($)</th>
                                <th className="py-2.5 px-3 text-right">Estatus</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {balance.movements.map((m) => {
                                const exitDateStr = m.exitTime
                                  ? new Date((m.exitTime.seconds || 0) * 1000).toLocaleDateString('es-MX')
                                  : 'N/A';
                                const jvDiff = m.status === 'completed' ? Math.max(0, m.jvOut - (m.jvIn ?? m.jvOut)) : 0;
                                const jnDiff = m.status === 'completed' ? Math.max(0, m.jnOut - (m.jnIn ?? m.jnOut)) : 0;
                                const tripMissing = jvDiff + jnDiff;
                                const tripCost = tripMissing * containerCost;

                                return (
                                  <tr key={m.id} className="hover:bg-gray-50/50">
                                    <td className="py-2.5 px-3">
                                      <span className="font-bold text-gray-900">{m.folio}</span>
                                      <span className="text-[10px] text-gray-400 block">{exitDateStr}</span>
                                    </td>
                                    <td className="py-2.5 px-3 font-semibold text-gray-800">
                                      {m.unitNumber}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-medium">
                                      <span className="text-emerald-700">{m.jvOut} JV</span> / {m.jnOut} JN
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-medium">
                                      {m.status === 'completed' ? (
                                        <>
                                          <span className="text-emerald-700">{m.jvIn ?? 0} JV</span> / {m.jnIn ?? 0} JN
                                        </>
                                      ) : (
                                        <span className="text-gray-400 italic">En curso</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      {tripMissing > 0 ? (
                                        <span className="px-2 py-0.5 bg-rose-50 text-rose-700 font-bold rounded-md">
                                          -{tripMissing} ({jvDiff} JV, {jnDiff} JN)
                                        </span>
                                      ) : m.status === 'completed' ? (
                                        <span className="text-emerald-600 font-bold">0</span>
                                      ) : (
                                        <span className="text-gray-400">-</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-bold text-rose-600">
                                      {tripCost > 0 ? `$${tripCost.toLocaleString('es-MX')}` : '$0'}
                                    </td>
                                    <td className="py-2.5 px-3 text-right">
                                      {m.status === 'completed' ? (
                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-md text-[10px]">
                                          Cerrado
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-bold rounded-md text-[10px]">
                                          Activo
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
