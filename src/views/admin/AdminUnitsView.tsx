import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, 
  Loader2, 
  Plus, 
  Check, 
  X, 
  Truck, 
  Trash2, 
  AlertTriangle, 
  Wrench, 
  RefreshCw, 
  Pencil,
  Search,
  Filter,
  List,
  LayoutGrid
} from 'lucide-react';
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button, Input } from '../../components/ui';
import { cn } from '../../components/ui';
import { Unit, ToastType } from '../../types';

export function AdminUnitsView({
  units,
  onBack,
  showToast,
  onUnitSaved,
  onUnitDeleted
}: {
  units: Unit[];
  onBack: () => void;
  showToast: (msg: string, type?: ToastType) => void;
  onUnitSaved?: (unit: Unit) => void;
  onUnitDeleted?: (id: string) => void;
}) {
  const [newUnitNumber, setNewUnitNumber] = useState('');
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [editNumber, setEditNumber] = useState('');
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'in_route' | 'in_pantano' | 'maintenance'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const filteredUnits = useMemo(() => {
    return units.filter(u => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = u.number.toLowerCase().includes(q);
        const matchDriver = (u.lastDriverName || '').toLowerCase().includes(q);
        const matchRoute = (u.lastRouteName || '').toLowerCase().includes(q);
        if (!matchNum && !matchDriver && !matchRoute) return false;
      }
      return true;
    });
  }, [units, statusFilter, searchQuery]);

  const handleAddUnit = async () => {
    if (!newUnitNumber.trim()) return;
    setIsSaving(true);
    try {
      const newUnitData = {
        number: newUnitNumber.trim().toUpperCase(),
        status: 'available' as const,
        jvPending: 0,
        jnPending: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, 'units'), newUnitData);
      if (onUnitSaved) {
        onUnitSaved({ id: docRef.id, ...newUnitData } as Unit);
      }
      setNewUnitNumber('');
      showToast(`Unidad ${newUnitData.number} creada con éxito`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'units');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateNumber = async (unit: Unit) => {
    if (!editNumber.trim()) return;
    try {
      await updateDoc(doc(db, 'units', unit.id), {
        number: editNumber.trim().toUpperCase(),
        updatedAt: serverTimestamp()
      });
      if (onUnitSaved) {
        onUnitSaved({ ...unit, number: editNumber.trim().toUpperCase() });
      }
      setEditingUnit(null);
      showToast('Unidad actualizada', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `units/${unit.id}`);
    }
  };

  const handleToggleMaintenance = async (unit: Unit) => {
    const nextStatus = unit.status === 'maintenance' ? 'available' : 'maintenance';
    try {
      await updateDoc(doc(db, 'units', unit.id), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
      if (onUnitSaved) {
        onUnitSaved({ ...unit, status: nextStatus });
      }
      showToast(
        nextStatus === 'maintenance'
          ? `Unidad ${unit.number} enviada a mantenimiento`
          : `Unidad ${unit.number} marcada como disponible`,
        'info'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `units/${unit.id}`);
    }
  };

  const handleDeleteUnit = async () => {
    if (!unitToDelete) return;
    try {
      await deleteDoc(doc(db, 'units', unitToDelete.id));
      if (onUnitDeleted) {
        onUnitDeleted(unitToDelete.id);
      }
      setUnitToDelete(null);
      showToast('Unidad eliminada', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `units/${unitToDelete.id}`);
    }
  };

  const getStatusBadge = (status: Unit['status']) => {
    switch (status) {
      case 'available':
        return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200">Disponible</span>;
      case 'loading':
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-200">En Carga</span>;
      case 'in_route':
        return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-200">En Ruta</span>;
      case 'in_pantano':
        return <span className="px-2.5 py-1 bg-rose-50 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 animate-pulse">En Pantano (Vale Pendiente)</span>;
      case 'maintenance':
        return <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg border border-gray-300">Mantenimiento</span>;
      default:
        return <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg">{status}</span>;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-20 w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={onBack} className="rounded-full w-9 h-9 p-0 flex items-center justify-center">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Unidades y Camiones</h2>
            <p className="text-xs text-gray-500">Gestión del parque vehicular y asignaciones</p>
          </div>
        </div>
      </div>

      {/* Add Unit Card */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Truck className="w-4 h-4 text-blue-600" />
          Registrar Nueva Unidad
        </h3>
        <div className="flex gap-2">
          <Input
            value={newUnitNumber}
            onChange={(e) => setNewUnitNumber(e.target.value)}
            placeholder="Ej. U-01, CAMIÓN 3, FOR-502..."
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleAddUnit()}
          />
          <Button
            onClick={handleAddUnit}
            disabled={!newUnitNumber.trim() || isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shrink-0"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Agregar
          </Button>
        </div>
      </div>

      {/* Units List Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
            Unidades Registradas ({units.length})
          </h3>

          {/* Search, Filter & View Mode */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar unidad..."
                className="pl-8 text-xs h-9 bg-white"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs bg-white border border-gray-200 rounded-xl px-3 h-9 text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos los estados</option>
              <option value="available">🟢 Disponibles</option>
              <option value="in_route">🔵 En Ruta</option>
              <option value="in_pantano">🔴 En Pantano</option>
              <option value="maintenance">⚪ Mantenimiento</option>
            </select>

            <div className="flex items-center gap-1 bg-white border border-gray-200 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  "p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors",
                  viewMode === 'list'
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:text-gray-800"
                )}
                title="Vista de lista"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lista</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn(
                  "p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors",
                  viewMode === 'grid'
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:text-gray-800"
                )}
                title="Vista en tarjetas"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tarjetas</span>
              </button>
            </div>
          </div>
        </div>

        {units.length === 0 ? (
          <div className="bg-white p-8 rounded-3xl border border-dashed border-gray-200 text-center space-y-2">
            <Truck className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-sm font-medium text-gray-500">No hay unidades registradas.</p>
            <p className="text-xs text-gray-400">Registra un camión arriba para habilitar el control de jabas y asignaciones.</p>
          </div>
        ) : filteredUnits.length === 0 ? (
          <div className="bg-white p-8 rounded-3xl border border-dashed border-gray-200 text-center space-y-2">
            <Truck className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-sm font-medium text-gray-500">No se encontraron unidades con el filtro seleccionado.</p>
          </div>
        ) : viewMode === 'list' ? (
          /* List Mode */
          <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden divide-y divide-gray-100 shadow-sm">
            {filteredUnits.map((unit) => (
              <div
                key={unit.id}
                className={cn(
                  "p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors hover:bg-gray-50/80",
                  unit.status === 'in_pantano' ? "bg-rose-50/25" : ""
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    {editingUnit?.id === unit.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={editNumber}
                          onChange={(e) => setEditNumber(e.target.value)}
                          className="h-8 text-sm w-36 font-bold"
                          placeholder="Nº unidad"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateNumber(unit);
                            if (e.key === 'Escape') setEditingUnit(null);
                          }}
                        />
                        <Button 
                          size="sm" 
                          variant="secondary" 
                          onClick={() => handleUpdateNumber(unit)} 
                          className="h-8 w-8 p-0 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg shrink-0"
                          title="Guardar cambio"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => setEditingUnit(null)} 
                          className="h-8 w-8 p-0 text-gray-400 hover:bg-gray-100 rounded-lg shrink-0"
                          title="Cancelar"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-gray-900">{unit.number}</span>
                        {getStatusBadge(unit.status)}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                      <span>
                        Chofer: <strong className="text-gray-700">{unit.lastDriverName || 'Sin asignar'}</strong>
                      </span>
                      <span>
                        Jabas: <strong className="text-emerald-700 font-bold">{unit.jvPending || 0} JV</strong> · <strong className="text-gray-800 font-bold">{unit.jnPending || 0} JN</strong>
                      </span>
                      {unit.lastRouteName && (
                        <span className="truncate max-w-[200px]">
                          Ruta: <strong className="text-gray-700">{unit.lastRouteName}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  <Button
                    variant="ghost"
                    onClick={() => handleToggleMaintenance(unit)}
                    title={unit.status === 'maintenance' ? 'Reactivar unidad' : 'Enviar a mantenimiento'}
                    className={cn(
                      "h-8 px-2.5 text-xs font-bold rounded-xl border gap-1 transition-all shadow-2xs leading-none",
                      unit.status === 'maintenance'
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                        : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 hover:text-amber-900"
                    )}
                  >
                    {unit.status === 'maintenance' ? (
                      <>
                        <RefreshCw className="w-3 h-3 shrink-0" />
                        <span>Reactivar</span>
                      </>
                    ) : (
                      <>
                        <Wrench className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>Mantenimiento</span>
                      </>
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingUnit(unit);
                      setEditNumber(unit.number);
                    }}
                    title="Editar número de unidad"
                    className="h-8 px-2.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 rounded-xl gap-1 transition-all shadow-2xs leading-none"
                  >
                    <Pencil className="w-3 h-3 shrink-0" />
                    <span>Editar</span>
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={() => setUnitToDelete(unit)}
                    title="Eliminar unidad"
                    className="h-8 px-2.5 text-xs font-bold text-rose-600 bg-rose-50/60 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 rounded-xl gap-1 transition-all shadow-2xs leading-none"
                  >
                    <Trash2 className="w-3 h-3 shrink-0" />
                    <span>Eliminar</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Grid Cards Mode */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUnits.map((unit) => (
              <div
                key={unit.id}
                className={cn(
                  "bg-white p-5 rounded-3xl border shadow-sm transition-all space-y-4",
                  unit.status === 'in_pantano'
                    ? "border-rose-200 bg-rose-50/20"
                    : unit.status === 'in_route'
                    ? "border-blue-200"
                    : "border-gray-100"
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shrink-0">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      {editingUnit?.id === unit.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={editNumber}
                            onChange={(e) => setEditNumber(e.target.value)}
                            className="h-8 text-sm w-36 font-bold"
                            placeholder="Nº unidad"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateNumber(unit);
                              if (e.key === 'Escape') setEditingUnit(null);
                            }}
                          />
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            onClick={() => handleUpdateNumber(unit)} 
                            className="h-8 w-8 p-0 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg shrink-0"
                            title="Guardar cambio"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => setEditingUnit(null)} 
                            className="h-8 w-8 p-0 text-gray-400 hover:bg-gray-100 rounded-lg shrink-0"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <h4 className="text-base font-black text-gray-900 tracking-tight">{unit.number}</h4>
                      )}
                      <div className="mt-1">{getStatusBadge(unit.status)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <Button
                      variant="ghost"
                      onClick={() => handleToggleMaintenance(unit)}
                      title={unit.status === 'maintenance' ? 'Reactivar unidad' : 'Enviar a mantenimiento'}
                      className={cn(
                        "h-9 px-3 text-xs font-bold rounded-xl border gap-1.5 transition-all shadow-xs leading-none",
                        unit.status === 'maintenance'
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                          : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 hover:text-amber-900"
                      )}
                    >
                      {unit.status === 'maintenance' ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                          <span>Reactivar</span>
                        </>
                      ) : (
                        <>
                          <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Mantenimiento</span>
                        </>
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditingUnit(unit);
                        setEditNumber(unit.number);
                      }}
                      title="Editar número de unidad"
                      className="h-9 px-3 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 rounded-xl gap-1.5 transition-all shadow-xs leading-none"
                    >
                      <Pencil className="w-3.5 h-3.5 shrink-0" />
                      <span>Editar</span>
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={() => setUnitToDelete(unit)}
                      title="Eliminar unidad"
                      className="h-9 px-3 text-xs font-bold text-rose-600 bg-rose-50/60 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 rounded-xl gap-1.5 transition-all shadow-xs leading-none"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Eliminar</span>
                    </Button>
                  </div>
                </div>

                {/* Details / Pending Jabas */}
                <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 p-2.5 rounded-2xl">
                    <span className="text-gray-400 block text-[10px]">Jabas en Tránsito</span>
                    <span className="font-bold text-gray-800">
                      JV: <span className="text-emerald-600">{unit.jvPending || 0}</span> | JN: <span className="text-gray-800">{unit.jnPending || 0}</span>
                    </span>
                  </div>
                  <div className="bg-gray-50 p-2.5 rounded-2xl">
                    <span className="text-gray-400 block text-[10px]">Último Chofer</span>
                    <span className="font-medium text-gray-700 truncate block">
                      {unit.lastDriverName || 'Sin asignar'}
                    </span>
                  </div>
                </div>

                {unit.lastRouteName && (
                  <p className="text-[11px] text-gray-500">
                    <span className="font-medium">Ruta reciente:</span> {unit.lastRouteName}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {unitToDelete && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white p-6 rounded-3xl max-w-sm w-full space-y-4 shadow-xl"
            >
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-3 bg-rose-50 rounded-2xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-gray-900">¿Eliminar Unidad?</h4>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                ¿Estás seguro de eliminar la unidad <span className="font-bold text-gray-800">{unitToDelete.number}</span>? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setUnitToDelete(null)}>
                  Cancelar
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeleteUnit} className="bg-rose-600 hover:bg-rose-700 text-white border-0">
                  Eliminar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
