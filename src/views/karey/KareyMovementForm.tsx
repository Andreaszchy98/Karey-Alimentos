import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  ChevronRight, 
  Truck, 
  User, 
  Package, 
  AlertTriangle, 
  Loader2, 
  Check, 
  FileText, 
  MapPin,
  RefreshCw
} from 'lucide-react';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button, Input, cn } from '../../components/ui';
import { Unit, ContainerMovement, UserProfile, DeliveryRoute, ToastType } from '../../types';
import { detectAndFlagPantano } from '../../lib/containers';

export function KareyMovementForm({
  units,
  movements,
  drivers,
  routes,
  currentUser,
  onBack,
  onMovementCreated,
  showToast
}: {
  units: Unit[];
  movements: ContainerMovement[];
  drivers: UserProfile[];
  routes: DeliveryRoute[];
  currentUser: UserProfile;
  onBack: () => void;
  onMovementCreated?: (movement: ContainerMovement, unit: Unit) => void;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [folio, setFolio] = useState(() => `KRY-${Math.floor(100000 + Math.random() * 900000)}`);
  const [jvOut, setJvOut] = useState<number | ''>('');
  const [jnOut, setJnOut] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedUnit = useMemo(() => {
    return units.find(u => u.id === selectedUnitId);
  }, [units, selectedUnitId]);

  const selectedDriver = useMemo(() => {
    return drivers.find(d => d.uid === selectedDriverId);
  }, [drivers, selectedDriverId]);

  const selectedRoute = useMemo(() => {
    return routes.find(r => r.id === selectedRouteId);
  }, [routes, selectedRouteId]);

  // Check if selected driver has an open movement (in any unit)
  const previousOpenMovement = useMemo(() => {
    if (!selectedDriverId) return null;
    return movements.find(
      m => m.driverId === selectedDriverId && (m.status === 'active' || m.status === 'loading')
    ) || null;
  }, [movements, selectedDriverId]);

  // Driver active routes
  const driverRoutes = useMemo(() => {
    if (!selectedDriverId) return [];
    return routes.filter(r => r.driverId === selectedDriverId && (r.status === 'active' || r.status === 'in_progress'));
  }, [routes, selectedDriverId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnitId || !selectedDriverId) {
      showToast('Selecciona una unidad y un chofer', 'error');
      return;
    }

    const jvCount = Number(jvOut) || 0;
    const jnCount = Number(jnOut) || 0;

    if (jvCount <= 0 && jnCount <= 0) {
      showToast('Ingresa al menos una jaba (Verde o Negra)', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // Buscar si el chofer seleccionado ya tiene un vale previo abierto sin cerrar y marcarlo en pantano
      await detectAndFlagPantano(selectedDriver!.uid, movements);

      const movementData = {
        unitId: selectedUnit!.id,
        unitNumber: selectedUnit!.number,
        driverId: selectedDriver!.uid,
        driverName: selectedDriver!.name,
        routeId: selectedRoute?.id || '',
        routeName: selectedRoute?.name || '',
        folio: folio.trim().toUpperCase(),
        jvOut: jvCount,
        jnOut: jnCount,
        exitTime: serverTimestamp(),
        status: 'active' as const,
        registeredBy: currentUser.uid,
        registeredByName: currentUser.name,
        notes: notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'containerMovements'), movementData);

      // Current unit being dispatched follows normal flow (in_route)
      const updatedUnitPayload: Partial<Unit> = {
        status: 'in_route',
        lastDriverId: selectedDriver!.uid,
        lastDriverName: selectedDriver!.name,
        lastRouteId: selectedRoute?.id || '',
        lastRouteName: selectedRoute?.name || '',
        currentMovementId: docRef.id,
        jvPending: jvCount,
        jnPending: jnCount,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'units', selectedUnit!.id), updatedUnitPayload);

      const createdMovement: ContainerMovement = {
        id: docRef.id,
        ...movementData
      } as ContainerMovement;

      const updatedUnit: Unit = {
        ...selectedUnit!,
        ...updatedUnitPayload
      } as Unit;

      if (onMovementCreated) {
        onMovementCreated(createdMovement, updatedUnit);
      }

      showToast(`Vale ${folio} registrado con éxito (${jvCount} JV / ${jnCount} JN)`, 'success');
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'containerMovements');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={onBack} className="rounded-full w-9 h-9 p-0 flex items-center justify-center">
          <ChevronRight className="w-5 h-5 rotate-180" />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Registrar Salida / Carga de Jabas</h2>
          <p className="text-xs text-gray-500">Creación de vale de salida para entrega a chofer</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        {/* Folio */}
        <div className="bg-emerald-50/60 p-3.5 sm:p-4 rounded-2xl border border-emerald-100/80 flex items-center justify-between gap-3 w-full">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider block">Folio del Vale</span>
            <input
              type="text"
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              className="font-black text-base sm:text-lg text-emerald-950 bg-transparent border-0 p-0 focus:ring-0 w-full truncate"
              required
            />
          </div>
          <button
            type="button"
            onClick={() => setFolio(`KRY-${Math.floor(100000 + Math.random() * 900000)}`)}
            title="Regenerar Folio"
            className="p-2 text-xs text-emerald-700 bg-white/90 hover:bg-white border border-emerald-200 rounded-xl hover:text-emerald-900 transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline text-[11px] font-medium">Regenerar</span>
          </button>
        </div>

        {/* Step 1: Select Unit */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-emerald-600" />
            1. Unidad / Camión *
          </label>
          <select
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            className="w-full h-11 px-3 text-sm bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            required
          >
            <option value="">-- Seleccionar Unidad --</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.number} ({unit.status === 'available' ? 'Disponible' : unit.status === 'in_pantano' ? 'EN PANTANO' : unit.status === 'in_route' ? 'En Ruta' : unit.status})
              </option>
            ))}
          </select>
        </div>

        {/* Step 2: Select Driver */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <User className="w-4 h-4 text-emerald-600" />
            2. Chofer Asignado *
          </label>
          <select
            value={selectedDriverId}
            onChange={(e) => {
              setSelectedDriverId(e.target.value);
              setSelectedRouteId('');
            }}
            className="w-full h-11 px-3 text-sm bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            required
          >
            <option value="">-- Seleccionar Chofer / Administrador --</option>
            {drivers.map((driver) => (
              <option key={driver.uid} value={driver.uid}>
                {driver.name} {driver.role === 'admin' ? '• (Administrador)' : `(${driver.email || driver.phone || 'Chofer'})`}
              </option>
            ))}
          </select>
        </div>

        {/* Pantano / Conflict Alert if driver has an open unclosed movement */}
        {previousOpenMovement && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start gap-3 text-rose-800"
          >
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <strong className="block font-bold text-rose-900">¡Alerta de Estado Pantano!</strong>
              El chofer <span className="font-bold underline">{selectedDriver?.name}</span> tiene actualmente un vale previo sin cerrar (<span className="font-mono font-bold">{previousOpenMovement.folio}</span> en la unidad #{previousOpenMovement.unitNumber}). Al despachar este nuevo vale, el vale anterior y su unidad quedarán marcados en <strong>Pantano</strong> hasta su respectiva conciliación.
            </div>
          </motion.div>
        )}

        {/* Step 2.5: Optional Route Association */}
        {driverRoutes.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-600" />
              Ruta Activa del Chofer (Opcional)
            </label>
            <select
              value={selectedRouteId}
              onChange={(e) => setSelectedRouteId(e.target.value)}
              className="w-full h-11 px-3 text-sm bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">-- Sin asociar a ruta específica --</option>
              {driverRoutes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} - Camión {r.unitNumber} ({r.orderIds.length} pedidos)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Step 3: Containers Quantity */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <Package className="w-4 h-4 text-emerald-600" />
            3. Conteo de Jabas a Entregar *
          </label>
          <div className="grid grid-cols-2 gap-4">
            {/* Green Crates (JV) */}
            <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900">Jabas Verdes (JV)</span>
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
              </div>
              <Input
                type="number"
                min="0"
                value={jvOut}
                onChange={(e) => setJvOut(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0"
                className="text-lg font-black text-emerald-900 bg-white"
              />
            </div>

            {/* Black Crates (JN) */}
            <div className="bg-gray-100 p-4 rounded-2xl border border-gray-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900">Jabas Negras (JN)</span>
                <span className="w-3 h-3 rounded-full bg-gray-900" />
              </div>
              <Input
                type="number"
                min="0"
                value={jnOut}
                onChange={(e) => setJnOut(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0"
                className="text-lg font-black text-gray-900 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-gray-400" />
            Observaciones / Notas
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Condiciones de las jabas, número de candado, etc."
            rows={2}
            className="w-full p-3 text-sm bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-4 border-t border-gray-100">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1 rounded-2xl">
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSaving || !selectedUnitId || !selectedDriverId}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl gap-2 font-bold shadow-lg shadow-emerald-200"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Confirmar y Emitir Vale
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
