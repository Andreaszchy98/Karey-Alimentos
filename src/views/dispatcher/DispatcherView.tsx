import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Truck, Plus, Edit, Trash2, Package, X, CheckCircle, Clock, Store, Calendar, ChevronUp, ChevronDown, CreditCard, Banknote, Phone, Mail, MapPin, Box, AlertTriangle } from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp, deleteDoc, deleteField } from 'firebase/firestore';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Order, DeliveryRoute, UserProfile, Product, Unit, ContainerMovement } from '../../types';
import { sortOrdersByWindowAndDistance } from '../../lib/utils';
import { calculateOrderStatusInventoryDelta } from '../../lib/inventory';
import { updateRouteUnitAndDriver, calculateRouteContainerTotals, syncRouteContainerMovement } from '../../lib/containers';

export function DispatcherView({ 
  orders, 
  routes,
  users, 
  products, 
  profile,
  units = [],
  movements = [],
  onBack: _onBack, 
  showToast,
  initialTab = 'pending'
}: { 
  orders: Order[]; 
  routes: DeliveryRoute[]; 
  users: UserProfile[]; 
  products: Product[]; 
  profile: UserProfile;
  units?: Unit[];
  movements?: ContainerMovement[];
  onBack: () => void; 
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void; 
  initialTab?: 'pending' | 'history'; 
}) {
  const [activeSubTab, setActiveSubTab] = useState<'orders' | 'routes'>('orders');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [isSavingRoute, setIsSavingRoute] = useState(false);
  const [newRouteData, setNewRouteData] = useState({ name: '', unitNumber: '', driverId: '' });

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const acceptedOrders = orders.filter(o => o.status === 'accepted');
  const historyOrders = orders.filter(o => o.status !== 'pending' && o.status !== 'accepted' && o.status !== 'processing' && o.status !== 'ready' && o.status !== 'cancelled').slice(0, 50);

  const drivers = users.filter(u => u.role === 'driver' || u.role === 'admin');

  // Filtrar unidades disponibles para el Dispatcher
  const availableUnits = useMemo(() => {
    return units.filter(u => {
      if (editingRouteId) {
        const currentRoute = routes.find(r => r.id === editingRouteId);
        if (currentRoute && currentRoute.unitNumber?.trim().toUpperCase() === u.number?.trim().toUpperCase()) {
          return true;
        }
      }
      return u.status === 'available';
    });
  }, [units, editingRouteId, routes]);

  const toggleExpand = (id: string) => {
    setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getTimingStatus = (order: Order) => {
    if (order.status === 'delivered' || order.status === 'completed' || order.status === 'cancelled') return null;
    if (!order.deliveryWindowStart) return null;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    let dateStr = "";
    if (order.type === 'pickup') {
      const match = order.deliverySlot?.match(/(\d{4}-\d{2}-\d{2})/);
      dateStr = match ? match[1] : "";
    } else {
      dateStr = order.deliverySlot?.split(' ')[0] || "";
    }

    if (!dateStr) return null;

    if (dateStr < todayStr) return { label: 'RETRASADO', color: 'red' };
    
    if (dateStr === todayStr) {
      const deadlineStr = order.type === 'pickup' ? order.deliveryWindowStart : order.deliveryWindowEnd;
      const [h, m] = deadlineStr!.split(':').map(Number);
      const deadlineTotal = h * 60 + m;
      const currentTotal = now.getHours() * 60 + now.getMinutes();

      if (currentTotal > deadlineTotal) {
        return { label: 'RETRASADO', color: 'red' };
      } else if (deadlineTotal - currentTotal <= 60) {
        return { label: 'POR VENCER', color: 'amber' };
      }
    }

    return { label: 'A TIEMPO', color: 'green' };
  };

  const saveRoute = async () => {
    if (!newRouteData.name.trim() || !newRouteData.unitNumber.trim() || !newRouteData.driverId) {
      showToast('Por favor completa todos los campos de la ruta', 'error');
      return;
    }

    // Validar disponibilidad de la unidad
    const matchedUnit = units.find(u => u.number.trim().toUpperCase() === newRouteData.unitNumber.trim().toUpperCase());
    if (matchedUnit) {
      const isCurrentRouteUnit = editingRouteId && routes.find(r => r.id === editingRouteId)?.unitNumber?.trim().toUpperCase() === matchedUnit.number.toUpperCase();
      if (!isCurrentRouteUnit && matchedUnit.status !== 'available') {
        showToast(`La unidad #${matchedUnit.number} no está disponible (Estado: ${matchedUnit.status}).`, 'error');
        return;
      }
    }

    const existingDriverRoute = routes.find(r => 
      r.driverId === newRouteData.driverId && 
      (r.status === 'active' || r.status === 'in_progress') &&
      r.id !== editingRouteId
    );

    if (existingDriverRoute) {
      showToast(`El repartidor ya tiene la ruta "${existingDriverRoute.name}" activa. Solo puede tener una ruta a la vez.`, 'error');
      return;
    }

    setIsSavingRoute(true);
    try {
      const selectedDriver = drivers.find(d => d.uid === newRouteData.driverId);
      const normalizedUnitNumber = newRouteData.unitNumber.trim().toUpperCase();

      if (editingRouteId) {
        const oldRoute = routes.find(r => r.id === editingRouteId);
        if (oldRoute) {
          await updateRouteUnitAndDriver({
            route: oldRoute,
            newUnitNumber: normalizedUnitNumber,
            newDriverId: newRouteData.driverId,
            newDriverName: selectedDriver?.name || 'Chofer Asignado',
            newRouteName: newRouteData.name,
            units,
            operatorProfile: profile
          });
        }

        showToast('Ruta y asignación de unidad/vale actualizadas con éxito', 'success');
      } else {
        const routeDocRef = await addDoc(collection(db, 'routes'), {
          ...newRouteData,
          unitNumber: normalizedUnitNumber,
          status: 'active',
          orderIds: [],
          assignedBy: profile.uid,
          assignedByName: profile.name,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        if (matchedUnit) {
          await updateDoc(doc(db, 'units', matchedUnit.id), {
            status: 'loading',
            lastDriverId: newRouteData.driverId,
            lastDriverName: selectedDriver?.name || '',
            lastRouteId: routeDocRef.id,
            lastRouteName: newRouteData.name,
            updatedAt: serverTimestamp()
          });
        }

        showToast('Ruta creada con éxito', 'success');
      }
      setShowRouteModal(false);
      setEditingRouteId(null);
      setNewRouteData({ name: '', unitNumber: '', driverId: '' });
    } catch (error) {
      handleFirestoreError(error, editingRouteId ? OperationType.UPDATE : OperationType.CREATE, editingRouteId ? `routes/${editingRouteId}` : 'routes');
    } finally {
      setIsSavingRoute(false);
    }
  };

  const deleteRoute = async (routeId: string) => {
    const route = routes.find(r => r.id === routeId);
    if (!route) return;

    const routeOrders = orders.filter(o => route.orderIds.includes(o.id));
    const isAnyOnboarded = routeOrders.some(o => o.onboarded);

    if (isAnyOnboarded) {
      showToast('No se puede eliminar una ruta que ya tiene pedidos cargados a la unidad.', 'error');
      return;
    }

    if (!window.confirm('¿Estás seguro de que deseas eliminar esta ruta? Los pedidos asignados quedarán sin ruta y el cargador deberá confirmarlos nuevamente si los asignas a otra ruta.')) {
      return;
    }

    try {
      if (route.unitNumber) {
        const assignedUnit = units.find(u => u.number.trim().toUpperCase() === route.unitNumber.trim().toUpperCase());
        if (assignedUnit && (assignedUnit.status === 'loading' || assignedUnit.status === 'in_route')) {
          await updateDoc(doc(db, 'units', assignedUnit.id), {
            status: 'available',
            updatedAt: serverTimestamp()
          });
        }
      }

      for (const orderId of route.orderIds) {
        await updateDoc(doc(db, 'orders', orderId), {
          routeId: deleteField(),
          driverId: deleteField(),
          onboarded: false
        });
      }

      await deleteDoc(doc(db, 'routes', routeId));
      showToast('Ruta eliminada con éxito', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `routes/${routeId}`);
    }
  };

  const releaseRouteToPrep = async (routeId: string) => {
    try {
      const route = routes.find(r => r.id === routeId);
      if (!route) return;

      const routeOrders = orders.filter(o => route.orderIds.includes(o.id) && o.status === 'accepted');
      if (routeOrders.length === 0) {
        showToast('No hay pedidos aceptados en esta ruta para enviar a preparación', 'info');
        return;
      }

      await updateDoc(doc(db, 'routes', routeId), {
        releasedToPrep: true,
        updatedAt: serverTimestamp()
      });

      for (const order of routeOrders) {
        await updateDoc(doc(db, 'orders', order.id), {
          status: 'processing',
          dispatchedAt: serverTimestamp(),
          dispatchedBy: profile.uid,
          dispatchedByName: profile.name
        });

        for (const item of order.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            const delta = calculateOrderStatusInventoryDelta(order.status, 'processing', item.quantity);
            if (delta.reservedDelta !== 0 || delta.stockDelta !== 0) {
              await updateDoc(doc(db, 'products', product.id), {
                reserved: Math.max(0, (product.reserved || 0) + delta.reservedDelta)
              });
            }
          }
        }
      }
      
      showToast(`${routeOrders.length} pedidos enviados a preparación en la ruta ${route.name}`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${routeId}`);
    }
  };

  const addOrderToRoute = async (orderId: string, routeId: string) => {
    try {
      const route = routes.find(r => r.id === routeId);
      if (!route) return;

      const existingRoute = routes.find(r => r.orderIds.includes(orderId));
      if (existingRoute && existingRoute.id !== routeId) {
        const remainingExistingIds = existingRoute.orderIds.filter(id => id !== orderId);
        await updateDoc(doc(db, 'routes', existingRoute.id), {
          orderIds: remainingExistingIds,
          updatedAt: serverTimestamp()
        });

        // Sync old route's container vale if it had one
        const remainingOrders = orders.filter(o => remainingExistingIds.includes(o.id));
        const oldTotals = calculateRouteContainerTotals(existingRoute.id, remainingOrders, undefined, { ...existingRoute, orderIds: remainingExistingIds });
        if (oldTotals.totalJabas > 0 || existingRoute.containerVale) {
          const oldDriver = users.find(u => u.uid === existingRoute.driverId);
          await syncRouteContainerMovement({
            route: { ...existingRoute, orderIds: remainingExistingIds },
            driver: oldDriver,
            units,
            movements,
            operatorProfile: profile,
            jvCount: oldTotals.totalJv,
            jnCount: oldTotals.totalJn,
            notes: 'Actualizado al transferir pedido a otra ruta'
          });
        }
      }

      const order = orders.find(o => o.id === orderId);
      const orderUpdates: Partial<Order> = { 
        routeId: routeId,
        driverId: route.driverId,
        onboarded: false
      };

      if (route.releasedToPrep && order && order.status === 'accepted') {
        orderUpdates.status = 'processing';
        
        for (const item of order.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            const delta = calculateOrderStatusInventoryDelta(order.status, 'processing', item.quantity);
            if (delta.reservedDelta !== 0 || delta.stockDelta !== 0) {
              await updateDoc(doc(db, 'products', product.id), {
                reserved: Math.max(0, (product.reserved || 0) + delta.reservedDelta)
              });
            }
          }
        }
      }

      await updateDoc(doc(db, 'orders', orderId), orderUpdates);

      const newOrderIds = route.orderIds.includes(orderId) ? route.orderIds : [...route.orderIds, orderId];
      if (!route.orderIds.includes(orderId)) {
        await updateDoc(doc(db, 'routes', routeId), {
          orderIds: newOrderIds,
          updatedAt: serverTimestamp()
        });
      }

      // Recalculate route container totals including the added order
      const updatedRouteOrders = orders.map(o => o.id === orderId ? { ...o, ...orderUpdates } as Order : o);
      const newTotals = calculateRouteContainerTotals(routeId, updatedRouteOrders, undefined, { ...route, orderIds: newOrderIds });

      if (newTotals.totalJabas > 0 || route.containerVale) {
        const assignedDriver = users.find(u => u.uid === route.driverId);
        await syncRouteContainerMovement({
          route: { ...route, orderIds: newOrderIds },
          driver: assignedDriver,
          units,
          movements,
          operatorProfile: profile,
          jvCount: newTotals.totalJv,
          jnCount: newTotals.totalJn,
          notes: 'Actualizado al agregar pedido a la ruta'
        });
      }

      showToast('Pedido agregado a la ruta', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const removeOrderFromRoute = async (orderId: string, routeId: string) => {
    try {
      const route = routes.find(r => r.id === routeId);
      if (!route) return;

      await updateDoc(doc(db, 'orders', orderId), { 
        routeId: deleteField(),
        driverId: deleteField(),
        onboarded: false
      });

      const updatedOrderIds = route.orderIds.filter(id => id !== orderId);
      await updateDoc(doc(db, 'routes', routeId), {
        orderIds: updatedOrderIds,
        updatedAt: serverTimestamp()
      });

      // Recalculate route container totals after removing order
      const remainingOrders = orders.filter(o => updatedOrderIds.includes(o.id));
      const remainingTotals = calculateRouteContainerTotals(routeId, remainingOrders, undefined, { ...route, orderIds: updatedOrderIds });

      if (remainingTotals.totalJabas > 0 || route.containerVale) {
        const assignedDriver = users.find(u => u.uid === route.driverId);
        await syncRouteContainerMovement({
          route: { ...route, orderIds: updatedOrderIds },
          driver: assignedDriver,
          units,
          movements,
          operatorProfile: profile,
          jvCount: remainingTotals.totalJv,
          jnCount: remainingTotals.totalJn,
          notes: 'Actualizado al remover pedido de la ruta'
        });
      }

      showToast('Pedido removido de la ruta', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const acceptOrder = async (order: Order) => {
    try {
      let nextStatus: Order['status'] = 'accepted';
      const route = order.routeId ? routes.find(r => r.id === order.routeId) : null;
      
      if (order.type === 'pickup' || route?.releasedToPrep) {
        nextStatus = 'processing';
        for (const item of order.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            const delta = calculateOrderStatusInventoryDelta(order.status, 'processing', item.quantity);
            if (delta.reservedDelta !== 0 || delta.stockDelta !== 0) {
              await updateDoc(doc(db, 'products', product.id), {
                reserved: Math.max(0, (product.reserved || 0) + delta.reservedDelta)
              });
            }
          }
        }
      }

      await updateDoc(doc(db, 'orders', order.id), { 
        status: nextStatus,
        dispatchedAt: serverTimestamp(),
        dispatchedBy: profile.uid,
        dispatchedByName: profile.name
      });
      
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Pedido Aceptado',
        message: nextStatus === 'processing' 
          ? `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido aceptado y está en preparación.`
          : `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido aceptado y está pendiente de asignación a ruta.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });
      showToast(nextStatus === 'processing' ? 'Pedido aceptado y enviado a preparación' : 'Pedido aceptado', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const rawPendingOrders = [...pendingOrders, ...acceptedOrders];
  const displayedOrders = initialTab === 'pending' ? sortOrdersByWindowAndDistance(rawPendingOrders) : historyOrders;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 border-l-4 border-red-600 pl-4">
            {initialTab === 'pending' ? 'Despacho de Pedidos' : 'Historial de Despachos'}
          </h2>
          {initialTab === 'pending' && (
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button 
                onClick={() => setActiveSubTab('orders')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeSubTab === 'orders' ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                Pedidos
              </button>
              <button 
                onClick={() => setActiveSubTab('routes')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeSubTab === 'routes' ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                Rutas
              </button>
            </div>
          )}
        </div>
      </div>

      {initialTab === 'pending' && activeSubTab === 'routes' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-700">Rutas de Entrega Activas</h3>
            <Button onClick={() => setShowRouteModal(true)} className="text-xs h-9 flex items-center justify-center">
              <Plus className="w-4 h-4 mr-1.5" />
              Nueva Ruta
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {routes.filter(r => r.status === 'active').length === 0 ? (
              <div className="md:col-span-2 xl:col-span-3 text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No hay rutas activas</p>
              </div>
            ) : (
              routes.filter(r => r.status === 'active').map(route => {
                const routeOrders = orders.filter(o => (route.orderIds?.includes(o.id) || o.routeId === route.id) && o.status !== 'cancelled');
                const driver = users.find(u => u.uid === route.driverId);
                return (
                  <div key={route.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-lg">
                          <Truck className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-gray-900">{route.name}</h4>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => {
                                  setEditingRouteId(route.id);
                                  setNewRouteData({ name: route.name, unitNumber: route.unitNumber, driverId: route.driverId });
                                  setShowRouteModal(true);
                                }}
                                className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-blue-600 transition-colors"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => deleteRoute(route.id)}
                                className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-500">Unidad: {route.unitNumber} • Driver: {driver?.name || 'Desconocido'}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full uppercase">Activa</span>
                    </div>
                    <div className="p-4 flex-1 space-y-3">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Pedidos en esta ruta ({routeOrders.length})</p>
                      </div>
                      {routeOrders.length === 0 ? (
                        <p className="text-xs text-gray-400 italic text-center py-4">Sin pedidos asignados</p>
                      ) : (
                        <div className="space-y-2">
                          {routeOrders.map(order => (
                            <div key={order.id} className="flex justify-between items-center p-2 bg-white rounded-xl border border-gray-100 text-xs shadow-sm">
                              <div className="flex items-center gap-2">
                                <Package className="w-3.5 h-3.5 text-gray-400" />
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-gray-700">#{order.id.slice(-6).toUpperCase()}</span>
                                    {order.onboarded && (
                                      <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded font-bold uppercase">Cargado</span>
                                    )}
                                    {getTimingStatus(order) && (
                                      <span className={cn(
                                        "text-[7px] px-1 rounded font-black uppercase tracking-tighter",
                                        getTimingStatus(order)?.color === 'red' ? "bg-red-500 text-white" : 
                                        getTimingStatus(order)?.color === 'amber' ? "bg-amber-400 text-amber-900" : 
                                        "bg-emerald-500 text-white"
                                      )}>
                                        {getTimingStatus(order)?.label}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-gray-500">{order.userName}</span>
                                    <span className="text-[8px] text-gray-400 opacity-70">• {
                                      order.status === 'pending' ? 'Pendiente' : 
                                      order.status === 'accepted' ? 'Aceptado' : 
                                      order.status === 'processing' ? 'Prep' : 'Listo'
                                    }</span>
                                  </div>
                                  {order.deliveryWindowStart && order.deliveryWindowEnd && (
                                    <div className="flex items-center gap-1 text-[8px] text-blue-600 font-bold mt-0.5">
                                      <Calendar className="w-2.5 h-2.5" />
                                      <span>{order.deliverySlot?.split(' ')[0]} ({order.deliveryWindowStart} - {order.deliveryWindowEnd})</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {!order.onboarded && (
                                <button 
                                  onClick={() => removeOrderFromRoute(order.id, route.id)}
                                  className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-3">
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1">Agregar Pedido a Ruta</p>
                        <select 
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all font-medium appearance-none"
                          onChange={(e) => {
                            if (e.target.value) {
                              addOrderToRoute(e.target.value, route.id);
                              e.target.value = "";
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Seleccionar pedido...</option>
                          {orders
                            .filter(o => ['pending', 'accepted', 'processing', 'ready'].includes(o.status) && (!o.routeId || !o.onboarded) && o.type !== 'pickup')
                            .map(o => (
                              <option key={o.id} value={o.id} disabled={o.routeId === route.id}>
                                #{o.id.slice(-6).toUpperCase()} - {o.userName} ({
                                  o.status === 'pending' ? 'P' : 
                                  o.status === 'accepted' ? 'A' : 
                                  o.status === 'processing' ? 'Prep' : 'L'
                                }) {o.routeId && o.routeId !== route.id ? ' (REASIGNAR)' : ''}
                              </option>
                            ))
                          }
                        </select>
                      </div>
                      
                      {!route.releasedToPrep && routeOrders.length > 0 && (
                        <Button 
                          className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-xs font-bold shadow-md shadow-blue-100" 
                          onClick={() => releaseRouteToPrep(route.id)}
                        >
                          Lanzar a Preparación
                        </Button>
                      )}
                      {route.releasedToPrep && (
                        <div className="flex items-center justify-center gap-2 p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase">Lanzada a Preparación</span>
                        </div>
                      )}

                      {/* Vale de Jabas Karey Section (Informational Only - Managed by Karey Inventory) */}
                      {route.containerVale && ((route.containerVale.jvOut || 0) + (route.containerVale.jnOut || 0) > 0) ? (
                        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/80 text-xs space-y-2 mt-2 text-amber-900">
                          <div className="flex items-center justify-between font-bold">
                            <div className="flex items-center gap-1.5">
                              <Box className="w-4 h-4 text-amber-700" />
                              <span>Jabas Karey en Unidad</span>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded font-black bg-amber-200 text-amber-900 uppercase">
                              Control Karey
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-medium pt-1">
                            <div>
                              <span className="text-gray-500 block text-[10px]">Cargadas en Salida:</span>
                              <span className="font-bold text-amber-950">
                                <span className="text-emerald-700">{route.containerVale.jvOut || 0} JV</span> • <span className="text-gray-900">{route.containerVale.jnOut || 0} JN</span>
                              </span>
                            </div>
                            <span className="text-[10px] text-amber-700 italic">
                              Recepción y conteo por Inventario Karey
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {initialTab === 'pending' && displayedOrders.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 text-[11px] text-blue-900 font-semibold shadow-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Orden prioritario: <strong>Ventana de entrega más próxima</strong> y <strong>menor distancia</strong></span>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-lg border border-blue-200">
                {displayedOrders.length} pedidos
              </span>
            </div>
          )}
          {displayedOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No hay pedidos {initialTab === 'pending' ? 'pendientes' : 'en el historial'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedOrders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-4">
                <div className="flex justify-between items-start gap-2">
                  <div onClick={() => toggleExpand(order.id)} className="cursor-pointer flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <h4 className="font-bold text-gray-900 text-sm">#{order.id.slice(-6).toUpperCase()}</h4>
                      
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase inline-flex items-center gap-1 shrink-0",
                        order.type === 'pickup' 
                          ? "bg-blue-100 text-blue-700 border border-blue-200" 
                          : "bg-orange-100 text-orange-700 border border-orange-200"
                      )}>
                        {order.type === 'pickup' ? <Store className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
                        {order.type === 'pickup' ? 'Recoger en Tienda' : 'A Domicilio'}
                      </span>

                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0",
                        order.status === 'pending' ? "bg-amber-100 text-amber-800 border border-amber-200" : 
                        order.status === 'accepted' ? "bg-purple-100 text-purple-700 border border-purple-200" :
                        order.status === 'processing' ? "bg-blue-100 text-blue-700 border border-blue-200" :
                        order.status === 'ready' ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                        "bg-green-100 text-green-700"
                      )}>
                        {order.status === 'pending' ? 'Pendiente' : 
                         order.status === 'accepted' ? 'Aceptado' : 
                         order.status === 'processing' ? 'En Prep' : 
                         order.status === 'ready' ? 'Listo' : order.status}
                      </span>

                      {getTimingStatus(order) && (
                        <div className={cn(
                          "flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter shrink-0",
                          getTimingStatus(order)?.color === 'red' ? "bg-red-100 text-red-600 border border-red-200" : 
                          getTimingStatus(order)?.color === 'amber' ? "bg-amber-100 text-amber-600 border border-amber-200" : 
                          "bg-emerald-50 text-emerald-600 border border-emerald-100"
                        )}>
                          <Clock className="w-2.5 h-2.5" />
                          {getTimingStatus(order)?.label}
                        </div>
                      )}

                      {order.routeId && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
                          Ruta: {routes.find(r => r.id === order.routeId)?.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-medium">{order.userName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <p className="text-[10px] text-gray-400 font-medium">
                        {order.items.length} productos • ${order.total.toFixed(2)}
                        {order.deliveryDistance && ` • ${order.deliveryDistance.toFixed(1)} km`}
                      </p>
                      {order.deliveryWindowStart && order.deliveryWindowEnd && (
                        <div className="flex items-center gap-1 text-[9px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                          <Calendar className="w-2.5 h-2.5" />
                          <span>{order.deliverySlot?.split(' ')[0]} ({order.deliveryWindowStart} - {order.deliveryWindowEnd})</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {initialTab === 'pending' && order.status === 'pending' && (
                      <Button 
                        className="text-xs py-1.5 px-3.5 h-9 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-sm flex items-center gap-1.5 shrink-0" 
                        onClick={(e) => {
                          e.stopPropagation();
                          acceptOrder(order);
                        }}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Aceptar
                      </Button>
                    )}
                    <button 
                      onClick={() => toggleExpand(order.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                    >
                      {expandedOrders[order.id] ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </button>
                  </div>
                </div>

                {/* Quick Info Bar */}
                <div className="flex flex-wrap gap-4 p-2 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium">
                    {order.paymentMethod === 'card' ? <CreditCard className="w-3.5 h-3.5 text-blue-500" /> : <Banknote className="w-3.5 h-3.5 text-green-500" />}
                    <span>{order.paymentMethod === 'card' ? 'Tarjeta' : 'Efectivo'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium border-l border-gray-200 pl-4">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      order.paymentStatus === 'paid' ? "bg-green-500" : "bg-orange-500"
                    )} />
                    <span>{order.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}</span>
                  </div>
                  {order.routeId && (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium border-l border-gray-200 pl-4">
                      <Truck className="w-3.5 h-3.5 text-purple-500" />
                      <span>{routes.find(r => r.id === order.routeId)?.name || 'Ruta'} (Unidad {routes.find(r => r.id === order.routeId)?.unitNumber})</span>
                    </div>
                  )}
                </div>

                {expandedOrders[order.id] && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4 pt-2 border-t border-gray-50"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tiempos</p>
                        <div className="flex flex-col gap-1">
                          <p className="text-[10px] text-gray-600">Creado: {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : 'N/A'}</p>
                          {order.dispatchedAt && (
                            <p className="text-[10px] text-blue-600 font-bold">
                              Despachado: {order.dispatchedAt.toDate().toLocaleString()}{order.dispatchedByName ? ` · ${order.dispatchedByName}` : ''}
                            </p>
                          )}
                          {order.preparedAt && (
                            <p className="text-[10px] text-green-600">
                              Preparado: {order.preparedAt.toDate().toLocaleString()}{order.preparedByName ? ` · ${order.preparedByName}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contacto</p>
                        <div className="flex items-center gap-2">
                          <Phone className="w-3 h-3 text-gray-400" />
                          <p className="text-xs text-gray-900 font-medium">{order.userPhone || 'Sin teléfono'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="w-3 h-3 text-gray-400" />
                          <p className="text-[10px] text-gray-500 truncate">{order.userEmail}</p>
                        </div>
                      </div>
                    </div>

                    {order.type === 'delivery' && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Dirección de Entrega</p>
                        <div className="flex items-start gap-2 p-2 bg-orange-50 rounded-lg border border-orange-100">
                          <MapPin className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-gray-700 leading-relaxed font-medium">{order.address}</p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Detalle de Productos</p>
                      <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100">
                        {order.items.map((item, i) => {
                          const product = products.find(p => p.id === item.productId);
                          const available = product ? product.stock - product.reserved : 0;
                          const isLowStock = available < item.quantity;
                          
                          return (
                            <div key={i} className="flex justify-between items-center">
                              <span className="text-xs text-gray-600 font-medium truncate pr-4">
                                {item.quantity}x {item.name}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                  isLowStock ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                                  )}>
                                  Disp: {available} pzas
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {order.type === 'delivery' && (order.status === 'accepted' || order.status === 'processing' || order.status === 'ready') && initialTab === 'pending' && (
                      <div className="pt-2 border-t border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 ml-1">Asignar a Ruta</p>
                        <div className="flex gap-2">
                          <select 
                            className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all font-medium"
                            onChange={(e) => {
                              if (e.target.value) {
                                addOrderToRoute(order.id, e.target.value);
                              } else {
                                const currentRoute = routes.find(r => r.orderIds.includes(order.id));
                                if (currentRoute) removeOrderFromRoute(order.id, currentRoute.id);
                              }
                            }}
                            value={order.routeId || ""}
                          >
                            <option value="">-- Sin ruta asignada --</option>
                            {routes.filter(r => r.status === 'active').map(r => (
                              <option key={r.id} value={r.id}>{r.name} ({r.unitNumber})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            ))}
            </div>
          )}
        </div>
      )}

      {/* New Route Modal */}
      <AnimatePresence>
        {showRouteModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-600 rounded-xl">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">{editingRouteId ? 'Editar Ruta' : 'Nueva Ruta'}</h3>
                </div>
                <button onClick={() => {
                  setShowRouteModal(false);
                  setEditingRouteId(null);
                  setNewRouteData({ name: '', unitNumber: '', driverId: '' });
                }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 ml-1">Nombre de la Ruta</label>
                  <input 
                    type="text"
                    placeholder="Ej. Ruta Norte, Ruta Centro..."
                    value={newRouteData.name}
                    onChange={(e) => setNewRouteData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-gray-50 border-gray-100 border rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500 focus:bg-white transition-all outline-none font-medium"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-500 ml-1">Unidad de Carga (Disponible)</label>
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {availableUnits.length} disponibles
                    </span>
                  </div>

                  {availableUnits.length === 0 ? (
                    <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-800 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Sin unidades disponibles</span>
                      </div>
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        Todas las unidades registradas están ocupadas (en ruta, en carga, en pantano o mantenimiento). Espera a que se concilien o registra una unidad en Administración.
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      <select 
                        value={newRouteData.unitNumber}
                        onChange={(e) => setNewRouteData(prev => ({ ...prev, unitNumber: e.target.value }))}
                        className="w-full bg-gray-50 border-gray-100 border rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500 focus:bg-white transition-all outline-none font-medium appearance-none"
                      >
                        <option value="">Seleccionar unidad disponible...</option>
                        {availableUnits.map(u => (
                          <option key={u.id} value={u.number}>
                            Unidad #{u.number} — Disponible {((u.jvPending || 0) + (u.jnPending || 0)) > 0 ? `(${((u.jvPending || 0) + (u.jnPending || 0))} jabas en balance)` : ''}
                          </option>
                        ))}
                      </select>
                      <Truck className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 ml-1">Asignar Chófer</label>
                  <select 
                    value={newRouteData.driverId}
                    onChange={(e) => setNewRouteData(prev => ({ ...prev, driverId: e.target.value }))}
                    className="w-full bg-gray-50 border-gray-100 border rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500 focus:bg-white transition-all outline-none font-medium appearance-none"
                  >
                    <option value="">Seleccionar chófer...</option>
                    {drivers.map(d => (
                      <option key={d.uid} value={d.uid}>{d.name} ({d.email})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => {
                  setShowRouteModal(false);
                  setEditingRouteId(null);
                  setNewRouteData({ name: '', unitNumber: '', driverId: '' });
                }}>Cancelar</Button>
                <Button className="flex-1 h-12 rounded-2xl bg-red-600 hover:bg-red-700 font-bold" onClick={saveRoute} disabled={isSavingRoute}>
                  {isSavingRoute ? 'Guardando...' : (editingRouteId ? 'Guardar Cambios' : 'Crear Ruta')}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
