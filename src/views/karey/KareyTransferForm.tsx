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
  ArrowRightLeft, 
  FileText,
  RefreshCw
} from 'lucide-react';
import { doc, collection, serverTimestamp, getDoc, updateDoc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button, Input, cn } from '../../components/ui';
import { Unit, ContainerMovement, UserProfile, DeliveryRoute, Order, ToastType } from '../../types';

export function KareyTransferForm({
  units,
  drivers,
  routes = [],
  orders = [],
  currentUser,
  onBack,
  onTransferComplete,
  showToast
}: {
  units: Unit[];
  drivers: UserProfile[];
  routes?: DeliveryRoute[];
  orders?: Order[];
  currentUser: UserProfile;
  onBack: () => void;
  onTransferComplete?: () => void;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [sourceUnitId, setSourceUnitId] = useState('');
  const [destUnitId, setDestUnitId] = useState('');
  const [destDriverId, setDestDriverId] = useState('');
  const [jvTransfer, setJvTransfer] = useState<number | ''>('');
  const [jnTransfer, setJnTransfer] = useState<number | ''>('');
  const [transferFolio, setTransferFolio] = useState(() => `TRF-${Math.floor(100000 + Math.random() * 900000)}`);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Eligible source units: in_route, in_pantano or having pending jabas > 0
  const sourceUnits = useMemo(() => {
    return units.filter(u => (u.status === 'in_route' || u.status === 'in_pantano') || ((u.jvPending || 0) + (u.jnPending || 0) > 0));
  }, [units]);

  const selectedSourceUnit = useMemo(() => {
    return units.find(u => u.id === sourceUnitId);
  }, [units, sourceUnitId]);

  // Eligible dest units: any unit except sourceUnit
  const destUnits = useMemo(() => {
    return units.filter(u => u.id !== sourceUnitId && u.status !== 'maintenance');
  }, [units, sourceUnitId]);

  const selectedDestUnit = useMemo(() => {
    return units.find(u => u.id === destUnitId);
  }, [units, destUnitId]);

  const selectedDestDriver = useMemo(() => {
    return drivers.find(d => d.uid === destDriverId);
  }, [drivers, destDriverId]);

  // Auto-populate max transfer when source unit changes
  const handleSelectSource = (id: string) => {
    setSourceUnitId(id);
    const unit = units.find(u => u.id === id);
    if (unit) {
      setJvTransfer(unit.jvPending || 0);
      setJnTransfer(unit.jnPending || 0);
    } else {
      setJvTransfer('');
      setJnTransfer('');
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!sourceUnitId || !destUnitId || !destDriverId) {
      showToast('Selecciona la unidad origen, destino y chofer receptor', 'error');
      return;
    }

    if (sourceUnitId === destUnitId) {
      showToast('La unidad origen y destino no pueden ser iguales', 'error');
      return;
    }

    const jvCount = Number(jvTransfer) || 0;
    const jnCount = Number(jnTransfer) || 0;

    if (jvCount <= 0 && jnCount <= 0) {
      showToast('Ingresa al menos 1 jaba a traspasar', 'error');
      return;
    }

    const sourceJvPending = selectedSourceUnit?.jvPending || 0;
    const sourceJnPending = selectedSourceUnit?.jnPending || 0;

    if (jvCount > sourceJvPending || jnCount > sourceJnPending) {
      showToast('La cantidad a traspasar excede las jabas disponibles en la unidad origen', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const sourceDocRef = doc(db, 'units', sourceUnitId);
      const destDocRef = doc(db, 'units', destUnitId);

      const [sourceDoc, destDoc] = await Promise.all([
        getDoc(sourceDocRef),
        getDoc(destDocRef)
      ]);

      if (!sourceDoc.exists() || !destDoc.exists()) {
        throw new Error('Una de las unidades no existe en la base de datos');
      }

      const sourceData = sourceDoc.data() as Unit;
      const destData = destDoc.data() as Unit;

      const newSourceJv = Math.max(0, (sourceData.jvPending || 0) - jvCount);
      const newSourceJn = Math.max(0, (sourceData.jnPending || 0) - jnCount);
      const isSourceEmpty = (newSourceJv + newSourceJn) === 0;

      const newDestJv = (destData.jvPending || 0) + jvCount;
      const newDestJn = (destData.jnPending || 0) + jnCount;

      // Find active container movement associated with source unit or route
      let existingSourceMovementDocId: string | null = sourceData.currentMovementId || null;
      let existingSourceMovementData: ContainerMovement | null = null;

      if (existingSourceMovementDocId) {
        const movSnap = await getDoc(doc(db, 'containerMovements', existingSourceMovementDocId));
        if (movSnap.exists()) {
          existingSourceMovementData = { id: movSnap.id, ...movSnap.data() } as ContainerMovement;
        }
      }

      if (!existingSourceMovementData) {
        const qMov = query(
          collection(db, 'containerMovements'),
          where('unitNumber', '==', sourceData.number.trim().toUpperCase())
        );
        const qSnap = await getDocs(qMov);
        const activeDoc = qSnap.docs.find(d => ['active', 'loading', 'pantano'].includes(d.data().status));
        if (activeDoc) {
          existingSourceMovementDocId = activeDoc.id;
          existingSourceMovementData = { id: activeDoc.id, ...activeDoc.data() } as ContainerMovement;
        }
      }

      const transferNote = `[Traspaso: #${sourceData.number} (${sourceData.lastDriverName || 'N/A'}) -> #${destData.number} (${selectedDestDriver!.name}) - Motivo: ${reason || 'Reasignación operativa'}]`;

      let finalMovementId = existingSourceMovementDocId;

      if (isSourceEmpty && existingSourceMovementData && existingSourceMovementDocId) {
        // OVERWRITE existing movement: Reassign unit & driver directly without creating duplicate records
        await updateDoc(doc(db, 'containerMovements', existingSourceMovementDocId), {
          unitId: destData.id || destUnitId,
          unitNumber: destData.number,
          driverId: selectedDestDriver!.uid,
          driverName: selectedDestDriver!.name,
          jvOut: jvCount,
          jnOut: jnCount,
          notes: existingSourceMovementData.notes ? `${existingSourceMovementData.notes} | ${transferNote}` : transferNote,
          updatedAt: serverTimestamp()
        });
      } else if (isSourceEmpty && !existingSourceMovementData) {
        // If no movement document existed, create one directly for destination
        const newMovDocRef = doc(collection(db, 'containerMovements'));
        finalMovementId = newMovDocRef.id;
        await setDoc(newMovDocRef, {
          unitId: destData.id || destUnitId,
          unitNumber: destData.number,
          driverId: selectedDestDriver!.uid,
          driverName: selectedDestDriver!.name,
          folio: transferFolio.trim().toUpperCase(),
          jvOut: jvCount,
          jnOut: jnCount,
          exitTime: serverTimestamp(),
          status: 'active',
          registeredBy: currentUser.uid,
          registeredByName: currentUser.name,
          notes: `Traspaso desde Unidad #${sourceData.number}. Motivo: ${reason || 'Operativo'}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        // Partial transfer: reduce source movement count and create/update destination movement
        if (existingSourceMovementData && existingSourceMovementDocId) {
          await updateDoc(doc(db, 'containerMovements', existingSourceMovementDocId), {
            jvOut: newSourceJv,
            jnOut: newSourceJn,
            notes: existingSourceMovementData.notes ? `${existingSourceMovementData.notes} | [Parcial traspasado a #${destData.number}: ${jvCount} JV / ${jnCount} JN]` : `[Parcial traspasado a #${destData.number}: ${jvCount} JV / ${jnCount} JN]`,
            updatedAt: serverTimestamp()
          });
        }

        const newMovDocRef = doc(collection(db, 'containerMovements'));
        finalMovementId = newMovDocRef.id;
        await setDoc(newMovDocRef, {
          unitId: destData.id || destUnitId,
          unitNumber: destData.number,
          driverId: selectedDestDriver!.uid,
          driverName: selectedDestDriver!.name,
          folio: transferFolio.trim().toUpperCase(),
          jvOut: jvCount,
          jnOut: jnCount,
          exitTime: serverTimestamp(),
          status: 'active',
          registeredBy: currentUser.uid,
          registeredByName: currentUser.name,
          notes: `Traspaso parcial desde Unidad #${sourceData.number}. Motivo: ${reason || 'Operativo'}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // 1. Update source unit
      await updateDoc(sourceDocRef, {
        jvPending: newSourceJv,
        jnPending: newSourceJn,
        status: isSourceEmpty ? 'available' : sourceData.status,
        currentMovementId: isSourceEmpty ? null : sourceData.currentMovementId,
        lastRouteId: isSourceEmpty ? null : sourceData.lastRouteId,
        lastRouteName: isSourceEmpty ? null : sourceData.lastRouteName,
        updatedAt: serverTimestamp()
      });

      // 2. Update dest unit
      await updateDoc(destDocRef, {
        status: 'in_route',
        lastDriverId: selectedDestDriver!.uid,
        lastDriverName: selectedDestDriver!.name,
        currentMovementId: finalMovementId,
        lastRouteId: sourceData.lastRouteId || destData.lastRouteId || null,
        lastRouteName: sourceData.lastRouteName || destData.lastRouteName || null,
        jvPending: newDestJv,
        jnPending: newDestJn,
        updatedAt: serverTimestamp()
      });

      // 3. Find and update any active route linked to source unit
      const activeSourceRoute = routes.find(r => 
        (r.unitNumber?.trim().toUpperCase() === sourceData.number.trim().toUpperCase() || r.id === sourceData.lastRouteId) &&
        r.status !== 'completed' && r.status !== 'cancelled'
      );

      if (activeSourceRoute && isSourceEmpty) {
        await updateDoc(doc(db, 'routes', activeSourceRoute.id), {
          unitNumber: destData.number.trim().toUpperCase(),
          driverId: selectedDestDriver!.uid,
          assignedByName: selectedDestDriver!.name,
          containerVale: {
            jvOut: jvCount,
            jnOut: jnCount,
            qtyOutBy: currentUser.uid,
            qtyOutByName: currentUser.name,
            qtyOutAt: serverTimestamp(),
            unitCost: 150
          },
          updatedAt: serverTimestamp()
        });

        // Update all orders assigned to this route with the new driverId
        if (activeSourceRoute.orderIds && activeSourceRoute.orderIds.length > 0) {
          for (const orderId of activeSourceRoute.orderIds) {
            try {
              await updateDoc(doc(db, 'orders', orderId), {
                driverId: selectedDestDriver!.uid,
                updatedAt: serverTimestamp()
              });
            } catch (err) {
              console.warn(`Error updating order ${orderId} on transfer:`, err);
            }
          }
        }
      }

      showToast(`Traspaso a Unidad #${destData.number} (${selectedDestDriver!.name}) completado con éxito`, 'success');
      if (onTransferComplete) {
        onTransferComplete();
      } else {
        onBack();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `units_transfer/${sourceUnitId}`);
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
          <h2 className="text-xl font-bold text-gray-900">Traspaso de Jabas entre Unidades</h2>
          <p className="text-xs text-gray-500">Transferencia atómica de carga por descompostura o apoyo en ruta</p>
        </div>
      </div>

      <form onSubmit={handleTransfer} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        {/* Folio */}
        <div className="bg-purple-50/60 p-3.5 sm:p-4 rounded-2xl border border-purple-100/80 flex items-center justify-between gap-3 w-full">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase text-purple-800 tracking-wider block">Folio de Traspaso</span>
            <input
              type="text"
              value={transferFolio}
              onChange={(e) => setTransferFolio(e.target.value)}
              className="font-black text-base sm:text-lg text-purple-950 bg-transparent border-0 p-0 focus:ring-0 w-full truncate"
              required
            />
          </div>
          <button
            type="button"
            onClick={() => setTransferFolio(`TRF-${Math.floor(100000 + Math.random() * 900000)}`)}
            title="Regenerar Folio"
            className="p-2 text-xs text-purple-700 bg-white/90 hover:bg-white border border-purple-200 rounded-xl hover:text-purple-900 transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-purple-600" />
            <span className="hidden sm:inline text-[11px] font-medium">Regenerar</span>
          </button>
        </div>

        {/* 1. Source Unit */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-purple-600" />
            1. Unidad Origen (Averiadas o con Carga) *
          </label>
          <select
            value={sourceUnitId}
            onChange={(e) => handleSelectSource(e.target.value)}
            className="w-full h-11 px-3 text-sm bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            required
          >
            <option value="">-- Seleccionar Unidad Origen --</option>
            {sourceUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.number} (Chofer: {u.lastDriverName || 'S/D'} | {u.jvPending || 0} JV, {u.jnPending || 0} JN)
              </option>
            ))}
          </select>
        </div>

        {selectedSourceUnit && (
          <div className="p-3 bg-purple-50/40 rounded-xl border border-purple-100 flex items-center justify-between text-xs">
            <span className="text-purple-900 font-bold">Carga disponible en {selectedSourceUnit.number}:</span>
            <span className="font-bold">
              <span className="text-emerald-700">{selectedSourceUnit.jvPending || 0} JV</span>
              <span className="text-gray-400 mx-1">/</span>
              <span className="text-gray-900">{selectedSourceUnit.jnPending || 0} JN</span>
            </span>
          </div>
        )}

        {/* 2. Destination Unit & Driver */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-purple-600" />
              2. Unidad Destino (Receptora) *
            </label>
            <select
              value={destUnitId}
              onChange={(e) => setDestUnitId(e.target.value)}
              className="w-full h-11 px-3 text-sm bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            >
              <option value="">-- Seleccionar Destino --</option>
              {destUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.number} ({u.status === 'available' ? 'Disponible' : u.status})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-4 h-4 text-purple-600" />
              3. Chofer Receptor *
            </label>
            <select
              value={destDriverId}
              onChange={(e) => setDestDriverId(e.target.value)}
              className="w-full h-11 px-3 text-sm bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            >
              <option value="">-- Seleccionar Chofer / Administrador --</option>
              {drivers.map((d) => (
                <option key={d.uid} value={d.uid}>
                  {d.name} {d.role === 'admin' ? '• (Administrador)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3. Containers Quantities to Transfer */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <Package className="w-4 h-4 text-purple-600" />
            4. Cantidad de Jabas a Traspasar *
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900">Jabas Verdes (JV)</span>
                <span className="text-[10px] text-emerald-700">Máx: {selectedSourceUnit?.jvPending || 0}</span>
              </div>
              <Input
                type="number"
                min="0"
                max={selectedSourceUnit?.jvPending || 0}
                value={jvTransfer}
                onChange={(e) => setJvTransfer(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                className="text-lg font-black text-emerald-900 bg-white"
                required
              />
            </div>

            <div className="bg-gray-100 p-4 rounded-2xl border border-gray-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900">Jabas Negras (JN)</span>
                <span className="text-[10px] text-gray-600">Máx: {selectedSourceUnit?.jnPending || 0}</span>
              </div>
              <Input
                type="number"
                min="0"
                max={selectedSourceUnit?.jnPending || 0}
                value={jnTransfer}
                onChange={(e) => setJnTransfer(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                className="text-lg font-black text-gray-900 bg-white"
                required
              />
            </div>
          </div>
        </div>

        {/* Reason / Notes */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-gray-400" />
            Motivo del Traspaso
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Falla mecánica en motor, reasignación de pedidos, apoyo en zona..."
            rows={2}
            className="w-full p-3 text-sm bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-4 border-t border-gray-100">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1 rounded-2xl">
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSaving || !sourceUnitId || !destUnitId || !destDriverId}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl gap-2 font-bold shadow-lg shadow-purple-200"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            Confirmar Traspaso Atómico
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
