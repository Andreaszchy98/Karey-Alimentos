import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { History, RotateCcw, X, Truck, Package, CreditCard, MapPin, Info, FileText } from 'lucide-react';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { Order } from '../../types';
import { generateInvoicePDF } from '../../lib/invoice';

export function HistoryPage({ orders }: { orders: Order[] }) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const completedOrders = orders.filter((o: Order) => ['delivered', 'cancelled'].includes(o.status));

  if (completedOrders.length === 0) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <History className="w-10 h-10 text-gray-300" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Sin Historial de Pedidos</h2>
        <p className="text-gray-500">Tus pedidos anteriores aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      <h2 className="text-xl font-bold text-gray-900 mb-4">Historial de Pedidos</h2>
      {completedOrders.map((order: Order) => (
        <button 
          key={order.id} 
          onClick={() => setSelectedOrder(order)}
          className="w-full text-left bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-red-600 transition-colors"
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-gray-900">Pedido #{order.id.slice(-6).toUpperCase()}</p>
                {order.isExchange && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold uppercase">Cambio</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000).toLocaleDateString() : 'Recién'}</p>
            </div>
            <span className={cn(
              "px-2 py-1 rounded text-[10px] font-bold uppercase",
              order.status === 'delivered' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
            )}>
              {order.status === 'delivered' ? 'entregado' : 'cancelado'}
            </span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-gray-50">
            <div className="flex flex-col">
              <p className="text-sm text-gray-500">{order.items.length} artículos</p>
              {order.hasReturns && (
                <span className="flex items-center gap-1 text-[10px] text-orange-600 font-bold uppercase mt-1">
                  <RotateCcw className="w-3 h-3" />
                  Con Devoluciones
                </span>
              )}
            </div>
            <div className="text-right">
              {order.hasReturns && order.adjustedTotal !== undefined && (
                <p className="text-[10px] text-gray-400 line-through">${Number(order.total).toFixed(2)}</p>
              )}
              <p className="font-bold text-blue-900">${(order.adjustedTotal ?? order.total).toFixed(2)}</p>
            </div>
          </div>
        </button>
      ))}

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">Detalles del Pedido</h3>
                <Button variant="ghost" onClick={() => setSelectedOrder(null)} className="p-1">
                  <X className="w-6 h-6" />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">ID del Pedido</p>
                      <p className="font-bold text-gray-900 leading-none">#{selectedOrder.id.toUpperCase()}</p>
                    </div>
                    <span className={cn(
                      "text-[10px] px-2 py-1 rounded font-bold uppercase",
                      selectedOrder.status === 'delivered' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                    )}>
                      {selectedOrder.status === 'delivered' ? 'entregado' : 'cancelado'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-50 rounded-lg">
                        {selectedOrder.type === 'delivery' ? <Truck className="w-3.5 h-3.5 text-blue-600" /> : <Package className="w-3.5 h-3.5 text-blue-600" />}
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Tipo</p>
                        <p className="text-xs font-bold text-gray-700 capitalize">{selectedOrder.type === 'delivery' ? 'A Domicilio' : 'Recoger'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-green-50 rounded-lg">
                        <CreditCard className="w-3.5 h-3.5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Pago</p>
                        <p className="text-xs font-bold text-gray-700 capitalize">{selectedOrder.paymentMethod === 'cash' ? 'Efectivo' : 'Tarjeta'}</p>
                      </div>
                    </div>
                  </div>

                  {selectedOrder.type === 'delivery' && selectedOrder.address && (
                    <div className="flex items-start gap-2 pt-3 border-t border-gray-100">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Dirección</p>
                        <p className="text-xs text-gray-600 line-clamp-2 leading-tight">{selectedOrder.address}</p>
                      </div>
                    </div>
                  )}

                  {selectedOrder.notes && (
                    <div className="flex items-start gap-2 pt-3 border-t border-gray-100">
                      <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Notas</p>
                        <p className="text-xs text-gray-600 italic">"{selectedOrder.notes}"</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 font-bold uppercase ml-1">Productos</p>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, i: number) => (
                      <div key={`item-${i}`} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500 border border-gray-100">
                            {item.quantity}
                          </span>
                          <span className="text-xs font-medium text-gray-900">
                            {item.name}
                            <span className="text-[10px] text-blue-600 font-bold ml-2">
                              ${Number(item.price).toFixed(2)} / {item.unit || 'Paq'}
                            </span>
                            {item.unit === 'Kg' && (item.loaderWeight || item.preparerWeight || item.approxWeight) && (
                              <span className="text-[10px] text-gray-400 block -mt-1 italic">
                                Total: {item.loaderWeight || item.preparerWeight || (item.approxWeight ? (item.approxWeight * item.quantity).toFixed(2) : '0')} Kg
                              </span>
                            )}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-gray-900">
                          ${(item.unit === 'Kg' 
                            ? (item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)))
                            : (item.price * item.quantity)).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {(selectedOrder.returnedItems || []).map((item, i: number) => (
                      <div key={`ret-${i}`} className="flex justify-between items-center p-3 bg-orange-50/50 border border-dashed border-orange-100 rounded-xl">
                        <div className="flex items-center gap-3">
                          <RotateCcw className="w-4 h-4 text-orange-400" />
                          <span className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-orange-500 border border-orange-100">
                            {item.quantity}
                          </span>
                          <span className="text-xs font-medium text-orange-900 line-through">{item.name} (Devuelto)</span>
                        </div>
                        <span className="text-xs font-bold text-orange-900">-${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 space-y-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Subtotal</span>
                      <span>${((selectedOrder.adjustedTotal ?? selectedOrder.total) - (selectedOrder.deliveryFee || 0)).toFixed(2)}</span>
                    </div>
                    {selectedOrder.type === 'delivery' && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Envío</span>
                        <span>${(selectedOrder.deliveryFee || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {selectedOrder.hasReturns && (
                      <div className="flex justify-between text-xs text-orange-600 font-medium">
                        <span>Ajuste por Devolución</span>
                        <span>- ${(selectedOrder.total - selectedOrder.adjustedTotal!).toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-100">
                    <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                      Total
                      {selectedOrder.weightValidated && <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded ml-1">VIRTUAL</span>}
                    </span>
                    <span className="text-xl font-black text-blue-900">${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}</span>
                  </div>
                </div>

                {selectedOrder.status !== 'cancelled' && (
                  <Button 
                    variant="outline" 
                    className="w-full py-3 rounded-2xl flex items-center justify-center gap-2"
                    onClick={() => generateInvoicePDF(selectedOrder)}
                  >
                    <FileText className="w-5 h-5" />
                    Descargar Factura PDF
                  </Button>
                )}

                <div className="text-[10px] text-gray-400 text-center">
                  Fecha: {selectedOrder.createdAt?.seconds ? new Date(selectedOrder.createdAt.seconds * 1000).toLocaleString() : 'Recién'}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
