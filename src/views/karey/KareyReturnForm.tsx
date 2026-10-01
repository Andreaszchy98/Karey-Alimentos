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
  Clock, 
  DollarSign, 
  CheckCircle2
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button, Input, cn } from '../../components/ui';
import { Unit, ContainerMovement, UserProfile, AppSettings, ToastType } from '../../types';

export function KareyReturnForm({
  units,
  movements,
  currentUser,
  appSettings,
  onBack,
  onReturnReconciled,
  showToast
}: {
  units: Unit[];
  movements: ContainerMovement[];
  currentUser: UserProfile;
  appSettings?: AppSettings;
  onBack: () => void;
  onReturnReconciled?: (movement: ContainerMovement, unit: Unit) => void;
  showToast: (msg: string, type?: ToastType) => void;
}) {
  const [selectedMovementId, setSelectedMovementId] = useState('');
  const [jvIn, setJvIn] = useState<number | ''>('');
  const [jnIn, setJnIn] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const containerCost = appSettings?.containerUnitCost || 150;

  // Active or pantano movements
  const activeMovements = useMemo(() => {
    return movements.filter(m => m.status === 'active' || m.status === 'pantano');
  }, [movements]);

  const selectedMovement = useMemo(() => {
    return activeMovements.find(m => m.id === selectedMovementId);
  }, [activeMovements, selectedMovementId]);

  const correspondingUnit = useMemo(() => {
    if (!selectedMovement) return null;
    return units.find(u => u.id === selectedMovement.unitId);
  }, [units, selectedMovement]);

  // When movement is selected, prefill jvIn and jnIn with expected numbers
  const handleSelectMovement = (movId: string) => {
    setSelectedMovementId(movId);
    const mov = activeMovements.find(m => m.id === movId);
    if (mov) {
      setJvIn(mov.jvOut);
      setJnIn(mov.jnOut);
    } else {
      setJvIn('');
      setJnIn('');
    }
  };

  // Missing calculation
  const calculations = useMemo(() => {
    if (!selectedMovement) return { jvMissing: 0, jnMissing: 0, totalMissing: 0, missingAmount: 0 };
    const jvActualIn = typeof jvIn === 'number' ? jvIn : 0;
    const jnActualIn = typeof jnIn === 'number' ? jnIn : 0;

    const jvMissing = Math.max(0, selectedMovement.jvOut - jvActualIn);
    const jnMissing = Math.max(0, selectedMovement.jnOut - jnActualIn);
    const totalMissing = jvMissing + jnMissing;
    const missingAmount = totalMissing * containerCost;

    return { jvMissing, jnMissing, totalMissing, missingAmount };
  }, [selectedMovement, jvIn, jnIn, containerCost]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMovement) {
      showToast('Selecciona un vale activo a conciliar', 'error');
      return;
    }

    const jvActualIn = typeof jvIn === 'number' ? jvIn : 0;
    const jnActualIn = typeof jnIn === 'number' ? jnIn : 0;

    setIsSaving(true);
    try {
      const updatedMovementPayload: Partial<ContainerMovement> = {
        status: 'completed',
        jvIn: jvActualIn,
        jnIn: jnActualIn,
        entryTime: serverTimestamp(),
        reconciledBy: currentUser.uid,
        reconciledByName: currentUser.name,
        notes: notes ? (selectedMovement.notes ? `${selectedMovement.notes} | Cierre: ${notes}` : notes) : selectedMovement.notes,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'containerMovements', selectedMovement.id), updatedMovementPayload);

      // Reconcile unit: if there are other unclosed movements for this unit, check if still pantano
      const otherUnclosed = activeMovements.filter(m => m.unitId === selectedMovement.unitId && m.id !== selectedMovement.id);
      const nextUnitStatus = otherUnclosed.length > 0 ? 'in_pantano' : 'available';

      const updatedUnitPayload: Partial<Unit> = {
        status: nextUnitStatus,
        currentMovementId: otherUnclosed.length > 0 ? otherUnclosed[0].id : '',
        jvPending: otherUnclosed.reduce((acc, curr) => acc + curr.jvOut, 0),
        jnPending: otherUnclosed.reduce((acc, curr) => acc + curr.jnOut, 0),
        updatedAt: serverTimestamp()
      };

      if (correspondingUnit) {
        await updateDoc(doc(db, 'units', correspondingUnit.id), updatedUnitPayload);
      }

      const reconciledMov = { ...selectedMovement, ...updatedMovementPayload } as ContainerMovement;
      const reconciledUnit = correspondingUnit ? { ...correspondingUnit, ...updatedUnitPayload } as Unit : ({} as Unit);

      if (onReturnReconciled) {
        onReturnReconciled(reconciledMov, reconciledUnit);
      }

      if (calculations.totalMissing > 0) {
        showToast(
          `Vale ${selectedMovement.folio} cerrado con ${calculations.totalMissing} faltante(s) ($${calculations.missingAmount} MXN)`,
          'warning'
        );
      } else {
        showToast(`Vale ${selectedMovement.folio} conciliado exitosamente sin faltantes`, 'success');
      }

      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `containerMovements/${selectedMovement.id}`);
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
          <h2 className="text-xl font-bold text-gray-900">Registrar Retorno y Cierre de Vale</h2>
          <p className="text-xs text-gray-500">Conteo de jabas devueltas por el chofer y liquidación de viaje</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        {/* Step 1: Select Active Movement */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-blue-600" />
            1. Seleccionar Vale / Unidad en Tránsito *
          </label>

          {activeMovements.length === 0 ? (
            <div className="p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center text-xs text-gray-400">
              No hay viajes ni vales de jabas activos pendientes de retorno.
            </div>
          ) : (
            <select
              value={selectedMovementId}
              onChange={(e) => handleSelectMovement(e.target.value)}
              className="w-full h-11 px-3 text-sm bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">-- Seleccionar Vale Activo --</option>
              {activeMovements.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.folio} | {m.unitNumber} | Chofer: {m.driverName} ({m.jvOut} JV / {m.jnOut} JN) {m.status === 'pantano' ? '[PANTANO]' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Selected Movement Summary Card */}
        {selectedMovement && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase text-blue-800 tracking-wider">Detalles de Salida</span>
                <h4 className="font-black text-base text-gray-900">{selectedMovement.folio}</h4>
              </div>
              <span className="px-2.5 py-1 bg-blue-600 text-white font-bold text-xs rounded-xl">
                Unidad: {selectedMovement.unitNumber}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-400 block text-[10px]">Chofer Responsable</span>
                <span className="font-bold text-gray-800">{selectedMovement.driverName}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Hora de Salida</span>
                <span className="font-medium text-gray-700">
                  {selectedMovement.exitTime
                    ? new Date((selectedMovement.exitTime.seconds || 0) * 1000).toLocaleString('es-MX', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })
                    : 'N/A'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-blue-100 flex items-center justify-between text-xs font-bold text-blue-950">
              <span>Salieron:</span>
              <span>
                <span className="text-emerald-700">{selectedMovement.jvOut} JV (Verdes)</span>
                <span className="text-gray-400 mx-2">•</span>
                <span className="text-gray-900">{selectedMovement.jnOut} JN (Negras)</span>
              </span>
            </div>
          </motion.div>
        )}

        {/* Step 2: Return Count Inputs */}
        {selectedMovement && (
          <div className="space-y-4">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-4 h-4 text-blue-600" />
              2. Conteo de Jabas Físicas que Regresan *
            </label>

            <div className="grid grid-cols-2 gap-4">
              {/* Return Green Crates (JV) */}
              <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">Jabas Verdes (JV)</span>
                  <span className="text-[10px] text-emerald-700 font-medium">Salieron: {selectedMovement.jvOut}</span>
                </div>
                <Input
                  type="number"
                  min="0"
                  max={selectedMovement.jvOut}
                  value={jvIn}
                  onChange={(e) => setJvIn(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                  className="text-lg font-black text-emerald-900 bg-white"
                  required
                />
              </div>

              {/* Return Black Crates (JN) */}
              <div className="bg-gray-100 p-4 rounded-2xl border border-gray-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900">Jabas Negras (JN)</span>
                  <span className="text-[10px] text-gray-600 font-medium">Salieron: {selectedMovement.jnOut}</span>
                </div>
                <Input
                  type="number"
                  min="0"
                  max={selectedMovement.jnOut}
                  value={jnIn}
                  onChange={(e) => setJnIn(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                  className="text-lg font-black text-gray-900 bg-white"
                  required
                />
              </div>
            </div>

            {/* Reconciliation Warning or Clean Banner */}
            {calculations.totalMissing > 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-5 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-rose-600 text-white rounded-xl">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-rose-900">
                      Faltante Detectado: {calculations.totalMissing} Jabas
                    </h4>
                    <p className="text-xs text-rose-700 mt-0.5">
                      Faltan {calculations.jvMissing} JV y {calculations.jnMissing} JN respecto a lo entregado.
                    </p>
                  </div>
                </div>

                <div className="bg-white/80 p-3 rounded-xl flex items-center justify-between border border-rose-200 text-xs">
                  <span className="font-bold text-rose-900">Importe a Descontar en Nómina:</span>
                  <span className="text-base font-black text-rose-600">
                    ${calculations.missingAmount.toLocaleString('es-MX')} MXN
                  </span>
                </div>
                <p className="text-[10px] text-rose-600 italic">
                  * Este registro quedará grabado en el balance histórico del chofer para liquidación correspondiente.
                </p>
              </motion.div>
            ) : (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="text-xs font-bold">
                  ¡Retorno Completo! Todas las jabas salientes coinciden con las recibidas físicamente.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {selectedMovement && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-gray-400" />
              Observaciones de Cierre
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo del faltante, estado de jabas rotas, comentarios del chofer..."
              rows={2}
              className="w-full p-3 text-sm bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        )}

        {/* Submit Buttons */}
        <div className="flex gap-3 pt-4 border-t border-gray-100">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1 rounded-2xl">
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSaving || !selectedMovement}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl gap-2 font-bold shadow-lg shadow-blue-200"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Confirmar y Cerrar Vale
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
