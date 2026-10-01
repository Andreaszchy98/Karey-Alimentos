import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ClipboardList, Clock, Package, X, Check, Edit3, MessageSquare, Box, ShoppingBag, Truck, Calendar, Search } from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp, getDoc, Timestamp } from 'firebase/firestore';
import { Button, cn } from '../../components/ui';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Order, DeliveryRoute, Product, UserProfile, OrderItem, Unit, ContainerMovement } from '../../types';
import { sortOrdersByWindowAndDistance } from '../../lib/utils';
import { calculateOrderStatusInventoryDelta } from '../../lib/inventory';
import { calculateOrderPricing } from '../../lib/orders';
import { 
  syncRouteContainerMovement, 
  calculateRouteContainerTotals, 
  isJabaPackaging, 
  isGreenJaba, 
  isBlackJaba,
  calculateOrderEstimatedJabas,
  calculateItemEstimatedJabas,
  getOrderContainerSummary
} from '../../lib/containers';

export function PreparerView({ 
  orders, 
  routes, 
  products, 
  profile, 
  units = [],
  users = [],
  movements = [],
  onBack: _onBack, 
  showToast,
  initialTab = 'pending'
}: { 
  orders: Order[]; 
  routes: DeliveryRoute[]; 
  products: Product[]; 
  profile: UserProfile;
  units?: Unit[];
  users?: UserProfile[];
  movements?: ContainerMovement[];
  onBack: () => void; 
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void; 
  initialTab?: 'pending' | 'history'; 
}) {
  const [searchTerm, setSearchTerm] = useState('');

  // Assigned orders for prep: status === 'processing' and route released
  const assignedOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status !== 'processing') return false;
      if (o.routeId) {
        const route = routes.find(r => r.id === o.routeId);
        return route?.releasedToPrep === true;
      }
      return true;
    });
  }, [orders, routes]);

  // History orders
  const historyOrders = useMemo(() => {
    return orders
      .filter(o => ['ready', 'shipped', 'delivered', 'completed'].includes(o.status))
      .slice(0, 100);
  }, [orders]);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [itemWeights, setItemWeights] = useState<Record<string, string>>({});
  const [itemPackaging, setItemPackaging] = useState<Record<string, 'bolsa' | 'jaba' | 'jaba_verde' | 'jaba_negra'>>({});
  const [itemComments, setItemComments] = useState<Record<string, string>>({});
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [jvCount, setJvCount] = useState<number>(0);
  const [jnCount, setJnCount] = useState<number>(0);
  const [jabasNotes, setJabasNotes] = useState<string>('');

  // Check if order has already departed on route
  const orderHasLeftRoute = (order: Order | null): boolean => {
    if (!order) return false;
    return order.status === 'shipped' || order.status === 'delivered' || order.status === 'completed' || order.onboarded === true;
  };

  const handleSelectOrder = (order: Order, startInEditMode = false) => {
    setSelectedOrder(order);
    setIsEditing(startInEditMode);
    
    const initialWeights: Record<string, string> = {};
    const initialPkg: Record<string, 'bolsa' | 'jaba' | 'jaba_verde' | 'jaba_negra'> = {};
    const initialComments: Record<string, string> = {};
    const initialChecks: Record<string, boolean> = {};

    let greenJabaCount = 0;
    let blackJabaCount = 0;

    order.items.forEach(item => {
      if (item.unit === 'Kg') {
        const weightVal = item.preparerWeight || item.loaderWeight;
        if (weightVal !== undefined && weightVal > 0) {
          initialWeights[item.productId] = weightVal.toString();
        }
      }
      
      let pkg: 'bolsa' | 'jaba_verde' | 'jaba_negra' = 'bolsa';
      if (item.packaging === 'jaba_negra') {
        pkg = 'jaba_negra';
        blackJabaCount++;
      } else if (item.packaging === 'jaba_verde' || item.packaging === 'jaba') {
        pkg = 'jaba_verde';
        greenJabaCount++;
      } else {
        // Check if product has an automatic container requirement from JABA_CONFIG
        const itemEst = calculateItemEstimatedJabas(item);
        if (itemEst.isJaba) {
          pkg = itemEst.type === 'jn' ? 'jaba_negra' : 'jaba_verde';
          if (itemEst.type === 'jn') blackJabaCount++;
          else greenJabaCount++;
        } else {
          pkg = 'bolsa';
        }
      }
      initialPkg[item.productId] = pkg;
      
      if (item.comment || item.notes) {
        initialComments[item.productId] = item.comment || item.notes || '';
      }
      
      // Auto check if item was previously checked/weighed
      if (item.preparerWeight || item.loaderWeight || item.preparerCheckedAt) {
        initialChecks[item.name] = true;
      }
    });

    setItemWeights(initialWeights);
    setItemPackaging(initialPkg);
    setItemComments(initialComments);
    setCheckedItems(initialChecks);
    setOrderNotes(order.notes || '');

    // Smart automatic estimation & stored counts
    const estimated = calculateOrderEstimatedJabas(order.items);
    const hasStoredJv = typeof order.jvCount === 'number' && !isNaN(order.jvCount);
    const hasStoredJn = typeof order.jnCount === 'number' && !isNaN(order.jnCount);
    
    let defaultJv = 0;
    let defaultJn = 0;

    if (hasStoredJv || hasStoredJn) {
      defaultJv = Math.max(0, order.jvCount || 0);
      defaultJn = Math.max(0, order.jnCount || 0);
      if (defaultJv === 0 && defaultJn === 0 && (order.hasJaba || greenJabaCount > 0 || blackJabaCount > 0 || estimated.hasJaba)) {
        defaultJv = estimated.estimatedJv;
        defaultJn = estimated.estimatedJn;
      }
    } else {
      defaultJv = estimated.estimatedJv;
      defaultJn = estimated.estimatedJn;
    }

    setJvCount(defaultJv);
    setJnCount(defaultJn);
    setJabasNotes('');
  };

  const toggleItem = (itemName: string) => {
    setCheckedItems(prev => ({ ...prev, [itemName]: !prev[itemName] }));
  };

  const setItemPackagingType = (productId: string, newPkg: 'bolsa' | 'jaba_verde' | 'jaba_negra') => {
    setItemPackaging(prev => {
      const updated = {
        ...prev,
        [productId]: newPkg
      };

      // Auto-suggest container counts if currently zero
      if (newPkg === 'jaba_verde' && jvCount === 0) {
        setJvCount(1);
      } else if (newPkg === 'jaba_negra' && jnCount === 0) {
        setJnCount(1);
      }

      return updated;
    });
  };

  // Check if any container count is entered or packaging is set
  const hasJabaInOrder = useMemo(() => {
    const hasPkgJaba = Object.values(itemPackaging).some(p => p === 'jaba_verde' || p === 'jaba_negra' || p === 'jaba');
    return hasPkgJaba || jvCount > 0 || jnCount > 0;
  }, [itemPackaging, jvCount, jnCount]);

  // Recalculate preview total based on current weights
  const previewPricing = useMemo(() => {
    if (!selectedOrder) return { subtotal: 0, deliveryFee: 0, discount: 0, total: 0 };
    const tempItems: OrderItem[] = selectedOrder.items.map(item => {
      const w = itemWeights[item.productId] ? parseFloat(itemWeights[item.productId]) : item.preparerWeight;
      return {
        ...item,
        preparerWeight: w
      };
    });
    return calculateOrderPricing(tempItems, selectedOrder.deliveryFee, selectedOrder.discount);
  }, [selectedOrder, itemWeights]);

  const saveOrderModifications = async (order: Order, markReady: boolean) => {
    const kgItemsWithoutWeight = order.items.filter(item => item.unit === 'Kg' && !itemWeights[item.productId]);
    if (markReady && kgItemsWithoutWeight.length > 0) {
      showToast("Por favor ingresa el peso para todos los productos por kilo", 'error');
      return;
    }

    try {
      const updatedItems: OrderItem[] = order.items.map(item => {
        const weightVal = itemWeights[item.productId] ? parseFloat(itemWeights[item.productId]) : item.preparerWeight;
        const currentPkg = itemPackaging[item.productId] || item.packaging || 'bolsa';
        const commentVal = (itemComments[item.productId] || '').trim();

        return {
          ...item,
          packaging: currentPkg,
          comment: commentVal,
          notes: commentVal,
          preparerCheckedAt: Timestamp.now(),
          ...(item.unit === 'Kg' && weightVal !== undefined ? { preparerWeight: weightVal } : {})
        };
      });

      const { total: newTotal } = calculateOrderPricing(updatedItems, order.deliveryFee, order.discount);

      const resolvedJv = Math.max(0, jvCount || 0);
      const resolvedJn = Math.max(0, jnCount || 0);
      const orderHasJabas = resolvedJv > 0 || resolvedJn > 0;

      const updatePayload: Partial<Order> = {
        items: updatedItems,
        notes: orderNotes.trim(),
        adjustedTotal: newTotal,
        weightValidated: true,
        jvCount: resolvedJv,
        jnCount: resolvedJn,
        hasJaba: orderHasJabas,
        updatedAt: serverTimestamp()
      };

      if (markReady || order.status === 'processing') {
        updatePayload.status = 'ready';
        updatePayload.preparedAt = serverTimestamp();
        updatePayload.preparedBy = profile.uid;
        updatePayload.preparedByName = profile.name;
      }

      await updateDoc(doc(db, 'orders', order.id), updatePayload);

      // If jaba is used and route is assigned, update unified route container vale & unit state
      if (order.routeId) {
        try {
          const route = routes.find(r => r.id === order.routeId);
          if (route) {
            const assignedDriver = users.find(u => u.uid === route.driverId);
            const { totalJv, totalJn } = calculateRouteContainerTotals(route.id, orders, {
              id: order.id,
              jvCount: resolvedJv,
              jnCount: resolvedJn
            }, route);

            await syncRouteContainerMovement({
              route,
              driver: assignedDriver,
              units,
              movements,
              operatorProfile: profile,
              jvCount: totalJv,
              jnCount: totalJn,
              notes: jabasNotes.trim()
            });
          }
        } catch (e) {
          console.warn("Could not auto-sync route vale:", e);
        }
      }

      // If transitioning to ready, adjust inventory
      if (markReady && order.status === 'processing') {
        for (const item of order.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            const delta = calculateOrderStatusInventoryDelta('processing', 'ready', item.quantity);
            await updateDoc(doc(db, 'products', product.id), {
              stock: Math.max(0, (product.stock || 0) + delta.stockDelta),
              reserved: Math.max(0, (product.reserved || 0) + delta.reservedDelta)
            });
          }
        }

        await addDoc(collection(db, 'notifications'), {
          userId: order.userId || 'unknown',
          title: order.type === 'pickup' ? 'Pedido Listo para Recoger' : 'Pedido Preparado',
          message: order.type === 'pickup' 
            ? `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} está listo. Recógelo con código: ${order.pickupCode || 'S/C'}`
            : `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido preparado y está listo para cargarse en ruta.`,
          type: 'order',
          read: false,
          createdAt: serverTimestamp()
        });
      }

      setSelectedOrder(null);
      setIsEditing(false);
      setCheckedItems({});
      showToast(markReady ? 'Pedido marcado como preparado' : 'Cambios en el pedido guardados correctamente', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const allChecked = selectedOrder?.items.every(item => checkedItems[item.name]);
  
  const rawDisplayed = initialTab === 'pending' ? sortOrdersByWindowAndDistance(assignedOrders) : historyOrders;
  
  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return rawDisplayed;
    const term = searchTerm.toLowerCase();
    return rawDisplayed.filter(o => 
      o.id.toLowerCase().includes(term) ||
      (o.userName && o.userName.toLowerCase().includes(term)) ||
      (o.address && o.address.toLowerCase().includes(term)) ||
      (o.preparedByName && o.preparedByName.toLowerCase().includes(term))
    );
  }, [rawDisplayed, searchTerm]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-24"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-600" />
            {initialTab === 'pending' ? 'Preparación de Pedidos' : 'Historial de Preparación'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {initialTab === 'pending' 
              ? 'Verifica productos, pesa kilos exactos, elige jaba/bolsa y agrega comentarios antes del despacho.' 
              : 'Detalle de kilos pesados, empaques, horarios y edición de pedidos antes de salir a ruta.'}
          </p>
        </div>
      </div>

      {/* Search filter */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input 
          type="text"
          placeholder="Buscar por ID, cliente, dirección o preparador..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
        />
      </div>

      <div className="space-y-6">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-3xl border border-dashed border-gray-200 p-6">
            <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-700 font-bold text-sm">No hay pedidos {initialTab === 'pending' ? 'pendientes de preparación' : 'en el historial'}</p>
            <p className="text-gray-400 text-xs mt-1">Los pedidos asignados por despacho aparecerán aquí en tiempo real.</p>
          </div>
        ) : (
          Object.entries(
            filteredOrders.reduce((acc, order) => {
              const routeId = order.routeId || 'no-route';
              if (!acc[routeId]) acc[routeId] = [];
              acc[routeId].push(order);
              return acc;
            }, {} as Record<string, Order[]>)
          ).map(([routeId, routeOrders]) => {
            const route = routes.find(r => r.id === routeId);
            return (
              <div key={routeId} className="space-y-3">
                <div className="flex items-center justify-between ml-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1 px-3 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                      <Truck className="w-3 h-3 text-blue-400" />
                      <span>{route ? route.name : 'Sin Ruta Asignada / Sucursal'}</span>
                    </div>
                    {route && (
                      <span className="text-[10px] text-gray-500 font-bold bg-gray-100 px-2 py-0.5 rounded-md">
                        Unidad #{route.unitNumber}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">
                    {routeOrders.length} {routeOrders.length === 1 ? 'pedido' : 'pedidos'}
                  </span>
                </div>

                <div className="space-y-3">
                  {sortOrdersByWindowAndDistance(routeOrders).map(order => {
                    const canEdit = !orderHasLeftRoute(order);
                    const jabaItems = order.items.filter(it => isJabaPackaging(it.packaging)).length;
                    const greenJabas = order.items.filter(it => isGreenJaba(it.packaging)).length;
                    const blackJabas = order.items.filter(it => isBlackJaba(it.packaging)).length;
                    const kgItems = order.items.filter(it => it.unit === 'Kg');
                    const totalKgWeighed = kgItems.reduce((sum, it) => sum + (it.preparerWeight || it.loaderWeight || 0), 0);

                    return (
                      <div 
                        key={order.id} 
                        onClick={() => handleSelectOrder(order, false)}
                        className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-gray-900 text-base group-hover:text-blue-600 transition-colors">
                                #{order.id.slice(-6).toUpperCase()}
                              </h4>
                              {order.type === 'pickup' && (
                                <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md">
                                  🏪 Pickup
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-900 font-bold mt-0.5">{order.userName}</p>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span className={cn(
                              "text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider",
                              order.status === 'processing' ? "bg-blue-100 text-blue-800 border border-blue-200" :
                              order.status === 'ready' ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                              order.status === 'shipped' ? "bg-indigo-100 text-indigo-800 border border-indigo-200" :
                              "bg-gray-100 text-gray-700"
                            )}>
                              {order.status === 'processing' ? 'En Preparación' : 
                               order.status === 'ready' ? 'Listo p/ Carga' : 
                               order.status === 'shipped' ? 'En Ruta' : order.status}
                            </span>
                            {canEdit ? (
                              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                                <Edit3 className="w-2.5 h-2.5 text-amber-600" />
                                <span>Editable (En Planta)</span>
                              </span>
                            ) : (
                              <span className="text-[9px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                                🚚 En Ruta (Bloqueado)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Middle info tags */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-50 text-[11px]">
                          <span className="text-gray-600 font-medium bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                            📦 {order.items.length} {order.items.length === 1 ? 'producto' : 'productos'}
                          </span>

                          {jabaItems > 0 ? (
                            <span className="text-orange-800 font-bold bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200 flex items-center gap-1">
                              <Box className="w-3 h-3 text-orange-600" />
                              {jabaItems} en Jaba {greenJabas > 0 && blackJabas > 0 ? `(${greenJabas} JV / ${blackJabas} JN)` : greenJabas > 0 ? `(${greenJabas} JV)` : `(${blackJabas} JN)`}
                            </span>
                          ) : (
                            <span className="text-gray-500 font-medium bg-gray-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <ShoppingBag className="w-3 h-3 text-gray-400" />
                              Bolsa
                            </span>
                          )}

                          {kgItems.length > 0 && totalKgWeighed > 0 && (
                            <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                              ⚖️ {totalKgWeighed.toFixed(2)} Kg
                            </span>
                          )}

                          {order.deliveryWindowStart && order.deliveryWindowEnd && (
                            <div className="flex items-center gap-1 text-[10px] text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                              <Clock className="w-2.5 h-2.5 text-indigo-600" />
                              <span>{order.deliveryWindowStart} - {order.deliveryWindowEnd}</span>
                            </div>
                          )}
                        </div>

                        {/* Timestamp line */}
                        <div className="flex justify-between items-center text-[10px] text-gray-400 pt-1">
                          <div>
                            {order.preparedAt ? (
                              <span className="text-emerald-700 font-bold flex items-center gap-1">
                                <Check className="w-3 h-3 text-emerald-600" />
                                Checado {order.preparedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {order.preparedByName ? ` · ${order.preparedByName}` : ''}
                              </span>
                            ) : (
                              <span>Registrado: {order.createdAt ? order.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Reciente'}</span>
                            )}
                          </div>

                          <span className="font-black text-gray-900 text-xs">
                            ${(order.adjustedTotal ?? order.total).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Main Order Modal / Checklist / Edit */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100] flex items-end sm:items-center justify-center p-3 sm:p-4">
            <motion.div 
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-100"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-start pb-2 border-b border-gray-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-xl text-gray-900">
                      Pedido #{selectedOrder.id.slice(-6).toUpperCase()}
                    </h3>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-md font-bold uppercase",
                      selectedOrder.status === 'processing' ? "bg-blue-100 text-blue-800" :
                      selectedOrder.status === 'ready' ? "bg-emerald-100 text-emerald-800" :
                      "bg-gray-100 text-gray-700"
                    )}>
                      {selectedOrder.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedOrder.userName} · {selectedOrder.address}</p>
                </div>
                
                <button 
                  onClick={() => {
                    setSelectedOrder(null);
                    setIsEditing(false);
                  }} 
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Order Metadata & History Timestamps */}
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-100 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Preparado por:</span>
                    <span className="font-bold text-gray-800">
                      {selectedOrder.preparedByName || selectedOrder.preparedBy || 'Pendiente'}
                    </span>
                    {selectedOrder.preparedAt && (
                      <span className="text-[10px] text-blue-600 block">
                        🕒 {selectedOrder.preparedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({selectedOrder.preparedAt.toDate().toLocaleDateString()})
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Cargado / Validado por:</span>
                    <span className="font-bold text-gray-800">
                      {selectedOrder.loadedByName || (selectedOrder.onboarded ? 'Cargador' : 'Sin cargar en unidad')}
                    </span>
                    {selectedOrder.loadedAt && (
                      <span className="text-[10px] text-emerald-600 block">
                        🕒 {selectedOrder.loadedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                {selectedOrder.deliveryWindowStart && selectedOrder.deliveryWindowEnd && (
                  <div className="pt-1.5 border-t border-gray-200/60 flex items-center justify-between text-[11px]">
                    <span className="text-gray-500 font-medium">Ventana de Entrega Solicitada:</span>
                    <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                      {selectedOrder.deliveryWindowStart} - {selectedOrder.deliveryWindowEnd}
                    </span>
                  </div>
                )}
              </div>

              {/* Products Section */}
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {initialTab === 'pending' || isEditing ? 'Verificar y Pesar Productos' : 'Detalle de Productos'}
                  </span>
                  
                  {!orderHasLeftRoute(selectedOrder) && initialTab === 'history' && !isEditing && (
                    <button 
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-xl flex items-center gap-1 transition-colors border border-blue-200"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar Pedido / Pesos</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {selectedOrder.items.map((item, i) => {
                    const product = products.find(p => p.id === item.productId);
                    const currentPkg = itemPackaging[item.productId] || item.packaging || 'bolsa';
                    const isChecked = checkedItems[item.name];
                    const weightVal = itemWeights[item.productId] ? parseFloat(itemWeights[item.productId]) : item.preparerWeight;
                    const itemComment = itemComments[item.productId] || item.comment || item.notes || '';

                    return (
                      <div 
                        key={i} 
                        onClick={() => {
                          if (initialTab === 'pending' || isEditing) {
                            toggleItem(item.name);
                          }
                        }}
                        className={cn(
                          "flex flex-col p-3.5 rounded-2xl border transition-all gap-2.5",
                          (initialTab === 'pending' || isEditing) ? "cursor-pointer" : "cursor-default",
                          isChecked ? "bg-emerald-50/50 border-emerald-200" : "bg-white border-gray-200/80 shadow-2xs"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {(initialTab === 'pending' || isEditing) && (
                            <div className={cn(
                              "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 mt-1",
                              isChecked ? "bg-emerald-500 border-emerald-500" : "border-gray-300 bg-white"
                            )}>
                              {isChecked && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                            </div>
                          )}

                          {product?.imageUrl ? (
                            <img src={product.imageUrl} className="w-11 h-11 rounded-xl object-cover bg-gray-50 shrink-0 border border-gray-100 shadow-2xs" alt={item.name} referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200">
                              <Package className="w-5 h-5 text-gray-400" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className={cn(
                                "font-bold text-sm text-gray-900 block truncate",
                                isChecked && (initialTab === 'pending' || isEditing) ? "text-emerald-900" : ""
                              )}>
                                {item.quantity}x {item.name}
                              </span>
                              
                              <span className="text-xs font-black text-gray-900 shrink-0">
                                ${(item.unit === 'Kg' 
                                  ? (item.price * (weightVal || (item.approxWeight ? item.approxWeight * item.quantity : item.quantity)))
                                  : (item.price * item.quantity)).toFixed(2)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="text-[10px] text-gray-500 font-medium">
                                {item.unit === 'Kg' ? `$${item.price.toFixed(2)}/Kg` : `$${item.price.toFixed(2)} c/u`}
                              </span>

                              {/* Packaging Selector */}
                              {(initialTab === 'pending' || isEditing) ? (
                                <div className="flex items-center gap-1 bg-gray-100/90 p-0.5 rounded-lg border border-gray-200" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => setItemPackagingType(item.productId, 'bolsa')}
                                    className={cn(
                                      "px-2 py-0.5 text-[9px] font-bold rounded-md transition-all flex items-center gap-1",
                                      currentPkg === 'bolsa' ? "bg-gray-800 text-white shadow-2xs" : "text-gray-600 hover:text-gray-900"
                                    )}
                                  >
                                    🛍️ Bolsa
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setItemPackagingType(item.productId, 'jaba_verde')}
                                    className={cn(
                                      "px-2 py-0.5 text-[9px] font-bold rounded-md transition-all flex items-center gap-1",
                                      (currentPkg === 'jaba_verde' || currentPkg === 'jaba') ? "bg-emerald-600 text-white shadow-2xs font-black" : "text-emerald-800 hover:bg-emerald-50"
                                    )}
                                  >
                                    🟢 Jaba Verde
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setItemPackagingType(item.productId, 'jaba_negra')}
                                    className={cn(
                                      "px-2 py-0.5 text-[9px] font-bold rounded-md transition-all flex items-center gap-1",
                                      currentPkg === 'jaba_negra' ? "bg-gray-950 text-white shadow-2xs ring-1 ring-gray-700 font-black" : "text-gray-800 hover:bg-gray-200"
                                    )}
                                  >
                                    ⚫ Jaba Negra
                                  </button>
                                </div>
                              ) : (
                                currentPkg === 'jaba_negra' ? (
                                  <span className="text-[9px] bg-gray-900 text-white font-bold px-2 py-0.5 rounded-md border border-gray-800 flex items-center gap-1">
                                    ⚫ Jaba Negra (JN)
                                  </span>
                                ) : (currentPkg === 'jaba_verde' || currentPkg === 'jaba') ? (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded-md border border-emerald-300 flex items-center gap-1">
                                    🟢 Jaba Verde (JV)
                                  </span>
                                ) : (
                                  <span className="text-[9px] bg-gray-100 text-gray-700 font-medium px-2 py-0.5 rounded-md border border-gray-200">
                                    🛍️ En Bolsa
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Weight & Comparison row */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                          {item.unit === 'Kg' ? (
                            (initialTab === 'pending' || isEditing) ? (
                              <div className="flex items-center gap-2 w-full justify-between bg-blue-50/60 p-2 rounded-xl border border-blue-100">
                                <div>
                                  <span className="text-[10px] font-bold text-blue-900 uppercase block">Kilos Reales Pesados:</span>
                                  {item.approxWeight && (
                                    <span className="text-[9px] text-blue-600 font-medium">Estimado: {(item.approxWeight * item.quantity).toFixed(2)} Kg</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <input 
                                    type="number" 
                                    step="0.01" 
                                    placeholder="0.00"
                                    value={itemWeights[item.productId] ?? ''}
                                    onChange={(e) => setItemWeights(prev => ({ ...prev, [item.productId]: e.target.value }))}
                                    className="w-20 px-2.5 py-1 text-xs font-black text-blue-800 bg-white border border-blue-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <span className="text-xs font-bold text-blue-900">Kg</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 text-xs">
                                {item.preparerWeight !== undefined && (
                                  <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded-md font-bold text-[11px] border border-blue-100">
                                    ⚖️ Prep: {item.preparerWeight.toFixed(2)} Kg
                                  </span>
                                )}
                                {item.loaderWeight !== undefined && (
                                  <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded-md font-bold text-[11px] border border-purple-100">
                                    🚚 Carga: {item.loaderWeight.toFixed(2)} Kg
                                  </span>
                                )}
                              </div>
                            )
                          ) : (
                            <span className="text-[10px] text-gray-400 font-medium">
                              Unidades: {item.quantity} piezas fijas
                            </span>
                          )}
                        </div>

                        {/* Product Comment field / display */}
                        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                          {(initialTab === 'pending' || isEditing) ? (
                            <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200">
                              <MessageSquare className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <input 
                                type="text"
                                placeholder="Comentario para este producto (ej. corte delgado, congelado)..."
                                value={itemComments[item.productId] ?? ''}
                                onChange={(e) => setItemComments(prev => ({ ...prev, [item.productId]: e.target.value }))}
                                className="w-full bg-transparent text-xs text-gray-800 placeholder-gray-400 focus:outline-none"
                              />
                            </div>
                          ) : (
                            itemComment && (
                              <div className="flex items-center gap-1.5 text-xs text-amber-900 bg-amber-50/80 px-2.5 py-1 rounded-xl border border-amber-200">
                                <MessageSquare className="w-3 h-3 text-amber-600 shrink-0" />
                                <span className="font-medium italic">"{itemComment}"</span>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* EMBEDDED DIGITAL VALE SECTION (Inside the popup directly when Jaba is selected) */}
              {hasJabaInOrder && (
                <div className="bg-amber-50/90 rounded-2xl p-4 border border-amber-200 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-600 text-white rounded-xl">
                        <Box className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide">
                          Vale Digital de Jabas (Karey)
                        </h4>
                        <p className="text-[10px] text-amber-800">
                          Conteo de Jabas Verdes (JV) y Negras (JN) asignadas a la unidad
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-amber-200 text-amber-950 font-black px-2.5 py-1 rounded-full border border-amber-300">
                      Total: {(jvCount || 0) + (jnCount || 0)} Pzas
                    </span>
                  </div>

                  {(initialTab === 'pending' || isEditing) ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        {/* Green Crates (JV) */}
                        <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-emerald-900">Verdes (JV)</span>
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          </div>
                          <div className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-emerald-200">
                            <button
                              type="button"
                              onClick={() => setJvCount(Math.max(0, jvCount - 1))}
                              className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 font-bold text-xs text-gray-700"
                            >
                              -
                            </button>
                            <span className="font-black text-emerald-900 text-sm">{jvCount}</span>
                            <button
                              type="button"
                              onClick={() => setJvCount(jvCount + 1)}
                              className="w-7 h-7 rounded bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Black Crates (JN) */}
                        <div className="bg-gray-100 p-3 rounded-xl border border-gray-300 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-gray-900">Negras (JN)</span>
                            <span className="w-2.5 h-2.5 rounded-full bg-gray-900" />
                          </div>
                          <div className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-gray-200">
                            <button
                              type="button"
                              onClick={() => setJnCount(Math.max(0, jnCount - 1))}
                              className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 font-bold text-xs text-gray-700"
                            >
                              -
                            </button>
                            <span className="font-black text-gray-900 text-sm">{jnCount}</span>
                            <button
                              type="button"
                              onClick={() => setJnCount(jnCount + 1)}
                              className="w-7 h-7 rounded bg-gray-900 hover:bg-gray-800 font-bold text-xs text-white"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <input 
                        type="text"
                        placeholder="Notas del vale (ej: 2 jabas azules con tapa)..."
                        value={jabasNotes}
                        onChange={(e) => setJabasNotes(e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-white border border-amber-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  ) : (
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200/60 text-xs flex justify-between items-center text-amber-900">
                      <span>Jabas amparadas en el vale:</span>
                      <span className="font-black text-sm">
                        <span className="text-emerald-700">{jvCount} JV</span> / <span className="text-gray-900">{jnCount} JN</span>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Order General Notes */}
              {(initialTab === 'pending' || isEditing) ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                    Notas Generales del Pedido
                  </label>
                  <textarea 
                    rows={2}
                    placeholder="Instrucciones para el chofer o despacho..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : (
                selectedOrder.notes && (
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Notas del Pedido:</span>
                    <p className="text-gray-700 font-medium">{selectedOrder.notes}</p>
                  </div>
                )
              )}

              {/* Pricing & Summary Card */}
              <div className="p-4 bg-gray-900 rounded-2xl space-y-2 text-white shadow-xl shadow-gray-200">
                <div className="flex justify-between items-center text-xs text-gray-400 font-bold uppercase tracking-wider">
                  <span>Total Calculado con Pesos Reales</span>
                  {previewPricing.deliveryFee > 0 && (
                    <span>Envío: ${previewPricing.deliveryFee.toFixed(2)}</span>
                  )}
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-sm font-bold text-gray-300">TOTAL</span>
                  <span className="text-2xl font-black text-white">
                    ${previewPricing.total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2">
                {initialTab === 'pending' ? (
                  <div className="space-y-2">
                    <Button 
                      className="w-full h-13 text-base font-black bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                      onClick={() => saveOrderModifications(selectedOrder, true)}
                      disabled={!allChecked}
                    >
                      <Check className="w-5 h-5" />
                      <span>Completar Preparación</span>
                    </Button>
                    {!allChecked && (
                      <p className="text-[10px] text-gray-400 text-center font-medium">
                        Marca todos los productos como revisados para habilitar
                      </p>
                    )}
                  </div>
                ) : isEditing ? (
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      className="flex-1 h-12"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancelar
                    </Button>
                    <Button 
                      className="flex-[2] h-12 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200"
                      onClick={() => saveOrderModifications(selectedOrder, false)}
                    >
                      Guardar Cambios
                    </Button>
                  </div>
                ) : (
                  <Button 
                    variant="outline"
                    className="w-full h-12 text-gray-700 font-bold hover:bg-gray-100"
                    onClick={() => setSelectedOrder(null)}
                  >
                    Cerrar Detalle
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
