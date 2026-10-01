import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, RotateCcw, Package, MapPin, Calendar, Loader2, X, Truck, FileText } from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Order, UserProfile, Product, DeliveryRoute, Unit, ContainerMovement } from '../../types';
import { generateInvoicePDF } from '../../lib/invoice';
import { calculateOrderStatusInventoryDelta } from '../../lib/inventory';
import { calculateRouteContainerTotals, syncRouteContainerMovement } from '../../lib/containers';

export function AdminOrdersView({ 
  orders, 
  users, 
  products, 
  routes = [],
  units = [],
  movements = [],
  profile,
  filter = 'all', 
  selectedDate,
  onBack,
  showToast: _showToast,
  onLoadMore,
  onRefresh,
  hasMore,
  isLoading
}: { 
  orders: Order[]; 
  users: UserProfile[]; 
  products: Product[]; 
  routes?: DeliveryRoute[];
  units?: Unit[];
  movements?: ContainerMovement[];
  profile?: UserProfile;
  filter?: Order['status'] | 'all'; 
  selectedDate: string; 
  onBack: () => void; 
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void; 
  onLoadMore?: () => void; 
  onRefresh?: () => void; 
  hasMore?: boolean; 
  isLoading?: boolean; 
}) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isChangingDriver, setIsChangingDriver] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [newDriverId, setNewDriverId] = useState('');

  useEffect(() => {
    if (!selectedOrder) {
      setIsCancelling(false);
      setIsChangingDriver(false);
    }
  }, [selectedOrder]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (!o.createdAt) return false;
      const orderDate = new Date(o.createdAt.seconds * 1000).toISOString().split('T')[0];
      const matchesDate = orderDate === selectedDate;
      const matchesStatus = filter === 'all' || o.status === filter;
      return matchesDate && matchesStatus;
    });
  }, [orders, filter, selectedDate]);

  const drivers = users.filter(u => u.role === 'driver' || u.role === 'admin');

  const cancelOrder = async (order: Order) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), { 
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });

      // If the order was assigned to a route, remove it from the route and update container counts
      const assignedRoute = routes.find(r => r.orderIds?.includes(order.id) || (order.routeId && r.id === order.routeId));
      if (assignedRoute) {
        const remainingOrderIds = (assignedRoute.orderIds || []).filter(id => id !== order.id);
        await updateDoc(doc(db, 'routes', assignedRoute.id), {
          orderIds: remainingOrderIds,
          updatedAt: serverTimestamp()
        });

        // Recalculate route container totals after cancellation
        const remainingOrders = orders.filter(o => remainingOrderIds.includes(o.id) && o.id !== order.id && o.status !== 'cancelled');
        const newTotals = calculateRouteContainerTotals(assignedRoute.id, remainingOrders, undefined, { ...assignedRoute, orderIds: remainingOrderIds });

        if (newTotals.totalJabas > 0 || assignedRoute.containerVale) {
          const assignedDriver = users.find(u => u.uid === assignedRoute.driverId);
          await syncRouteContainerMovement({
            route: { ...assignedRoute, orderIds: remainingOrderIds },
            driver: assignedDriver,
            units,
            movements,
            operatorProfile: profile,
            jvCount: newTotals.totalJv,
            jnCount: newTotals.totalJn,
            notes: 'Actualizado al cancelar pedido'
          });
        }
      }
      
      for (const item of order.items) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const delta = calculateOrderStatusInventoryDelta(order.status, 'cancelled', item.quantity);
          const updates: Record<string, number> = {};
          
          if (delta.reservedDelta !== 0) {
            updates.reserved = Math.max(0, (product.reserved || 0) + delta.reservedDelta);
          }
          if (delta.stockDelta !== 0) {
            updates.stock = Math.max(0, (product.stock || 0) + delta.stockDelta);
          }
          // If the order was already physically deducted (e.g. ready/shipped/delivered), restore the physical stock
          if (['ready', 'shipped', 'delivered'].includes(order.status) && delta.stockDelta === 0) {
            updates.stock = (product.stock || 0) + item.quantity;
          }

          if (Object.keys(updates).length > 0) {
            await updateDoc(doc(db, 'products', product.id), updates);
          }
        }
      }
      
      setIsCancelling(false);
      setSelectedOrder(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const changeDriver = async (order: Order) => {
    if (!newDriverId) return;
    try {
      await updateDoc(doc(db, 'orders', order.id), { 
        driverId: newDriverId,
        status: 'shipped',
        onboarded: true
      });
      setIsChangingDriver(false);
      setNewDriverId('');
      setSelectedOrder(prev => prev ? { ...prev, driverId: newDriverId, status: 'shipped', onboarded: true } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const statusLabels: Record<string, string> = {
    all: 'Todos los Pedidos',
    pending: 'Pedidos Pendientes',
    processing: 'Pedidos en Preparación',
    ready: 'Pedidos Listos',
    shipped: 'Pedidos en Ruta',
    delivered: 'Pedidos Entregados',
    cancelled: 'Pedidos Cancelados'
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ChevronRight className="w-6 h-6 rotate-180" />
          </Button>
          <h2 className="text-xl font-bold text-gray-900">{statusLabels[filter]}</h2>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} className="p-2 h-10 w-10 flex items-center justify-center">
          <RotateCcw className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrders.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay pedidos en esta sección</p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <button 
              key={order.id} 
              onClick={() => setSelectedOrder(order)}
              className="w-full text-left bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3 hover:border-[#0056b3] hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</h4>
                  <p className="text-xs text-gray-500">{order.userName}</p>
                </div>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded font-bold uppercase",
                  order.status === 'pending' ? "bg-orange-100 text-orange-700" :
                  order.status === 'processing' ? "bg-blue-100 text-blue-700" :
                  order.status === 'ready' ? "bg-purple-100 text-purple-700" :
                  order.status === 'shipped' ? "bg-indigo-100 text-indigo-700" :
                  order.status === 'delivered' ? "bg-green-100 text-green-700" :
                  "bg-red-100 text-red-700"
                )}>
                  {order.status}
                </span>
              </div>
              <div className="flex items-start gap-2 text-[10px] text-gray-500">
                <MapPin className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                <span className="truncate">{order.address}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                <span className="text-xs text-gray-400">{order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000).toLocaleDateString() : 'Recién'}</span>
                <div className="text-right">
                  {order.hasReturns && (
                    <p className="text-[8px] text-gray-400 line-through">${order.total.toFixed(2)}</p>
                  )}
                  <p className="font-bold text-[#0056b3]">${(order.adjustedTotal ?? order.total).toFixed(2)}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button 
            variant="outline" 
            onClick={onLoadMore} 
            disabled={isLoading}
            className="w-full max-w-xs"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Cargar más pedidos"}
          </Button>
        </div>
      )}

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
                <div className="flex justify-between items-start p-4 bg-gray-50 rounded-2xl">
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">ID del Pedido</p>
                    <p className="font-bold text-gray-900">#{selectedOrder.id.toUpperCase()}</p>
                  </div>
                  <span className={cn(
                    "text-[10px] px-2 py-1 rounded font-bold uppercase",
                    selectedOrder.status === 'pending' ? "bg-orange-100 text-orange-700" :
                    selectedOrder.status === 'processing' ? "bg-blue-100 text-blue-700" :
                    selectedOrder.status === 'ready' ? "bg-purple-100 text-purple-700" :
                    selectedOrder.status === 'shipped' ? "bg-indigo-100 text-indigo-700" :
                    selectedOrder.status === 'delivered' ? "bg-green-100 text-green-700" :
                    "bg-red-100 text-red-700"
                  )}>
                    {selectedOrder.status}
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 font-bold uppercase ml-1">Cliente</p>
                  <div className="p-4 bg-white border border-gray-100 rounded-2xl space-y-1">
                    <p className="font-bold text-gray-900">{selectedOrder.userName}</p>
                    <p className="text-xs text-gray-500">{selectedOrder.userEmail}</p>
                    {selectedOrder.userPhone && <p className="text-xs text-gray-500">{selectedOrder.userPhone}</p>}
                    <div className="flex flex-col gap-2 pt-2 border-t border-gray-50 mt-2">
                      <div className="flex items-start gap-2 text-xs text-gray-500">
                        <MapPin className="w-4 h-4 text-red-500 shrink-0" />
                        <span>{selectedOrder.address}</span>
                      </div>
                      {selectedOrder.deliveryDistance && (
                        <p className="text-[10px] font-bold text-blue-600 pl-6">
                          DISTANCIA: {selectedOrder.deliveryDistance.toFixed(1)} km
                        </p>
                      )}
                    </div>
                    {selectedOrder.deliveryWindowStart && selectedOrder.deliveryWindowEnd && (
                      <div className="flex items-center gap-2 text-[10px] text-blue-700 bg-blue-50/50 p-2 rounded-xl border border-blue-100/30 mt-2">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-bold">ORDENADO P/ FECHA: {selectedOrder.deliverySlot?.split(' ')[0]} - VENTANA: {selectedOrder.deliveryWindowStart} - {selectedOrder.deliveryWindowEnd}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 font-bold uppercase ml-1">Productos</p>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, i) => {
                      const itemTotal = item.unit === 'Kg'
                        ? (item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : item.quantity)))
                        : (item.price * item.quantity);
                      return (
                        <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500 border border-gray-100">
                              {item.quantity}
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-medium text-gray-900">{item.name}</span>
                                {item.packaging === 'jaba_negra' ? (
                                  <span className="text-[9px] bg-gray-900 text-white font-bold px-1.5 py-0.2 rounded border border-gray-800">
                                    ⚫ Jaba Negra
                                  </span>
                                ) : (item.packaging === 'jaba_verde' || item.packaging === 'jaba') ? (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded border border-emerald-300">
                                    🟢 Jaba Verde
                                  </span>
                                ) : (
                                  <span className="text-[9px] bg-gray-100 text-gray-600 font-medium px-1.5 py-0.2 rounded">
                                    🛍️ Bolsa
                                  </span>
                                )}
                              </div>
                              {item.unit === 'Kg' && (
                                <span className="text-[10px] text-gray-400 block">
                                  {item.loaderWeight || item.preparerWeight 
                                    ? `Pesado: ${item.loaderWeight || item.preparerWeight} Kg` 
                                    : `Est: ${item.approxWeight ? (item.approxWeight * item.quantity).toFixed(2) : item.quantity} Kg ($${item.price.toFixed(2)}/Kg)`}
                                </span>
                              )}
                              {(item.comment || item.notes) && (
                                <span className="text-[10px] text-amber-800 italic block mt-0.5">
                                  💬 "{item.comment || item.notes}"
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs font-bold text-gray-900">${itemTotal.toFixed(2)}</span>
                        </div>
                      );
                    })}
                    {(selectedOrder.returnedItems || []).map((item, i) => {
                      const retTotal = item.unit === 'Kg'
                        ? (item.price * (item.approxWeight ? item.approxWeight * item.quantity : item.quantity))
                        : (item.price * item.quantity);
                      return (
                        <div key={`ret-${i}`} className="flex justify-between items-center p-3 bg-orange-50/50 border border-dashed border-orange-100 rounded-xl opacity-70">
                          <div className="flex items-center gap-3">
                            <RotateCcw className="w-4 h-4 text-orange-400" />
                            <span className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-orange-500 border border-orange-100">
                              {item.quantity}
                            </span>
                            <span className="text-xs font-medium text-orange-900 line-through">{item.name}</span>
                          </div>
                          <span className="text-xs font-bold text-orange-900">-${retTotal.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Subtotal Productos</span>
                    <span className="font-bold text-gray-900">${((selectedOrder.adjustedTotal ?? selectedOrder.total) - (selectedOrder.deliveryFee || 0)).toFixed(2)}</span>
                  </div>
                  {(selectedOrder.deliveryFee || 0) > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Costo de Envío</span>
                      <span className="font-bold text-gray-900">${(selectedOrder.deliveryFee || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">IVA Incluido (16%)</span>
                    <span className="font-bold text-gray-900">${((selectedOrder.adjustedTotal ?? selectedOrder.total) - ((selectedOrder.adjustedTotal ?? selectedOrder.total) / 1.16)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-gray-500">Monto sin ajustar</span>
                    <span className="font-bold text-gray-900">${selectedOrder.total.toFixed(2)}</span>
                  </div>
                  {selectedOrder.hasReturns && (
                    <div className="flex justify-between items-center py-1 text-orange-600">
                      <span className="text-sm font-medium">Descuento por Devolución</span>
                      <span className="font-bold">-${(selectedOrder.total - (selectedOrder.adjustedTotal ?? selectedOrder.total)).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                    <span className="text-sm font-bold text-gray-900">Total a Pagar</span>
                    <span className="text-xl font-black text-[#0056b3]">${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}</span>
                  </div>
                </div>

                {selectedOrder.status !== 'cancelled' && (
                  <div className="pt-4 space-y-3">
                    {isCancelling ? (
                      <div className="bg-red-50 p-4 rounded-2xl border border-red-100 space-y-3">
                        <p className="text-xs font-bold text-red-600 text-center">¿Estás seguro de que deseas cancelar este pedido?</p>
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1 bg-white" onClick={() => setIsCancelling(false)}>No, volver</Button>
                          <Button variant="secondary" className="flex-1 bg-red-600 text-white hover:bg-red-700" onClick={() => cancelOrder(selectedOrder)}>Sí, cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {['ready', 'shipped'].includes(selectedOrder.status) && (
                          <div className="space-y-2">
                            <p className="text-[10px] text-gray-400 font-bold uppercase ml-1">Gestión de Repartidor</p>
                            {isChangingDriver ? (
                              <div className="space-y-2">
                                <select 
                                  className="w-full p-3 rounded-xl border border-gray-200 text-sm"
                                  value={newDriverId}
                                  onChange={(e) => setNewDriverId(e.target.value)}
                                >
                                  <option value="">Seleccionar nuevo repartidor</option>
                                  {drivers.map(d => (
                                    <option key={d.uid} value={d.uid}>{d.name || 'Sin nombre'} ({d.role})</option>
                                  ))}
                                </select>
                                <div className="flex gap-2">
                                  <Button variant="outline" className="flex-1" onClick={() => setIsChangingDriver(false)}>Cancelar</Button>
                                  <Button className="flex-1" onClick={() => changeDriver(selectedOrder)} disabled={!newDriverId}>Confirmar</Button>
                                </div>
                              </div>
                            ) : (
                              <Button 
                                variant="outline" 
                                className="w-full h-12 flex items-center justify-center gap-2"
                                onClick={() => setIsChangingDriver(true)}
                              >
                                <Truck className="w-5 h-5" />
                                {selectedOrder.driverId ? 'Cambiar Repartidor' : 'Asignar Repartidor'}
                              </Button>
                            )}
                          </div>
                        )}
                        
                        <Button 
                          variant="secondary" 
                          className="w-full h-12 text-red-600 hover:bg-red-50 border-red-100"
                          onClick={() => setIsCancelling(true)}
                        >
                          Cancelar Pedido
                        </Button>
                      </>
                    )}
                  </div>
                )}

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
