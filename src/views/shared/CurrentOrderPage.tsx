import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ClipboardList, Loader2, Package, CheckCircle2, MapPin, FileText, Trash2, Edit, AlertTriangle, RotateCcw } from 'lucide-react';
import { serverTimestamp, collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { Order, ToastType, ReturnSubmitPayload } from '../../types';
import { generateInvoicePDF } from '../../lib/invoice';
import { ReturnModal } from './ReturnModal';

export function CurrentOrderPage({ 
  orders, 
  onGoHome,
  onCancelOrder,
  onModifyOrder,
  showToast
}: { 
  orders: Order[]; 
  onGoHome: () => void; 
  onCancelOrder: (orderId: string) => Promise<void>; 
  onModifyOrder: (order: Order) => void; 
  showToast: (msg: string, type?: ToastType) => void; 
}) {
  const activeOrders = orders.filter(o => ['pending', 'processing', 'ready', 'shipped'].includes(o.status));
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showConfirmModify, setShowConfirmModify] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  const handleSubmitReturn = async (returnData: ReturnSubmitPayload) => {
    try {
      await addDoc(collection(db, 'returns'), returnData);
      
      const orderToUpdate = activeOrders.find(o => o.id === returnData.orderId);
      if (orderToUpdate) {
        const isCardPayment = orderToUpdate.paymentMethod === 'card' || orderToUpdate.paymentMethod === 'online' || orderToUpdate.paymentStatus === 'paid';
        
        const currentTotal = orderToUpdate?.adjustedTotal ?? orderToUpdate?.total ?? 0;
        const newAdjustedTotal = isCardPayment ? currentTotal : Math.max(0, currentTotal - returnData.totalReduction);

        const updatedItems = orderToUpdate.items.map(item => {
          const returnedItem = returnData.items.find(ri => ri.productId === item.productId);
          if (returnedItem) {
            return { ...item, quantity: item.quantity - returnedItem.quantity };
          }
          return item;
        }).filter(item => item.quantity > 0);

        const currentReturnedItems = [...(orderToUpdate.returnedItems || [])];
        returnData.items.forEach(ri => {
          const existing = currentReturnedItems.find(e => e.productId === ri.productId);
          if (existing) {
            existing.quantity += ri.quantity;
          } else {
            currentReturnedItems.push({ ...ri });
          }
        });

        await updateDoc(doc(db, 'orders', returnData.orderId), {
          items: updatedItems,
          returnedItems: currentReturnedItems,
          hasReturns: true,
          adjustedTotal: newAdjustedTotal
        });

        if (isCardPayment) {
          const exchangePickupCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          const exchangeOrderData = {
            userId: orderToUpdate.userId || 'unknown',
            userName: orderToUpdate.userName || 'Usuario',
            userEmail: orderToUpdate.userEmail || '',
            userPhone: orderToUpdate.userPhone || '',
            items: (returnData.items || []).map((item) => ({ 
              productId: item.productId || '',
              name: item.name || 'Producto',
              quantity: item.quantity || 0,
              price: 0,
              unit: item.unit || 'Paq',
              approxWeight: item.approxWeight || 0
            })),
            total: 0,
            adjustedTotal: 0,
            status: 'pending' as const,
            paymentStatus: 'paid' as const,
            paymentMethod: orderToUpdate.paymentMethod || 'card',
            type: orderToUpdate.type || 'delivery',
            address: orderToUpdate.address || '',
            location: orderToUpdate.location && typeof orderToUpdate.location.lat === 'number' && typeof orderToUpdate.location.lng === 'number'
              ? { lat: orderToUpdate.location.lat, lng: orderToUpdate.location.lng }
              : null,
            createdAt: serverTimestamp(),
            pickupCode: exchangePickupCode,
            notes: `Cambio Físico por devolución del pedido #${(orderToUpdate.id || '').slice(-6).toUpperCase()}`,
            isExchange: true
          };

          await addDoc(collection(db, 'orders'), exchangeOrderData);

          await addDoc(collection(db, 'notifications'), {
            userId: orderToUpdate.userId || 'unknown',
            title: 'Cambio Físico Programado',
            message: `Se ha generado una nueva orden #${exchangePickupCode} sin costo por tu cambio físico. Podrás verla en tu historial.`,
            type: 'order',
            read: false,
            createdAt: serverTimestamp()
          });

          showToast("Pago con tarjeta detectado. Se ha generado una orden de cambio físico sin costo.", 'info');
        } else {
          if (orderToUpdate.driverId) {
            await addDoc(collection(db, 'notifications'), {
              userId: orderToUpdate.driverId,
              title: 'Devolución Realizada',
              message: `El cliente ha realizado una devolución para el pedido #${orderToUpdate.id.slice(-6).toUpperCase()}. El nuevo total a cobrar es $${newAdjustedTotal.toFixed(2)}.`,
              type: 'order',
              read: false,
              createdAt: serverTimestamp()
            });
          }
          showToast("Devolución realizada con éxito. Tu total ha sido actualizado.", 'success');
        }
      }

      setShowReturnModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'returns');
    }
  };

  useEffect(() => {
    if (activeOrders.length > 0) {
      const exists = activeOrders.some(o => o.id === selectedOrderId);
      if (!exists) {
        setSelectedOrderId(activeOrders[0].id);
      }
    } else {
      setSelectedOrderId(null);
    }
  }, [activeOrders, selectedOrderId]);

  const order = activeOrders.find(o => o.id === selectedOrderId) || (activeOrders.length > 0 ? activeOrders[0] : null);

  if (activeOrders.length === 0) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <ClipboardList className="w-10 h-10 text-gray-300" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Sin Pedidos Activos</h2>
        <p className="text-gray-500 mb-6">No tienes ningún pedido en curso en este momento.</p>
        <Button onClick={onGoHome}>Empezar a Comprar</Button>
      </div>
    );
  }

  const allStatuses = ['pending', 'processing', 'ready', 'shipped', 'delivered'];
  const statusLabels: Record<string, string> = {
    pending: 'pendiente',
    processing: 'procesando',
    ready: 'listo',
    shipped: 'enviado',
    delivered: 'entregado',
    cancelled: 'cancelado'
  };

  const displayStatuses = order?.type === 'pickup' 
    ? allStatuses.filter(s => s !== 'shipped')
    : allStatuses;

  const currentIdx = order ? displayStatuses.indexOf(order.status) : -1;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {activeOrders.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {activeOrders.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelectedOrderId(o.id)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border",
                selectedOrderId === o.id 
                  ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100" 
                  : "bg-white text-gray-500 border-gray-100 hover:border-red-200"
              )}
            >
              Pedido #{o.id.slice(-6).toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {order && (
        <>
          <div className="bg-[#0056b3] text-white p-6 rounded-3xl shadow-xl shadow-blue-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-blue-100 text-sm">
                  {order.isExchange ? "Cambio Físico de Pedido" : `Estado del Pedido #${order.id.slice(-6).toUpperCase()}`}
                </p>
                <h2 className="text-2xl font-bold capitalize">{statusLabels[order.status] || order.status}</h2>
              </div>
              <div className="bg-white/20 p-2 rounded-lg">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            </div>

            <div className="bg-white/10 p-4 rounded-2xl mb-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold opacity-70">
                  {order.type === 'pickup' ? 'Código de Recogida' : 'Código de Entrega'}
                </p>
                {order.type === 'pickup' && order.paymentStatus === 'pending' ? (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-blue-200">Pendiente de Pago en Tienda</p>
                    <p className="text-[10px] text-blue-100 opacity-60">Realiza tu pago en caja para recibir tu código de entrega.</p>
                  </div>
                ) : order.paymentMethod === 'cash' && order.paymentStatus === 'pending' ? (
                  <p className="text-sm font-bold text-blue-200">Pendiente de Cobro por Repartidor</p>
                ) : (
                  <p className="text-xl font-black tracking-widest">{order.pickupCode}</p>
                )}
              </div>
              <div className="p-2 bg-white rounded-xl">
                <Package className="w-6 h-6 text-[#0056b3]" />
              </div>
            </div>
            
            <div className="relative flex justify-between">
              <div className="absolute top-4 left-0 right-0 h-0.5 bg-white/20" />
              <div 
                className="absolute top-4 left-0 h-0.5 bg-white transition-all duration-1000" 
                style={{ width: `${(currentIdx / (displayStatuses.length - 1)) * 100}%` }}
              />
              {displayStatuses.map((s, i) => (
                <div key={s} className="relative z-10 flex flex-col items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                    i <= currentIdx ? "bg-white text-[#0056b3]" : "bg-blue-400 text-white"
                  )}>
                    {i < currentIdx ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
                  </div>
                  <span className="text-[10px] font-medium capitalize opacity-80">{statusLabels[s]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-4">
            <h3 className="font-bold text-gray-900">Detalles del Pedido</h3>
            <div className="space-y-3">
              {order.items.map((item, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {item.quantity}x {item.name}
                    {item.unit === 'Kg' && (item.loaderWeight || item.preparerWeight || item.approxWeight) && (
                      <span className="text-[10px] text-gray-400 block -mt-1 ml-4 italic">
                        ({item.loaderWeight || item.preparerWeight || (item.approxWeight ? (item.approxWeight * item.quantity) : 0)} Kg)
                      </span>
                    )}
                  </span>
                  <span className="font-medium text-gray-900">
                    ${(item.unit === 'Kg' 
                      ? (item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)))
                      : (item.price * item.quantity)).toFixed(2)}
                  </span>
                </div>
              ))}
              {(order.returnedItems || []).map((item, i: number) => (
                <div key={`ret-${i}`} className="flex justify-between text-sm text-orange-600 italic">
                  <span className="flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    {item.quantity}x {item.name} (Devuelto)
                  </span>
                  <span className="font-medium">-${(item.quantity * item.price).toFixed(2)}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-gray-100 space-y-1">
                {(order.deliveryFee || 0) > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Costo de Envío</span>
                    <span>${(order.deliveryFee || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-gray-600">
                  <span>IVA Incluido (16%)</span>
                  <span>${((order.adjustedTotal ?? order.total) - ((order.adjustedTotal ?? order.total) / 1.16)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-gray-100">
                  <span>Subtotal con IVA</span>
                  <span>${(order.adjustedTotal ?? order.total).toFixed(2)}</span>
                </div>
                {order.hasReturns && (
                  <div className="flex justify-between text-orange-600 font-medium">
                    <span>Descuento Devolución</span>
                    <span>-${(order.total - (order.adjustedTotal ?? order.total)).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-lg pt-1 text-[#0056b3]">
                  <span className="flex items-center gap-1">
                    Total Final
                    {order.weightValidated && <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded">PESO VALIDADO</span>}
                  </span>
                  <span>${(order.adjustedTotal ?? order.total).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-100 flex items-start gap-3">
            <MapPin className="w-5 h-5 text-[#d9534f] shrink-0" />
            <div>
              <p className="text-xs text-gray-400">{order.type === 'pickup' ? 'Lugar de Recogida' : 'Dirección de Entrega'}</p>
              <p className="text-sm font-medium text-gray-900">{order.address}</p>
            </div>
          </div>

          {order.status !== 'cancelled' && (
            <Button 
              variant="outline" 
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2"
              onClick={() => generateInvoicePDF(order)}
            >
              <FileText className="w-5 h-5" />
              Descargar Factura PDF
            </Button>
          )}

          {['pending', 'processing', 'shipped'].includes(order.status) && (
            <div className="space-y-3 pt-4 border-t border-gray-100">
              {['pending', 'processing'].includes(order.status) ? (
                <>
                  <p className="text-xs text-center text-gray-400">¿Necesitas hacer cambios? Puedes modificar o cancelar tu pedido antes de que sea despachado.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="secondary" 
                      className="rounded-2xl py-4 flex items-center justify-center gap-2 text-red-600 bg-red-50 hover:bg-red-100 border-none"
                      onClick={() => setShowConfirmCancel(true)}
                    >
                      <Trash2 className="w-5 h-5" />
                      Cancelar
                    </Button>
                    <Button 
                      variant="outline" 
                      className="rounded-2xl py-4 flex items-center justify-center gap-2 border-gray-200 text-gray-700 hover:bg-gray-50"
                      onClick={() => setShowConfirmModify(true)}
                    >
                      <Edit className="w-5 h-5" />
                      Modificar
                    </Button>
                  </div>
                </>
              ) : (
                <div className="bg-red-50 p-4 rounded-2xl flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-red-900">¿Problemas con los productos?</p>
                      <p className="text-[10px] text-red-700">Si algún producto no está en buen estado, puedes solicitar una devolución parcial ahora.</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full py-3 rounded-xl border-red-200 text-red-600 hover:bg-red-100 bg-white"
                    onClick={() => setShowReturnModal(true)}
                    disabled={!order.arrivedAt || !!order.reviewedAt}
                  >
                    Solicitar Devolución
                  </Button>
                  {!order.arrivedAt ? (
                    <p className="text-[10px] text-center text-red-400 font-medium">
                      Estará disponible cuando el repartidor confirme su llegada
                    </p>
                  ) : !order.reviewedAt ? (
                    <p className="text-[10px] text-center text-orange-500 font-medium bg-orange-50 p-2 rounded-lg">
                      El repartidor ha llegado. Por favor revisa tu pedido. Si todo está bien, infórmale al repartidor.
                    </p>
                  ) : (
                    <p className="text-[10px] text-center text-green-600 font-medium bg-green-50 p-2 rounded-lg">
                      Mercancía revisada con éxito. Procede con el pago si es necesario.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <AnimatePresence>
            {showReturnModal && (
              <ReturnModal 
                order={order}
                onClose={() => setShowReturnModal(false)}
                onSubmit={handleSubmitReturn}
                showToast={showToast}
              />
            )}
            {showConfirmCancel && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-6"
                >
                  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">¿Cancelar Pedido?</h3>
                    <p className="text-gray-500 mt-2">Esta acción no se puede deshacer. El pedido será cancelado permanentemente.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button 
                      className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold"
                      onClick={async () => {
                        setIsCancelling(true);
                        await onCancelOrder(order.id);
                        setIsCancelling(false);
                        setShowConfirmCancel(false);
                      }}
                      disabled={isCancelling}
                    >
                      {isCancelling ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Sí, Cancelar Pedido"}
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full py-4 text-gray-500 font-bold"
                      onClick={() => setShowConfirmCancel(false)}
                      disabled={isCancelling}
                    >
                      No, Mantener Pedido
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}

            {showConfirmModify && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-6"
                >
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                    <Edit className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">¿Modificar Pedido?</h3>
                    <p className="text-gray-500 mt-2">Esto cancelará el pedido actual y devolverá los productos a tu carrito para que puedas editarlos.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button 
                      className="w-full py-4 bg-[#0056b3] hover:bg-blue-700 text-white rounded-2xl font-bold"
                      onClick={() => {
                        onModifyOrder(order);
                        setShowConfirmModify(false);
                      }}
                    >
                      Sí, Modificar
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full py-4 text-gray-500 font-bold"
                      onClick={() => setShowConfirmModify(false)}
                    >
                      No, Regresar
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
