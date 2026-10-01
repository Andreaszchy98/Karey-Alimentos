import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Truck, AlertTriangle, MapPin, Navigation, Clock, X, Check, PackageCheck, Box, ShoppingBag, Edit3, MessageSquare, Search } from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp, getDoc, Timestamp } from 'firebase/firestore';
import { Button, cn } from '../../components/ui';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Order, DeliveryRoute, UserProfile, Product, OrderItem, Unit, ContainerMovement } from '../../types';
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

export function LoaderView({ 
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
  const [searchTerm, setSearchTerm] = useState('');

  // Pending for loader: status in processing/ready and not yet onboarded and not pickup
  const pendingOrders = useMemo(() => {
    return orders.filter(o => (o.status === 'processing' || o.status === 'ready') && !o.onboarded && o.type !== 'pickup');
  }, [orders]);

  // History orders for loader: onboarded or completed delivery
  const historyOrders = useMemo(() => {
    return orders.filter(o => (o.onboarded === true || ['shipped', 'delivered', 'completed'].includes(o.status)) && o.type !== 'pickup').slice(0, 100);
  }, [orders]);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [loaderWeights, setLoaderWeights] = useState<Record<string, string>>({});
  const [itemPackaging, setItemPackaging] = useState<Record<string, 'bolsa' | 'jaba' | 'jaba_verde' | 'jaba_negra'>>({});
  const [itemComments, setItemComments] = useState<Record<string, string>>({});
  const [orderNotes, setOrderNotes] = useState<string>('');

  // Embedded Vale Digital state inside modal
  const [jvCount, setJvCount] = useState<number>(0);
  const [jnCount, setJnCount] = useState<number>(0);
  const [jabasNotes, setJabasNotes] = useState<string>('');

  const rawDisplayed = initialTab === 'pending' ? sortOrdersByWindowAndDistance(pendingOrders) : historyOrders;
  
  const displayedOrders = useMemo(() => {
    if (!searchTerm.trim()) return rawDisplayed;
    const term = searchTerm.toLowerCase();
    return rawDisplayed.filter(o => 
      o.id.toLowerCase().includes(term) ||
      (o.userName && o.userName.toLowerCase().includes(term)) ||
      (o.address && o.address.toLowerCase().includes(term)) ||
      (o.loadedByName && o.loadedByName.toLowerCase().includes(term))
    );
  }, [rawDisplayed, searchTerm]);

  const selectedOrder = orders.find(o => o.id === selectedOrderId) || null;

  // Check if order has already departed on active delivery to customer
  const orderHasDeparted = (order: Order | null): boolean => {
    if (!order) return false;
    return order.status === 'delivered' || order.status === 'completed';
  };

  useEffect(() => {
    if (selectedOrder) {
      const initialWeights: Record<string, string> = {};
      const initialPkg: Record<string, 'bolsa' | 'jaba' | 'jaba_verde' | 'jaba_negra'> = {};
      const initialComments: Record<string, string> = {};
      const initialChecks: Record<string, boolean> = {};

      let greenJabaCount = 0;
      let blackJabaCount = 0;

      selectedOrder.items.forEach(item => {
        if (item.unit === 'Kg') {
          if (item.loaderWeight !== undefined && item.loaderWeight > 0) {
            initialWeights[item.productId] = item.loaderWeight.toString();
          } else if (item.preparerWeight !== undefined && item.preparerWeight > 0) {
            initialWeights[item.productId] = item.preparerWeight.toString();
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

        if (item.loaderWeight || item.preparerWeight || item.loaderCheckedAt) {
          initialChecks[item.name] = true;
        }
      });

      setLoaderWeights(initialWeights);
      setItemPackaging(initialPkg);
      setItemComments(initialComments);
      setCheckedItems(initialChecks);
      setOrderNotes(selectedOrder.notes || '');

      // Smart automatic estimation & stored counts
      const estimated = calculateOrderEstimatedJabas(selectedOrder.items);
      const hasStoredJv = typeof selectedOrder.jvCount === 'number' && !isNaN(selectedOrder.jvCount);
      const hasStoredJn = typeof selectedOrder.jnCount === 'number' && !isNaN(selectedOrder.jnCount);
      
      let defaultJv = 0;
      let defaultJn = 0;

      if (hasStoredJv || hasStoredJn) {
        defaultJv = Math.max(0, selectedOrder.jvCount || 0);
        defaultJn = Math.max(0, selectedOrder.jnCount || 0);
        if (defaultJv === 0 && defaultJn === 0 && (selectedOrder.hasJaba || greenJabaCount > 0 || blackJabaCount > 0 || estimated.hasJaba)) {
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
    } else {
      setLoaderWeights({});
      setItemPackaging({});
      setItemComments({});
      setCheckedItems({});
      setIsEditing(false);
    }
  }, [selectedOrderId, selectedOrder]);

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

  const hasJabaInOrder = useMemo(() => {
    const hasPkgJaba = Object.values(itemPackaging).some(p => p === 'jaba_verde' || p === 'jaba_negra' || p === 'jaba');
    return hasPkgJaba || jvCount > 0 || jnCount > 0;
  }, [itemPackaging, jvCount, jnCount]);

  // Recalculate preview pricing
  const previewPricing = useMemo(() => {
    if (!selectedOrder) return { subtotal: 0, deliveryFee: 0, discount: 0, total: 0 };
    const tempItems: OrderItem[] = selectedOrder.items.map(item => {
      const currentWeightStr = loaderWeights[item.productId];
      const weightValue = currentWeightStr ? parseFloat(currentWeightStr) : (item.loaderWeight || item.preparerWeight);
      return {
        ...item,
        loaderWeight: weightValue
      };
    });
    return calculateOrderPricing(tempItems, selectedOrder.deliveryFee, selectedOrder.discount);
  }, [selectedOrder, loaderWeights]);

  // Save changes when in Edit Mode
  const saveOrderModifications = async (order: Order) => {
    try {
      const updatedItems: OrderItem[] = order.items.map(item => {
        const currentWeightStr = loaderWeights[item.productId];
        const weightValue = currentWeightStr ? parseFloat(currentWeightStr) : (item.loaderWeight || item.preparerWeight);
        const currentPkg = itemPackaging[item.productId] || item.packaging || 'bolsa';
        const commentVal = (itemComments[item.productId] || '').trim();

        return {
          ...item,
          packaging: currentPkg,
          comment: commentVal,
          notes: commentVal,
          loaderCheckedAt: Timestamp.now(),
          ...(item.unit === 'Kg' && weightValue !== undefined ? { loaderWeight: weightValue } : {})
        };
      });

      const { total: adjustedTotal } = calculateOrderPricing(updatedItems, order.deliveryFee, order.discount);

      const resolvedJv = Math.max(0, jvCount || 0);
      const resolvedJn = Math.max(0, jnCount || 0);
      const orderHasJabas = resolvedJv > 0 || resolvedJn > 0;

      await updateDoc(doc(db, 'orders', order.id), {
        items: updatedItems,
        notes: orderNotes.trim(),
        adjustedTotal: adjustedTotal,
        weightValidated: true,
        jvCount: resolvedJv,
        jnCount: resolvedJn,
        hasJaba: orderHasJabas,
        updatedAt: serverTimestamp()
      });

      // Also if order has a route and is already in route/loaded, sync with route vale
      if (order.routeId) {
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
      }

      setIsEditing(false);
      showToast("Cambios en la carga guardados exitosamente", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  // Mark order as ready (if in processing)
  const markAsReady = async (order: Order) => {
    try {
      const updatedItems = order.items.map(item => {
        const currentWeightStr = loaderWeights[item.productId];
        const weightValue = currentWeightStr ? parseFloat(currentWeightStr) : (item.preparerWeight || 0);
        const commentVal = (itemComments[item.productId] || '').trim();

        return {
          ...item,
          packaging: itemPackaging[item.productId] || item.packaging || 'bolsa',
          comment: commentVal,
          notes: commentVal,
          loaderCheckedAt: Timestamp.now(),
          ...(item.unit === 'Kg' ? { loaderWeight: weightValue } : {})
        };
      });

      const { total: adjustedTotal } = calculateOrderPricing(updatedItems, order.deliveryFee, order.discount);

      await updateDoc(doc(db, 'orders', order.id), { 
        status: 'ready',
        preparedAt: order.preparedAt || serverTimestamp(),
        items: updatedItems,
        adjustedTotal: adjustedTotal,
        notes: orderNotes.trim(),
        weightValidated: true,
        jvCount: jvCount,
        jnCount: jnCount,
        hasJaba: hasJabaInOrder,
        updatedAt: serverTimestamp()
      });
      
      for (const item of order.items) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const delta = calculateOrderStatusInventoryDelta(order.status, 'ready', item.quantity);
          await updateDoc(doc(db, 'products', product.id), {
            stock: Math.max(0, (product.stock || 0) + delta.stockDelta),
            reserved: Math.max(0, (product.reserved || 0) + delta.reservedDelta)
          });
        }
      }
      showToast("Preparación validada correctamente por cargador", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  // Execute Onboarding with embedded digital vale sync
  const executeOnboard = async (order: Order) => {
    const route = routes.find(r => r.id === order.routeId);
    if (!route) {
      showToast("Este pedido no tiene una ruta asignada por despacho", 'error');
      return;
    }
    
    const hasKgItems = order.items.some(item => item.unit === 'Kg');

    try {
      const updatedItems = order.items.map(item => {
        const currentWeightStr = loaderWeights[item.productId];
        const weightValue = currentWeightStr ? parseFloat(currentWeightStr) : (item.preparerWeight || 0);
        const commentVal = (itemComments[item.productId] || '').trim();

        return {
          ...item,
          packaging: itemPackaging[item.productId] || item.packaging || 'bolsa',
          comment: commentVal,
          notes: commentVal,
          loaderCheckedAt: Timestamp.now(),
          ...(item.unit === 'Kg' ? { loaderWeight: weightValue } : {})
        };
      });

      const { total: adjustedTotal } = calculateOrderPricing(updatedItems, order.deliveryFee, order.discount);

      const resolvedJv = Math.max(0, jvCount || 0);
      const resolvedJn = Math.max(0, jnCount || 0);
      const orderHasJabas = resolvedJv > 0 || resolvedJn > 0;

      const updateData: Partial<Order> = { 
        status: 'shipped', 
        onboarded: true,
        loadedAt: serverTimestamp(),
        loadedBy: profile.uid,
        loadedByName: profile.name,
        items: updatedItems,
        notes: orderNotes.trim(),
        adjustedTotal: adjustedTotal,
        weightValidated: hasKgItems ? true : order.weightValidated,
        jvCount: resolvedJv,
        jnCount: resolvedJn,
        hasJaba: orderHasJabas,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'orders', order.id), updateData);

      // If jabas were loaded, register or update the unified container vale and unit state
      const assignedDriver = users.find(u => u.uid === route.driverId);
      const { totalJv, totalJn } = calculateRouteContainerTotals(route.id, orders, {
        id: order.id,
        jvCount: resolvedJv,
        jnCount: resolvedJn
      }, route);

      if (totalJv > 0 || totalJn > 0 || route.containerVale) {
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
      
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Pedido en Camino',
        message: `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido cargado en la ${route.name} y va en camino.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });

      await addDoc(collection(db, 'notifications'), {
        userId: route.driverId || 'unknown',
        title: 'Nuevo Pedido Asignado a tu Unidad',
        message: `El pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido cargado en tu unidad ${route.unitNumber}.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });

      setSelectedOrderId(null);
      const totalOrderJabas = (jvCount || 0) + (jnCount || 0);
      showToast(hasJabaInOrder ? `Pedido cargado y vale de ${totalOrderJabas} jaba(s) (${jvCount} JV / ${jnCount} JN) registrado` : "Pedido cargado exitosamente en unidad", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const allChecked = selectedOrder?.items.every(item => checkedItems[item.name]);
  const selectedOrderRoute = selectedOrder?.routeId ? routes.find(r => r.id === selectedOrder.routeId) : null;
  const selectedOrderDriver = selectedOrderRoute?.driverId ? users.find(u => u.uid === selectedOrderRoute.driverId) : null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-24"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-orange-600" />
            {initialTab === 'pending' ? 'Carga y Onboarding' : 'Historial de Carga'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {initialTab === 'pending'
              ? 'Verifica mercancía en andén, confirma empaques (jaba/bolsa) y registra vales digitales de salida.'
              : 'Detalle de pedidos cargados, pesos de báscula, horarios de validación y edición.'}
          </p>
        </div>
      </div>

      {/* Search filter */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input 
          type="text"
          placeholder="Buscar por ID, cliente, dirección, chófer o cargador..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-2xs"
        />
      </div>

      <div className="space-y-4">
        {displayedOrders.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-3xl border border-dashed border-gray-200 p-6">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-700 font-bold text-sm">No hay pedidos {initialTab === 'pending' ? 'pendientes de carga' : 'en el historial'}</p>
            <p className="text-gray-400 text-xs mt-1">Los pedidos preparados aparecerán listos para subir a las unidades.</p>
          </div>
        ) : (
          displayedOrders.map(order => {
            const route = routes.find(r => r.id === order.routeId);
            const driver = route ? users.find(u => u.uid === route.driverId) : null;
            const jabaItems = order.items.filter(it => isJabaPackaging(it.packaging)).length;
            const greenJabas = order.items.filter(it => isGreenJaba(it.packaging)).length;
            const blackJabas = order.items.filter(it => isBlackJaba(it.packaging)).length;
            const kgItems = order.items.filter(it => it.unit === 'Kg');
            const totalKg = kgItems.reduce((sum, it) => sum + (it.loaderWeight || it.preparerWeight || 0), 0);
            const canEdit = !orderHasDeparted(order);

            return (
              <div 
                key={order.id} 
                onClick={() => setSelectedOrderId(order.id)}
                className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3 cursor-pointer hover:border-orange-300 hover:shadow-md transition-all group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-gray-900 text-base group-hover:text-orange-600 transition-colors">
                      #{order.id.slice(-6).toUpperCase()}
                    </h4>
                    <p className="text-xs text-gray-900 font-bold mt-0.5">{order.userName}</p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider",
                        order.status === 'processing' ? "bg-blue-100 text-blue-800" : 
                        order.status === 'ready' ? "bg-purple-100 text-purple-800" :
                        "bg-emerald-100 text-emerald-800"
                      )}>
                        {order.status === 'processing' ? 'En Prep.' : 
                         order.status === 'ready' ? 'Listo p/ Carga' : 'Cargado'}
                      </span>
                      {order.onboarded && (
                        <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-bold">
                          CARGADO
                        </span>
                      )}
                    </div>

                    {canEdit && (
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                        <Edit3 className="w-2.5 h-2.5 text-amber-600" />
                        <span>Editable</span>
                      </span>
                    )}
                  </div>
                </div>
                
                {route ? (
                  <div className="p-2.5 bg-orange-50/70 rounded-xl border border-orange-200/80 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-orange-600 shrink-0" />
                      <span className="font-bold text-orange-950">Ruta: {route.name} · Unidad #{route.unitNumber}</span>
                    </div>
                    <span className="text-[10px] font-medium text-orange-800 bg-orange-100 px-2 py-0.5 rounded-md">
                      Chofer: {driver?.name || 'Asignado'}
                    </span>
                  </div>
                ) : (
                  <div className="p-2 bg-red-50 rounded-xl border border-red-100 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span className="text-[10px] font-bold text-red-700">Sin ruta asignada por Despacho</span>
                  </div>
                )}

                <div className="flex items-start gap-2 text-[11px] text-gray-600">
                  <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <span className="truncate">{order.address}</span>
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-50 text-[10px]">
                  <span className="bg-gray-50 text-gray-700 px-2 py-0.5 rounded-md font-medium border border-gray-100">
                    📦 {order.items.length} productos
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

                  {kgItems.length > 0 && totalKg > 0 && (
                    <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                      ⚖️ {totalKg.toFixed(2)} Kg
                    </span>
                  )}

                  {order.deliveryDistance && (
                    <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 flex items-center gap-1">
                      <Navigation className="w-2.5 h-2.5 text-blue-600" />
                      {order.deliveryDistance.toFixed(1)} km
                    </span>
                  )}

                  {order.deliveryWindowStart && order.deliveryWindowEnd && (
                    <div className="flex items-center gap-1 text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                      <Clock className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
                      <span>{order.deliveryWindowStart} - {order.deliveryWindowEnd}</span>
                    </div>
                  )}
                </div>

                {/* Timestamps */}
                <div className="flex justify-between items-center text-[10px] text-gray-400 pt-1">
                  <div>
                    {order.loadedAt ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" />
                        Cargado {order.loadedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {order.loadedByName ? ` · ${order.loadedByName}` : ''}
                      </span>
                    ) : order.preparedAt ? (
                      <span className="text-blue-600 font-bold">
                        Listo desde: {order.preparedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : (
                      <span>Pendiente</span>
                    )}
                  </div>

                  <span className="font-black text-gray-900 text-xs">
                    ${(order.adjustedTotal ?? order.total).toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Main Loader Popup Modal */}
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
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-600 rounded-2xl shadow-md shadow-orange-200">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-xl text-gray-900">
                      Pedido #{selectedOrder.id.slice(-6).toUpperCase()}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{selectedOrder.userName} · {selectedOrder.address}</p>
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    setSelectedOrderId(null);
                    setIsEditing(false);
                  }} 
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Route & Driver Box */}
              {selectedOrderRoute ? (
                <div className="p-3.5 bg-orange-50 rounded-2xl border border-orange-200 space-y-1.5 shadow-2xs">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] text-orange-600 font-black uppercase tracking-wider">Unidad y Ruta de Entrega</p>
                    <span className="text-[10px] bg-orange-200 text-orange-950 font-bold px-2 py-0.5 rounded-md">
                      Unidad #{selectedOrderRoute.unitNumber}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Truck className="w-6 h-6 text-orange-600 shrink-0" />
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{selectedOrderRoute.name}</p>
                      <p className="text-xs text-orange-800 font-medium">Chofer Responsable: {selectedOrderDriver?.name || 'Asignado'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-red-50 rounded-2xl border border-red-200 flex items-center gap-3 text-xs text-red-700 font-bold">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                  <span>Requiere asignación de ruta en Despacho antes de poder subir a unidad.</span>
                </div>
              )}

              {/* Prep & Load metadata */}
              <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Preparado por:</span>
                  <span className="font-bold text-gray-800">{selectedOrder.preparedByName || 'Preparador'}</span>
                  {selectedOrder.preparedAt && (
                    <span className="text-[10px] text-blue-600 block">
                      🕒 {selectedOrder.preparedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Cargado por:</span>
                  <span className="font-bold text-gray-800">{selectedOrder.loadedByName || (selectedOrder.onboarded ? 'Cargador' : 'Pendiente')}</span>
                  {selectedOrder.loadedAt && (
                    <span className="text-[10px] text-emerald-600 block">
                      🕒 {selectedOrder.loadedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>

              {/* Products Section */}
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {initialTab === 'pending' || isEditing ? 'Verificación de Carga y Báscula' : 'Detalle de Productos'}
                  </span>

                  {!orderHasDeparted(selectedOrder) && initialTab === 'history' && !isEditing && (
                    <button 
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="text-xs font-bold text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 px-3 py-1 rounded-xl flex items-center gap-1 transition-colors border border-orange-200"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar Pedido / Carga</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {selectedOrder.items.map((item, i) => {
                    const product = products.find(p => p.id === item.productId);
                    const currentPkg = itemPackaging[item.productId] || item.packaging || 'bolsa';
                    const isChecked = checkedItems[item.name];
                    const currentWeightStr = loaderWeights[item.productId];
                    const weightVal = currentWeightStr ? parseFloat(currentWeightStr) : (item.loaderWeight || item.preparerWeight);
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
                          isChecked ? "bg-emerald-50/40 border-emerald-200" : "bg-white border-gray-200/80 shadow-2xs"
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

                        {/* Weight input / validation row */}
                        {item.unit === 'Kg' && (
                          <div className="pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                            {(initialTab === 'pending' || isEditing) ? (
                              <div className="flex items-center justify-between gap-2 p-2 bg-orange-50/60 rounded-xl border border-orange-200">
                                <div>
                                  <span className="text-[9px] font-black text-orange-950 uppercase block">Báscula Cargador (KG Real):</span>
                                  {item.preparerWeight !== undefined && (
                                    <span className="text-[9px] text-orange-800 font-medium">Prep: {item.preparerWeight.toFixed(2)} Kg</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <input 
                                    type="number" 
                                    step="0.01" 
                                    placeholder="0.00"
                                    value={loaderWeights[item.productId] ?? ''}
                                    onChange={(e) => setLoaderWeights(prev => ({ ...prev, [item.productId]: e.target.value }))}
                                    className="w-20 px-2 py-1 text-xs font-black text-orange-900 bg-white border border-orange-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                                  />
                                  <span className="text-xs font-bold text-orange-900">Kg</span>
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
                                  <span className="bg-orange-50 text-orange-800 px-2 py-0.5 rounded-md font-bold text-[11px] border border-orange-100">
                                    🚚 Báscula Carga: {item.loaderWeight.toFixed(2)} Kg
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Product Comment row */}
                        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                          {(initialTab === 'pending' || isEditing) ? (
                            <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200">
                              <MessageSquare className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <input 
                                type="text"
                                placeholder="Observaciones / Comentario de producto..."
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

              {/* EMBEDDED DIGITAL VALE SECTION - Directly in popup without stacking windows */}
              {hasJabaInOrder && (
                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-600 text-white rounded-xl">
                        <Box className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide">
                          Vale Digital de Salida de Jabas (Karey)
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
                        placeholder="Observaciones del vale de salida..."
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

              {/* Order Notes */}
              {(initialTab === 'pending' || isEditing) ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                    Notas Generales de Carga
                  </label>
                  <textarea 
                    rows={2}
                    placeholder="Instrucciones para el chofer o andén..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
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

              {/* Pricing Summary */}
              <div className="p-4 bg-gray-900 rounded-2xl space-y-2 text-white shadow-xl shadow-gray-200">
                <div className="flex justify-between items-center text-xs text-gray-400 font-bold uppercase tracking-wider">
                  <span>Total con Pesos de Báscula</span>
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

              {/* Modal Action Buttons */}
              <div className="pt-2">
                {initialTab === 'pending' ? (
                  <div className="space-y-2">
                    {selectedOrder.status === 'processing' ? (
                      <Button 
                        className="w-full h-13 text-base font-black bg-orange-600 hover:bg-orange-700 shadow-lg shadow-orange-200 flex items-center justify-center gap-2"
                        onClick={() => markAsReady(selectedOrder)}
                        disabled={!allChecked}
                      >
                        <Check className="w-5 h-5" />
                        <span>Validar Preparación</span>
                      </Button>
                    ) : (
                      <Button 
                        className="w-full h-13 text-base font-black bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                        onClick={() => executeOnboard(selectedOrder)}
                        disabled={!allChecked || !selectedOrder.routeId}
                      >
                        <PackageCheck className="w-5 h-5" />
                        <span>Confirmar Carga en Ruta</span>
                      </Button>
                    )}
                    
                    {!selectedOrder.routeId && (
                      <p className="text-[10px] text-red-600 text-center font-bold">
                        Requiere ruta asignada por Despacho para poder cargarse
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
                      className="flex-[2] h-12 font-bold bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-200"
                      onClick={() => saveOrderModifications(selectedOrder)}
                    >
                      Guardar Cambios
                    </Button>
                  </div>
                ) : (
                  <Button 
                    variant="outline"
                    className="w-full h-12 text-gray-700 font-bold hover:bg-gray-100"
                    onClick={() => setSelectedOrderId(null)}
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
