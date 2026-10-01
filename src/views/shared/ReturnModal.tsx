import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Check, Minus, Plus, Camera, Loader2 } from 'lucide-react';
import { serverTimestamp } from 'firebase/firestore';
import { uploadImage } from '../../firebase';
import { compressImageToBlob } from '../../lib/utils';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { Order, ToastType, ReturnSubmitPayload } from '../../types';

export function ReturnModal({ 
  order, 
  onClose, 
  onSubmit,
  showToast
}: { 
  order: Order; 
  onClose: () => void; 
  onSubmit: (returnData: ReturnSubmitPayload) => Promise<void>; 
  showToast: (msg: string, type?: ToastType) => void; 
}) {
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [itemPhotos, setItemPhotos] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState<Record<string, boolean>>({});

  const toggleItem = (productId: string) => {
    setSelectedItems(prev => {
      if (prev[productId]) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: 1 };
    });
  };

  const handleQtyChange = (productId: string, val: number, max: number) => {
    const qty = Math.max(1, Math.min(max, val));
    setSelectedItems(prev => ({ ...prev, [productId]: qty }));
  };

  const handleReasonChange = (productId: string, reason: string) => {
    setReasons(prev => ({ ...prev, [productId]: reason }));
  };

  const handleSubmit = async () => {
    if (Object.keys(selectedItems).length === 0) {
      showToast("Selecciona al menos un producto", 'error');
      return;
    }

    const missingReason = Object.keys(selectedItems).find(id => !reasons[id]?.trim());
    if (missingReason) {
      showToast("Por favor describe el motivo de la devolución", 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const itemsToReturn = order.items
        .filter(item => selectedItems[item.productId!])
        .map(item => ({
          productId: item.productId!,
          name: item.name,
          quantity: selectedItems[item.productId!],
          price: item.price,
          unit: item.unit || 'Paq',
          approxWeight: item.approxWeight || 0,
          reason: reasons[item.productId!],
          photoUrl: itemPhotos[item.productId!] || ""
        }));

      const totalReduction = itemsToReturn.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      await onSubmit({
        orderId: order.id || '',
        userId: order.userId || 'unknown',
        userName: order.userName || 'Usuario',
        items: itemsToReturn || [],
        totalReduction: totalReduction || 0,
        status: 'approved',
        resolution: 'none',
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[110] flex items-end sm:items-center justify-center p-4">
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-xl">Solicitar Devolución</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <p className="text-sm text-gray-500">Selecciona los productos que deseas devolver y explica el motivo.</p>

        <div className="space-y-4">
          {order.items.map((item, i) => (
            <div key={i} className={cn(
              "p-4 rounded-2xl border transition-all space-y-3",
              selectedItems[item.productId!] ? "border-red-200 bg-red-50/30" : "border-gray-100"
            )}>
              <div className="flex items-center gap-3">
                <div 
                  onClick={() => toggleItem(item.productId!)}
                  className={cn(
                    "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer",
                    selectedItems[item.productId!] ? "bg-red-500 border-red-500" : "border-gray-200"
                  )}
                >
                  {selectedItems[item.productId!] && <Check className="w-4 h-4 text-white" />}
                </div>
                <div className="flex-1">
                  <label className="text-sm font-bold text-gray-900 block cursor-pointer">
                    {item.name}
                  </label>
                  <p className="text-xs text-gray-500">${item.price.toFixed(2)} / {item.unit || 'Paq'}</p>
                </div>
              </div>

              {selectedItems[item.productId!] && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase">Cantidad</span>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleQtyChange(item.productId!, selectedItems[item.productId!] - 1, item.quantity)}
                        className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="font-bold">{selectedItems[item.productId!]}</span>
                      <button 
                        onClick={() => handleQtyChange(item.productId!, selectedItems[item.productId!] + 1, item.quantity)}
                        className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Motivo del descontento</label>
                    <textarea 
                      placeholder="Describe por qué devuelves este producto..."
                      className="w-full p-3 rounded-xl border border-gray-100 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none min-h-[80px]"
                      value={reasons[item.productId!] || ''}
                      onChange={(e) => handleReasonChange(item.productId!, e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Evidencia (Foto)</label>
                    {itemPhotos[item.productId!] ? (
                      <div className="relative w-24 h-24 group">
                        <img 
                          src={itemPhotos[item.productId!]} 
                          className="w-full h-full object-cover rounded-xl border border-gray-200"
                          alt="Evidencia"
                        />
                        <button 
                          onClick={() => setItemPhotos(prev => {
                            const next = { ...prev };
                            delete next[item.productId!];
                            return next;
                          })}
                          className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
                        {isUploading[item.productId!] ? (
                          <Loader2 className="w-5 h-5 animate-spin text-red-500" />
                        ) : (
                          <>
                            <Camera className="w-5 h-5 text-gray-400" />
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Subir Foto</span>
                          </>
                        )}
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setIsUploading(prev => ({ ...prev, [item.productId!]: true }));
                            try {
                              const blob = await compressImageToBlob(file, 800, 800, 0.7);
                              const filename = `returns/return_${order.id}_${item.productId}_${Date.now()}.jpg`;
                              const url = await uploadImage(blob, filename);
                              setItemPhotos(prev => ({ ...prev, [item.productId!]: url }));
                            } catch {
                              showToast("Error al subir foto", 'error');
                            } finally {
                              setIsUploading(prev => ({ ...prev, [item.productId!]: false }));
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-gray-100">
          <Button 
            className="w-full h-12 bg-red-600 hover:bg-red-700 font-bold"
            onClick={handleSubmit}
            disabled={isSubmitting || Object.keys(selectedItems).length === 0}
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Enviar Solicitud de Devolución"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
