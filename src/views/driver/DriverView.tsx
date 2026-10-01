import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Truck, Plus, Package, Navigation, ArrowLeft, Clock, MapPin, Calendar, Banknote, CreditCard, X, Phone, AlertTriangle, ClipboardList, ShieldCheck, Box } from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { Button, Input, cn } from '../../components/ui';
import { OSMMap } from '../../components/OSMMap';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Order, DeliveryRoute, UserProfile, Product, Unit } from '../../types';
import { sortOrdersByWindowAndDistance } from '../../lib/utils';
import { getOrderContainerSummary, calculateItemEstimatedJabas, calculateOrderEstimatedJabas } from '../../lib/containers';

export function DriverView({ 
  orders, 
  routes,
  profile, 
  products, 
  units = [],
  onBack: _onBack,
  onNewOrderClick,
  showToast,
  initialTab = 'pending'
}: { 
  orders: Order[]; 
  routes: DeliveryRoute[]; 
  profile: UserProfile | null; 
  products: Product[]; 
  units?: Unit[];
  onBack: () => void; 
  onNewOrderClick: () => void; 
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void; 
  initialTab?: 'pending' | 'history'; 
}) {
  if (!profile) return null;
  
  const myRoutes = routes.filter(r => r.driverId === profile.uid);
  const activeRoutes = myRoutes.filter(r => {
    if (r.status === 'in_progress') return true;
    if (r.status === 'active') {
      const routeOrders = orders.filter(o => (r.orderIds?.includes(o.id) || o.routeId === r.id) && o.status !== 'cancelled');
      if (routeOrders.length === 0) return false;
      return routeOrders.every(o => o.onboarded === true);
    }
    return false;
  });
  const finishedRoutes = myRoutes.filter(r => r.status === 'completed');

  const readyOrders = orders.filter(o => {
    if (o.status !== 'shipped' || o.onboarded !== true) return false;
    const route = activeRoutes.find(r => r.id === o.routeId || r.orderIds?.includes(o.id));
    return !!route;
  });

  const historyOrders = orders.filter(o => {
    if (o.status !== 'delivered') return false;
    const route = finishedRoutes.find(r => r.id === o.routeId || r.orderIds?.includes(o.id)) || activeRoutes.find(r => r.id === o.routeId || r.orderIds?.includes(o.id));
    return !!route;
  }).slice(0, 50);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  const selectedRoute = routes.find(r => r.id === selectedRouteId);

  const startRoute = async (route: DeliveryRoute) => {
    try {
      await updateDoc(doc(db, 'routes', route.id), { 
        status: 'in_progress',
        updatedAt: serverTimestamp()
      });
      showToast(`Ruta ${route.name} iniciada`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${route.id}`);
    }
  };

  const finishRoute = async (route: DeliveryRoute) => {
    const routeOrders = orders.filter(o => o.routeId === route.id);
    const pendingOrders = routeOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
    
    if (pendingOrders.length > 0) {
      showToast(`No puedes finalizar la ruta. Aún hay ${pendingOrders.length} pedidos pendientes de entrega.`, 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'routes', route.id), { 
        status: 'completed',
        updatedAt: serverTimestamp()
      });

      // Al finalizar la ruta, la unidad pasa a estado "in_pantano" hasta que sea recibida y conciliada en bodega
      if (route.unitNumber) {
        try {
          const unitsSnap = await getDocs(query(collection(db, 'units'), where('number', '==', route.unitNumber.trim())));
          if (!unitsSnap.empty) {
            const unitDoc = unitsSnap.docs[0];
            await updateDoc(doc(db, 'units', unitDoc.id), {
              status: 'in_pantano',
              lastDriverId: route.driverId || profile.uid,
              lastDriverName: profile.name,
              lastRouteId: route.id,
              lastRouteName: route.name,
              updatedAt: serverTimestamp()
            });
          }
        } catch (unitErr) {
          console.warn("Could not update unit status to in_pantano on route completion:", unitErr);
        }
      }

      setSelectedRouteId(null);
      showToast(`Ruta ${route.name} finalizada exitosamente. Unidad marcada en Pantano para recepción de jabas.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${route.id}`);
    }
  };

  const confirmArrival = async (order: Order) => {
    const route = routes.find(r => r.id === order.routeId);
    if (!route || route.status !== 'in_progress') {
      showToast("No puedes confirmar llegada si la ruta no ha sido iniciada.", 'error');
      return;
    }
    try {
      setSelectedOrder({ ...order, arrivedAt: new Date() as unknown as Order['arrivedAt'] });
      
      await updateDoc(doc(db, 'orders', order.id), { 
        arrivedAt: serverTimestamp()
      });
      showToast("Llegada confirmada. El cliente ahora puede revisar su pedido.", 'success');
      
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Repartidor ha llegado',
        message: `Tu repartidor ha llegado. Por favor revisa tus productos. Si hay algún inconveniente, puedes solicitar una devolución ahora.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const confirmReview = async (order: Order) => {
    try {
      setSelectedOrder({ ...order, reviewedAt: new Date() as unknown as Order['reviewedAt'] });
      
      await updateDoc(doc(db, 'orders', order.id), { 
        reviewedAt: serverTimestamp()
      });
      showToast("Mercancía confirmada como revisada.", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const collectPayment = async (order: Order) => {
    try {
      setSelectedOrder({ ...order, paymentStatus: 'paid' });
      
      await updateDoc(doc(db, 'orders', order.id), { 
        paymentStatus: 'paid'
      });
      showToast("Pago registrado correctamente. El cliente ahora puede ver su código.", 'success');
      
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Pago Confirmado',
        message: `Tu pago para el pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido registrado. Ya puedes entregar el código al repartidor.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const deliverOrder = async (order: Order) => {
    if (verificationCode.toUpperCase() !== order.pickupCode.toUpperCase()) {
      showToast("Código de verificación incorrecto", 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'orders', order.id), { 
        status: 'delivered',
        deliveredAt: serverTimestamp()
      });
      setSelectedOrder(null);
      setVerificationCode('');
      showToast("Pedido entregado correctamente", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const rawFilteredOrders = (initialTab === 'pending' ? readyOrders : historyOrders).filter(o => 
    !selectedRouteId || o.routeId === selectedRouteId
  );
  const displayedOrders = initialTab === 'pending' ? sortOrdersByWindowAndDistance(rawFilteredOrders) : rawFilteredOrders;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <Truck className="w-6 h-6 text-red-600" />
            {initialTab === 'pending' ? 'Mis Rutas y Entregas' : 'Historial de Entregas'}
          </h2>
          {initialTab === 'pending' && (
            <button 
              onClick={onNewOrderClick}
              className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-red-100 flex items-center gap-2 hover:bg-red-700 transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-bold">Venta Ruta</span>
            </button>
          )}
        </div>

        {!selectedRouteId && initialTab === 'pending' && (
          <div className="space-y-3">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Rutas Asignadas</h3>
            {activeRoutes.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-3xl border border-dashed border-gray-200">
                <Package className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No tienes rutas asignadas actualmente</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeRoutes.map(route => {
                const routeActiveOrders = orders.filter(o => (route.orderIds?.includes(o.id) || o.routeId === route.id) && o.status !== 'cancelled');
                const routePendingOrders = routeActiveOrders.filter(o => o.status !== 'delivered');
                const countToShow = routePendingOrders.length;

                const activeJv = routeActiveOrders.reduce((sum, o) => sum + (o.jvCount || 0), 0);
                const activeJn = routeActiveOrders.reduce((sum, o) => sum + (o.jnCount || 0), 0);
                const totalJv = route.containerVale ? route.containerVale.jvOut : activeJv;
                const totalJn = route.containerVale ? route.containerVale.jnOut : activeJn;
                const totalJabas = totalJv + totalJn;
                const matchedUnit = units.find(u => u.number?.trim().toUpperCase() === (route.unitNumber || '').trim().toUpperCase());

                return (
                  <div key={route.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2.5 rounded-xl",
                          route.status === 'in_progress' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                        )}>
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900">{route.name}</h4>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">
                            Unidad: {route.unitNumber || 'No asignada'} {matchedUnit ? `(${matchedUnit.status === 'in_route' ? 'En ruta' : 'Asignada'})` : ''}
                          </p>
                        </div>
                      </div>
                      <span className={cn(
                        "text-[8px] px-2 py-0.5 rounded-full font-black uppercase",
                        route.status === 'in_progress' ? "bg-green-600 text-white" : "bg-blue-600 text-white"
                      )}>
                        {route.status === 'in_progress' ? 'En Curso' : 'Preparada'}
                      </span>
                    </div>

                    {/* Container / Vale badge for driver */}
                    {totalJabas > 0 && (
                      <div className="bg-amber-50/80 rounded-xl p-2.5 border border-amber-200/80 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Box className="w-4 h-4 text-amber-700 shrink-0" />
                          <span className="font-bold text-amber-950">Jabas a Bordo:</span>
                        </div>
                        <div className="flex items-center gap-2 font-black">
                          <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">{totalJv} JV</span>
                          <span className="text-gray-800 bg-gray-200 px-2 py-0.5 rounded-md">{totalJn} JN</span>
                          <span className="text-amber-900 bg-amber-200 px-2 py-0.5 rounded-md">Total: {totalJabas}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button 
                        className="flex-1 text-xs h-9" 
                        variant={route.status === 'in_progress' ? 'outline' : 'default'}
                        onClick={() => setSelectedRouteId(route.id)}
                      >
                        Ver {countToShow} {countToShow === 1 ? 'Pedido y Cliente' : 'Pedidos y Clientes'}
                      </Button>
                      {route.status === 'active' && (
                        <Button className="bg-green-600 hover:bg-green-700 text-xs h-9" onClick={() => startRoute(route)}>
                          Iniciar Ruta
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </div>
        )}

        {selectedRouteId && (
          <div className="space-y-4">
            <div className="p-4 bg-white rounded-3xl text-gray-900 border border-gray-100 space-y-4 shadow-xl">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedRouteId(null)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-900">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h3 className="font-bold text-lg">{selectedRoute?.name}</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">
                      Unidad: {selectedRoute?.unitNumber || 'S/N'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className={cn(
                    "text-[8px] px-2 py-0.5 rounded-full font-black uppercase text-white",
                    selectedRoute?.status === 'in_progress' ? "bg-green-500" : "bg-blue-500"
                  )}>
                    {selectedRoute?.status === 'in_progress' ? 'En Curso' : 'Preparada'}
                  </span>
                </div>
              </div>

              {/* Driver Vale digital container summary banner */}
              {(() => {
                if (!selectedRoute) return null;
                const selRouteActiveOrders = orders.filter(o => (selectedRoute.orderIds?.includes(o.id) || o.routeId === selectedRoute.id) && o.status !== 'cancelled');
                const selActiveJv = selRouteActiveOrders.reduce((sum, o) => sum + (o.jvCount || 0), 0);
                const selActiveJn = selRouteActiveOrders.reduce((sum, o) => sum + (o.jnCount || 0), 0);
                const selTotalJv = selectedRoute.containerVale ? selectedRoute.containerVale.jvOut : selActiveJv;
                const selTotalJn = selectedRoute.containerVale ? selectedRoute.containerVale.jnOut : selActiveJn;
                const selTotalJabas = selTotalJv + selTotalJn;

                if (selTotalJabas === 0) return null;

                return (
                  <div className="bg-amber-50 rounded-2xl p-3.5 border border-amber-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-700" />
                        Vale Digital de Jabas en Unidad
                      </span>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-full">
                        {selTotalJabas} Jabas Totales
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900">
                      Transportas <strong className="text-emerald-800">{selTotalJv} Jabas Verdes (JV)</strong> y <strong className="text-gray-900">{selTotalJn} Negras (JN)</strong>. Inventario Karey conciliará este mismo vale al finalizar tu viaje.
                    </p>
                  </div>
                );
              })()}

              {selectedRoute?.status === 'active' ? (
                <Button className="w-full bg-green-500 hover:bg-green-600 h-10 font-bold text-white" onClick={() => startRoute(selectedRoute)}>
                  INICIAR RUTA AHORA
                </Button>
              ) : selectedRoute?.status === 'in_progress' && (
                <Button variant="outline" className="w-full border-green-500 text-green-500 hover:bg-green-500/10 h-10 font-bold" onClick={() => finishRoute(selectedRoute)}>
                  FINALIZAR RUTA Y ENTREGAR EN BODEGA
                </Button>
              )}
            </div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Listado de Pedidos y Destinos</h3>
          </div>
        )}

      </div>

      {(selectedRouteId || initialTab === 'history') && (
        <div className="space-y-4">
          {initialTab === 'pending' && displayedOrders.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 text-[11px] text-blue-900 font-semibold shadow-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Itinerario secuencial: <strong>Ventana de entrega</strong> y <strong>menor distancia</strong></span>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-lg border border-blue-200">
                {displayedOrders.length} paradas
              </span>
            </div>
          )}
          {displayedOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
              <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No hay pedidos {initialTab === 'pending' ? 'para entregar en esta ruta' : 'en el historial'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedOrders.map((order, index) => {
              const containerSummary = getOrderContainerSummary(order);
              return (
                <div 
                  key={order.id} 
                  onClick={() => setSelectedOrder(order)}
                  className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3 cursor-pointer hover:border-blue-200 transition-colors relative"
                >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {initialTab === 'pending' && (
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black shrink-0 shadow-xs">
                        {index + 1}
                      </span>
                    )}
                    <h4 className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</h4>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded font-bold uppercase",
                      order.status === 'shipped' ? "bg-indigo-100 text-indigo-700" : "bg-green-100 text-green-700"
                    )}>
                      {order.status === 'shipped' ? 'En Ruta' : 'Entregado'}
                    </span>
                    {order.deliveredAt && order.status === 'delivered' && (
                      <span className="text-[8px] text-gray-400">Entregado: {order.deliveredAt.toDate ? order.deliveredAt.toDate().toLocaleTimeString() : ''}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-900 font-black">{order.userName}</p>
                    {containerSummary.hasJaba ? (
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
                        <Box className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                        {(containerSummary.jvCount || 0) + (containerSummary.jnCount || 0)} Jaba(s) ({containerSummary.jvCount || 0} JV / {containerSummary.jnCount || 0} JN)
                      </span>
                    ) : (
                      <span className="text-[9px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                        🛍️ En Bolsa
                      </span>
                    )}
                  </div>
                  <div className="flex items-start gap-2 text-[10px] text-gray-500">
                    <MapPin className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                    <span className="truncate">{order.address}</span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {order.deliveryDistance && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 flex items-center gap-1">
                        <Navigation className="w-2.5 h-2.5 text-blue-600" />
                        {order.deliveryDistance.toFixed(1)} km
                      </span>
                    )}
                    {order.deliveryWindowStart && order.deliveryWindowEnd && (
                      <div className="flex items-center gap-1.5 text-[9px] text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                        <Calendar className="w-3 h-3 text-indigo-600 shrink-0" />
                        <span>Ventana: {order.deliverySlot?.split(' ')[0]} ({order.deliveryWindowStart} - {order.deliveryWindowEnd})</span>
                      </div>
                    )}
                  </div>

                  {order.status === 'delivered' && (
                    <div className="flex justify-between items-center mt-2 p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold">
                         {order.paymentMethod === 'cash' ? (
                           <>
                             <Banknote className="w-3 h-3 text-green-600" />
                             <span className="text-green-700">Cobrar: ${order.total.toFixed(2)}</span>
                           </>
                         ) : (
                           <>
                             <CreditCard className="w-3 h-3 text-blue-600" />
                             <span className="text-blue-700">Pagado</span>
                           </>
                         )}
                      </div>
                      <span className="text-[10px] text-gray-400">{order.items.length} productos</span>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl">Entrega: #{selectedOrder.id.slice(-6).toUpperCase()}</h3>
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl space-y-2">
                  <p className="text-xs text-gray-400 font-bold uppercase">Cliente</p>
                  <p className="font-bold text-gray-900">{selectedOrder.userName}</p>
                  <p className="text-sm text-gray-500">{selectedOrder.address}</p>
                  {selectedOrder.deliveryWindowStart && selectedOrder.deliveryWindowEnd && (
                    <div className="flex items-center gap-2 text-[10px] text-blue-700 bg-blue-100/30 px-3 py-1.5 rounded-full border border-blue-200/50 mt-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="font-bold tracking-tight">ENTREGA: {selectedOrder.deliverySlot?.split(' ')[0]} ({selectedOrder.deliveryWindowStart} - {selectedOrder.deliveryWindowEnd})</span>
                    </div>
                  )}
                  {selectedOrder.location && (
                    <div className="space-y-2 pt-2">
                      <div className="h-40 w-full rounded-2xl overflow-hidden border border-gray-100 shadow-sm relative bg-gray-100">
                        <OSMMap
                          center={selectedOrder.location}
                          customerLocation={selectedOrder.location}
                          zoom={15}
                          isDraggable={false}
                          className="w-full h-full"
                        />
                      </div>
                      
                      <button 
                        type="button"
                        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98]"
                        onClick={() => {
                          const fullAddr = selectedOrder.address?.trim() || (selectedOrder.location ? `${selectedOrder.location.lat},${selectedOrder.location.lng}` : '');
                          if (fullAddr) {
                            window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddr)}`, '_blank');
                          }
                        }}
                      >
                        <Navigation className="w-4 h-4 text-white" />
                        <span>Abrir Navegación GPS (Dirección Completa)</span>
                      </button>
                    </div>
                  )}
                  {selectedOrder.userPhone && (
                    <div className="pt-2 flex items-center justify-between border-t border-gray-100">
                      <span className="text-xs text-gray-500 font-medium">Teléfono:</span>
                      <a 
                        href={`tel:${selectedOrder.userPhone}`} 
                        className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100"
                      >
                        <Phone className="w-3 h-3" />
                        {selectedOrder.userPhone}
                      </a>
                    </div>
                  )}
                </div>

                {/* Packaging & Jaba Recovery Notice */}
                {(() => {
                  const summary = getOrderContainerSummary(selectedOrder);
                  if (summary.hasJaba) {
                    return (
                      <div className="p-3.5 bg-amber-50/90 rounded-2xl border border-amber-200 space-y-1.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
                            <Box className="w-4 h-4 text-amber-700 shrink-0" />
                            <span>Pedido con Jabas Retornables</span>
                          </div>
                          {(summary.jvCount > 0 || summary.jnCount > 0) && (
                            <span className="text-[10px] font-black bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full border border-amber-300">
                              <span className="text-emerald-800">{summary.jvCount || 0} JV</span> • <span className="text-gray-900">{summary.jnCount || 0} JN</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-amber-800">
                          Recuerda vaciar el producto al cliente o recoger una jaba de intercambio. Las jabas están amparadas bajo tu vale digital de salida y deben devolverse a bodega.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-[11px] text-gray-600 flex items-center gap-2">
                      <span>🛍️</span>
                      <span>Este pedido está completamente empacado en bolsas desechables.</span>
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-bold uppercase ml-1">Productos</p>
                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
                    {selectedOrder.items.map((item, i) => {
                      const product = products.find(p => p.id === item.productId);
                      return (
                        <div key={i} className="flex items-center gap-3 p-2">
                          {product?.imageUrl ? (
                            <img src={product.imageUrl} className="w-8 h-8 rounded-lg object-cover bg-gray-50 flex-shrink-0" alt={item.name} referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                              <Package className="w-4 h-4 text-gray-300" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-gray-900 truncate">{item.name}</p>
                              {(() => {
                                const itemEst = calculateItemEstimatedJabas(item);
                                if (item.packaging === 'jaba_negra' || (item.packaging !== 'bolsa' && itemEst.isJaba && itemEst.type === 'jn')) {
                                  return (
                                    <span className="text-[9px] bg-gray-900 text-white font-bold px-1.5 py-0.2 rounded border border-gray-800 flex items-center gap-0.5">
                                      ⚫ Jaba Negra (JN)
                                    </span>
                                  );
                                }
                                if (item.packaging === 'jaba_verde' || item.packaging === 'jaba' || (item.packaging !== 'bolsa' && itemEst.isJaba && itemEst.type === 'jv')) {
                                  return (
                                    <span className="text-[9px] bg-emerald-100 text-emerald-900 font-bold px-1.5 py-0.2 rounded border border-emerald-300 flex items-center gap-0.5">
                                      🟢 Jaba Verde (JV)
                                    </span>
                                  );
                                }
                                return (
                                  <span className="text-[9px] bg-gray-100 text-gray-600 font-medium px-1.5 py-0.2 rounded">
                                    🛍️ Bolsa
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="flex flex-col">
                              {item.unit === 'Kg' ? (
                                <>
                                  <p className="text-[10px] text-gray-500">
                                    P: ${(item.price).toFixed(2)} / Kg
                                  </p>
                                  <p className="text-[10px] text-blue-600 font-bold">
                                    F: {(item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)).toFixed(2)} Kg
                                  </p>
                                </>
                              ) : (
                                <p className="text-[10px] text-gray-500">{item.quantity}x ${(item.price).toFixed(2)}</p>
                              )}
                              {(item.comment || item.notes) && (
                                <p className="text-[10px] text-amber-800 italic mt-0.5">
                                  💬 "{item.comment || item.notes}"
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-gray-700">
                              ${(item.unit === 'Kg' 
                                ? (item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)))
                                : (item.price * item.quantity)).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-bold text-gray-900">${((selectedOrder.adjustedTotal ?? selectedOrder.total) - (selectedOrder.deliveryFee || 0)).toFixed(2)}</span>
                  </div>
                  {(selectedOrder.deliveryFee || 0) > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Envío</span>
                      <span className="font-bold text-gray-900">${(selectedOrder.deliveryFee || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">IVA Incluido (16%)</span>
                    <span className="font-bold text-gray-900">${((selectedOrder.adjustedTotal ?? selectedOrder.total) - ((selectedOrder.adjustedTotal ?? selectedOrder.total) / 1.16)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-lg font-bold text-gray-400 uppercase">TOTAL</span>
                    <span className="text-2xl font-black text-gray-900">
                      ${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="pt-4 space-y-3">
                  {selectedOrder.status === 'shipped' ? (
                    <>
                      {!selectedOrder.arrivedAt ? (
                        <div className="space-y-3">
                          {(() => {
                            const orderRoute = routes.find(r => r.id === selectedOrder.routeId);
                            const isRouteInProgress = orderRoute?.status === 'in_progress';
                            return (
                              <>
                                {!isRouteInProgress && (
                                  <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center gap-2 text-xs font-bold animate-pulse">
                                    <AlertTriangle className="w-4 h-4" />
                                    Debes iniciar la ruta para confirmar llegada
                                  </div>
                                )}
                                <Button 
                                  className={cn(
                                    "w-full h-14 shadow-lg text-lg font-bold flex items-center justify-center gap-2",
                                    isRouteInProgress ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-300 cursor-not-allowed"
                                  )} 
                                  onClick={() => confirmArrival(selectedOrder)}
                                  disabled={!isRouteInProgress}
                                >
                                  <MapPin className="w-6 h-6" />
                                  <span>He llegado con el cliente</span>
                                </Button>
                              </>
                            );
                          })()}
                        </div>
                      ) : !selectedOrder.reviewedAt ? (
                        <Button 
                          className="w-full h-14 bg-orange-600 hover:bg-orange-700 shadow-lg text-lg font-bold flex items-center justify-center gap-2" 
                          onClick={() => confirmReview(selectedOrder)}
                        >
                          <ClipboardList className="w-6 h-6" />
                          <span>Mercancía Revisada por Cliente</span>
                        </Button>
                      ) : selectedOrder.paymentMethod === 'cash' && selectedOrder.paymentStatus === 'pending' ? (
                        <div className="space-y-4">
                              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-center gap-3">
                                <Banknote className="w-8 h-8 text-emerald-600" />
                                <div>
                                  <p className="text-xs text-emerald-600 font-bold uppercase">Pago en Efectivo</p>
                                  <p className="text-xl font-black text-gray-900">${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}</p>
                                </div>
                              </div>
                          <Button 
                            className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 text-lg font-bold flex items-center justify-center gap-2" 
                            onClick={() => collectPayment(selectedOrder)}
                          >
                            <Banknote className="w-6 h-6" />
                            <span>Cobrar Efectivo</span>
                          </Button>
                          <p className="text-[10px] text-center text-gray-400 italic">
                            Al cobrar, se habilitará el código de entrega para el cliente.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Código de Verificación</label>
                              <Input 
                                placeholder="Ingresa el código del cliente"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value)}
                                className="text-center font-black tracking-widest text-lg"
                                autoFocus
                              />
                          </div>
    
                          <Button 
                            className="w-full h-12 bg-green-600 hover:bg-green-700" 
                            onClick={() => deliverOrder(selectedOrder)}
                            disabled={!verificationCode}
                          >
                            Marcar como Entregado
                          </Button>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-2xl text-center space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase">Estado del Pedido</p>
                      <p className={cn(
                        "font-black text-lg",
                        selectedOrder.status === 'delivered' ? "text-green-600" : "text-red-600"
                      )}>
                        {selectedOrder.status === 'delivered' ? 'COMPLETADO' : 'CANCELADO'}
                      </p>
                      {selectedOrder.deliveredAt && (
                        <p className="text-[10px] text-gray-400">
                          Finalizado el {selectedOrder.deliveredAt.toDate ? selectedOrder.deliveredAt.toDate().toLocaleString() : new Date((selectedOrder.deliveredAt as unknown as { seconds: number }).seconds * 1000).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
