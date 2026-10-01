import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, RotateCcw, AlertTriangle, Package } from 'lucide-react';
import { serverTimestamp, doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { Return, Product, ToastType } from '../../types';
import { processReturnStockResolution, calculateWasteLossValue } from '../../lib/inventory';

export function AdminReturnsView({ 
  returns, 
  products,
  onBack,
  showToast,
  onRefresh
}: { 
  returns: Return[]; 
  products: Product[];
  onBack: () => void;
  showToast: (msg: string, type?: ToastType) => void;
  onRefresh?: () => void;
}) {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const handleProcessReturn = async (ret: Return, resolution: 'waste' | 'stock') => {
    setIsProcessing(ret.id);
    try {
      const updateData: Partial<Return> = {
        resolution,
        status: 'approved',
        processedAt: serverTimestamp()
      };
      
      await updateDoc(doc(db, 'returns', ret.id), updateData);

      for (const item of ret.items) {
        const product = products.find(p => p.id === item.productId);
        const currentStock = product?.stock || 0;
        const { newStock, wasteUnits } = processReturnStockResolution(currentStock, item.quantity, resolution);

        if (resolution === 'stock' && product) {
          await updateDoc(doc(db, 'products', product.id), {
            stock: newStock
          });
        } else if (resolution === 'waste') {
          const estimatedLoss = calculateWasteLossValue(product?.price || item.price || 0, wasteUnits);
          await addDoc(collection(db, 'inventoryRequests'), {
            productId: item.productId,
            productName: item.name,
            type: 'waste',
            oldValue: currentStock,
            newValue: currentStock,
            wasteUnits: wasteUnits,
            estimatedLoss: estimatedLoss,
            reason: `Devolución - Merma: ${item.reason}`,
            status: 'approved',
            requestedBy: 'system',
            requestedByName: 'Gestión Devoluciones',
            createdAt: serverTimestamp()
          });
        }
      }

      await addDoc(collection(db, 'notifications'), {
        userId: ret.userId || 'unknown',
        title: 'Devolución Procesada',
        message: `Tu devolución para el pedido #${(ret.orderId || '').slice(-6).toUpperCase()} ha sido procesada (${resolution === 'stock' ? 'Devuelta a stock' : 'Enviada a merma'}).`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });

      showToast("Devolución procesada con éxito", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `returns/${ret.id}`);
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ChevronRight className="w-6 h-6 rotate-180" />
          </Button>
          <h2 className="text-xl font-bold text-gray-900">Gestión de Devoluciones</h2>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} className="p-2 h-10 w-10 flex items-center justify-center">
          <RotateCcw className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {returns.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
            <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay devoluciones pendientes</p>
          </div>
        ) : (
          returns.map(ret => (
            <div key={ret.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 hover:shadow-md transition-shadow flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Solicitado por {ret.userName}</p>
                    <h4 className="font-bold text-gray-900">Pedido #{ret.orderId.slice(-6).toUpperCase()}</h4>
                  </div>
                  <span className={cn(
                    "text-[10px] px-2 py-1 rounded font-bold uppercase",
                    ret.status === 'approved' && ret.resolution === 'none' ? "bg-blue-100 text-blue-600" :
                    ret.status === 'approved' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                  )}>
                    {ret.status === 'approved' && ret.resolution === 'none' ? 'Pendiente Procesar' : ret.status}
                  </span>
                </div>

                <div className="space-y-3">
                  {ret.items.map((item, i) => (
                    <div key={i} className="flex gap-4 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      {item.photoUrl ? (
                        <img src={item.photoUrl} className="w-16 h-16 rounded-xl object-cover" alt="" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-gray-200 flex items-center justify-center">
                          <Package className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-bold text-gray-900">{item.quantity}x {item.name}</p>
                        <p className="text-[10px] text-gray-500 italic">"{item.reason}"</p>
                        <p className="text-xs font-bold text-blue-900">-${(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                {ret.status === 'approved' && ret.resolution === 'none' && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="col-span-2 grid grid-cols-2 gap-2">
                      <Button 
                        className="bg-green-600 hover:bg-green-700 text-white text-xs py-3 rounded-xl"
                        onClick={() => handleProcessReturn(ret, 'stock')}
                        disabled={isProcessing === ret.id}
                      >
                        Aprobar (Al Stock)
                      </Button>
                      <Button 
                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs py-3 rounded-xl"
                        onClick={() => handleProcessReturn(ret, 'waste')}
                        disabled={isProcessing === ret.id}
                      >
                        Aprobar (A Mermas)
                      </Button>
                    </div>
                  </div>
                )}

                {ret.resolution !== 'none' && (
                  <div className="pt-2 border-t border-gray-50 flex justify-between items-center text-[10px] text-gray-400">
                    <span>Procesado el {ret.processedAt?.toDate().toLocaleString()}</span>
                    <span className="font-bold uppercase">Resolución: {ret.resolution}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
