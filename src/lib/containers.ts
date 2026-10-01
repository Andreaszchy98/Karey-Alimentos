import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  getDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { DeliveryRoute, UserProfile, Unit, ContainerMovement, Order, OrderItem } from '../types';
import { JABA_CONFIG } from '../constants';

export interface SyncContainerMovementParams {
  route: DeliveryRoute;
  driver?: UserProfile | null;
  units: Unit[];
  movements?: ContainerMovement[];
  operatorProfile: UserProfile;
  jvCount: number;
  jnCount: number;
  notes?: string;
}

/**
 * Helper to check if a packaging value is any crate type
 */
export function isJabaPackaging(pkg?: string): boolean {
  return pkg === 'jaba' || pkg === 'jaba_verde' || pkg === 'jaba_negra';
}

/**
 * Helper to check if a packaging value is green crate (JV)
 */
export function isGreenJaba(pkg?: string): boolean {
  return pkg === 'jaba' || pkg === 'jaba_verde';
}

/**
 * Helper to check if a packaging value is black crate (JN)
 */
export function isBlackJaba(pkg?: string): boolean {
  return pkg === 'jaba_negra';
}

/**
 * Smart estimator for individual item container requirements based on JABA_CONFIG or packaging
 */
export function calculateItemEstimatedJabas(item: OrderItem): {
  isJaba: boolean;
  count: number;
  type: 'jv' | 'jn';
  matchedConfig?: { perJaba: number; unit: 'Pza' | 'Kg' };
} {
  const isNegra = item.packaging === 'jaba_negra';
  const isExplicitJaba = isJabaPackaging(item.packaging);
  
  // Look up item in JABA_CONFIG
  const itemNameLower = (item.name || '').toLowerCase();
  const configKey = Object.keys(JABA_CONFIG).find(k => itemNameLower.includes(k.toLowerCase()));
  const config = configKey ? JABA_CONFIG[configKey] : null;

  if (config) {
    let count = 0;
    if (config.unit === 'Kg') {
      const weight = item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : item.quantity);
      count = Math.max(1, Math.ceil(weight / config.perJaba));
    } else {
      count = Math.max(1, Math.ceil(item.quantity / config.perJaba));
    }
    return {
      isJaba: true,
      count,
      type: isNegra ? 'jn' : 'jv',
      matchedConfig: config
    };
  }

  if (item.piecesPerJaba && item.piecesPerJaba > 0) {
    const count = Math.max(1, Math.ceil(item.quantity / item.piecesPerJaba));
    return {
      isJaba: true,
      count,
      type: isNegra ? 'jn' : 'jv'
    };
  }

  if (isExplicitJaba) {
    const defaultCapacity = item.unit === 'Kg' ? 20 : 15;
    const qtyOrWeight = item.unit === 'Kg'
      ? (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : item.quantity))
      : item.quantity;
    const count = Math.max(1, Math.ceil(qtyOrWeight / defaultCapacity));
    return {
      isJaba: true,
      count,
      type: isNegra ? 'jn' : 'jv'
    };
  }

  return {
    isJaba: false,
    count: 0,
    type: 'jv'
  };
}

/**
 * Calculates the total estimated/predicted Green (JV) and Black (JN) jabas for an order's items
 */
export function calculateOrderEstimatedJabas(items: OrderItem[]): {
  estimatedJv: number;
  estimatedJn: number;
  totalJabas: number;
  hasJaba: boolean;
} {
  let estimatedJv = 0;
  let estimatedJn = 0;
  let hasJaba = false;

  for (const item of items) {
    const res = calculateItemEstimatedJabas(item);
    if (res.isJaba && res.count > 0) {
      hasJaba = true;
      if (res.type === 'jn') {
        estimatedJn += res.count;
      } else {
        estimatedJv += res.count;
      }
    }
  }

  return {
    estimatedJv,
    estimatedJn,
    totalJabas: estimatedJv + estimatedJn,
    hasJaba
  };
}

/**
 * Helper to analyze packaging and container count for an order,
 * respecting stored manual counts while recovering estimated counts if unset.
 */
export function getOrderContainerSummary(order: Order) {
  const greenJabaItems = order.items.filter(item => isGreenJaba(item.packaging));
  const blackJabaItems = order.items.filter(item => isBlackJaba(item.packaging));
  const jabaItems = order.items.filter(item => isJabaPackaging(item.packaging) || calculateItemEstimatedJabas(item).isJaba);
  const bagItems = order.items.filter(item => !item.packaging || item.packaging === 'bolsa');
  
  const estimated = calculateOrderEstimatedJabas(order.items);

  // Stored counts
  const hasStoredJv = typeof order.jvCount === 'number' && !isNaN(order.jvCount);
  const hasStoredJn = typeof order.jnCount === 'number' && !isNaN(order.jnCount);
  
  let jvCount = 0;
  let jnCount = 0;

  if (hasStoredJv || hasStoredJn) {
    jvCount = Math.max(0, order.jvCount || 0);
    jnCount = Math.max(0, order.jnCount || 0);
    // If stored as 0/0 but items are configured as jabas and order was not explicitly declared as no-jabas
    if (jvCount === 0 && jnCount === 0 && (order.hasJaba || greenJabaItems.length > 0 || blackJabaItems.length > 0)) {
      jvCount = estimated.estimatedJv;
      jnCount = estimated.estimatedJn;
    }
  } else {
    jvCount = estimated.estimatedJv;
    jnCount = estimated.estimatedJn;
  }

  const hasJaba = jvCount > 0 || jnCount > 0 || order.hasJaba === true || jabaItems.length > 0;

  return {
    hasJaba,
    jabaItems,
    greenJabaItems,
    blackJabaItems,
    bagItems,
    jabaItemCount: jabaItems.length,
    greenItemCount: greenJabaItems.length,
    blackItemCount: blackJabaItems.length,
    jvCount: Math.max(0, jvCount),
    jnCount: Math.max(0, jnCount),
    totalJabas: Math.max(0, jvCount) + Math.max(0, jnCount),
    isEstimated: !hasStoredJv && !hasStoredJn && estimated.totalJabas > 0,
    totalItems: order.items.length
  };
}

/**
 * Busca si el chofer ya tiene un ContainerMovement abierto (activo o cargando) SIN CERRAR,
 * distinto al movimiento que se está por crear/actualizar. Si lo encuentra, lo marca 'pantano'
 * junto con su unidad. Debe llamarse antes de crear o reabrir un vale para ese chofer,
 * sin importar si el vale se origina desde Karey (manual) o desde el flujo de carga (automático).
 */
export async function detectAndFlagPantano(
  driverId: string,
  movements: ContainerMovement[],
  excludeMovementId?: string
): Promise<void> {
  const prevOpen = movements.find(
    m => m.driverId === driverId &&
    (m.status === 'active' || m.status === 'loading') &&
    m.id !== excludeMovementId
  );
  if (!prevOpen) return;
  await updateDoc(doc(db, 'containerMovements', prevOpen.id), {
    status: 'pantano',
    updatedAt: serverTimestamp()
  });
  if (prevOpen.unitId) {
    await updateDoc(doc(db, 'units', prevOpen.unitId), {
      status: 'in_pantano',
      updatedAt: serverTimestamp()
    });
  }
}

/**
 * Calculates the exact aggregate jvCount and jnCount for a route given all orders,
 * optionally applying an updated single order override and checking route.orderIds.
 */
export function calculateRouteContainerTotals(
  routeId: string,
  allOrders: Order[],
  overrideOrder?: { id: string; jvCount: number; jnCount: number },
  route?: DeliveryRoute
): { totalJv: number; totalJn: number; totalJabas: number } {
  let totalJv = 0;
  let totalJn = 0;

  for (const order of allOrders) {
    const isOrderInRoute = order.routeId === routeId || (route && route.orderIds && route.orderIds.includes(order.id));
    if (!isOrderInRoute) continue;
    if (order.status === 'cancelled') continue;

    if (overrideOrder && order.id === overrideOrder.id) {
      totalJv += Math.max(0, overrideOrder.jvCount || 0);
      totalJn += Math.max(0, overrideOrder.jnCount || 0);
    } else {
      const summary = getOrderContainerSummary(order);
      totalJv += Math.max(0, summary.jvCount || 0);
      totalJn += Math.max(0, summary.jnCount || 0);
    }
  }

  // If overrideOrder is provided and wasn't found in allOrders
  const foundInAll = allOrders.some(o => o.id === overrideOrder?.id && (o.routeId === routeId || (route && route.orderIds && route.orderIds.includes(o.id))));
  if (overrideOrder && !foundInAll) {
    totalJv += Math.max(0, overrideOrder.jvCount || 0);
    totalJn += Math.max(0, overrideOrder.jnCount || 0);
  }

  return {
    totalJv,
    totalJn,
    totalJabas: totalJv + totalJn
  };
}

/**
 * Creates or updates the single unified ContainerMovement (Vale de Jabas) for a route,
 * syncing with the Unit state and Route state so Karey Inventory and Driver immediately see it.
 */
export async function syncRouteContainerMovement({
  route,
  driver,
  units,
  movements,
  operatorProfile,
  jvCount,
  jnCount,
  notes = ''
}: SyncContainerMovementParams): Promise<string> {
  const safeJv = Math.max(0, jvCount || 0);
  const safeJn = Math.max(0, jnCount || 0);
  const totalJabas = safeJv + safeJn;

  if (totalJabas <= 0 && !route.containerVale) {
    return '';
  }

  let containerUnitCost = 150;
  try {
    const settingsSnap = await getDoc(doc(db, 'settings', 'general'));
    if (settingsSnap.exists() && settingsSnap.data().containerUnitCost) {
      containerUnitCost = settingsSnap.data().containerUnitCost;
    }
  } catch {
    // default 150
  }

  // Find matching unit in the fleet
  const normalizedUnitNum = (route.unitNumber || '').trim().toUpperCase();
  const matchedUnit = units.find(u => u.number?.trim().toUpperCase() === normalizedUnitNum);

  // Check if an active/loading/pantano movement already exists for this route or unit
  let existingMovementDocId: string | null = null;
  let existingMovement: ContainerMovement | null = null;

  // First check in-memory movements array if available
  if (movements && movements.length > 0) {
    const localMatch = movements.find(m => 
      (m.routeId === route.id && (m.status === 'active' || m.status === 'loading' || m.status === 'pantano')) ||
      (matchedUnit && m.unitId === matchedUnit.id && (m.status === 'active' || m.status === 'loading'))
    );
    if (localMatch) {
      existingMovementDocId = localMatch.id;
      existingMovement = localMatch;
    }
  }

  if (!existingMovementDocId) {
    try {
      const movQuery = query(
        collection(db, 'containerMovements'),
        where('routeId', '==', route.id)
      );
      const movSnap = await getDocs(movQuery);
      
      if (!movSnap.empty) {
        const activeDoc = movSnap.docs.find(d => {
          const data = d.data();
          return data.status === 'active' || data.status === 'loading' || data.status === 'pantano';
        });
        if (activeDoc) {
          existingMovementDocId = activeDoc.id;
          existingMovement = { id: activeDoc.id, ...activeDoc.data() } as ContainerMovement;
        }
      }
    } catch (err) {
      console.warn('Error querying existing container movement:', err);
    }
  }

  const driverName = driver?.name || route.assignedByName || 'Chofer Asignado';

  if (existingMovementDocId && existingMovement) {
    // Update existing vale with the EXACT current route total
    await updateDoc(doc(db, 'containerMovements', existingMovementDocId), {
      jvOut: safeJv,
      jnOut: safeJn,
      unitId: matchedUnit?.id || existingMovement.unitId || '',
      unitNumber: route.unitNumber,
      driverId: route.driverId,
      driverName: driverName,
      routeName: route.name,
      status: totalJabas > 0 ? 'active' : 'completed',
      notes: notes ? (existingMovement.notes ? `${existingMovement.notes} | ${notes}` : notes) : existingMovement.notes,
      updatedAt: serverTimestamp()
    });

    // Update unit
    if (matchedUnit) {
      await updateDoc(doc(db, 'units', matchedUnit.id), {
        status: totalJabas > 0 ? 'in_route' : 'available',
        currentMovementId: totalJabas > 0 ? existingMovementDocId : null,
        jvPending: safeJv,
        jnPending: safeJn,
        lastDriverId: route.driverId,
        lastDriverName: driverName,
        lastRouteId: route.id,
        lastRouteName: route.name,
        updatedAt: serverTimestamp()
      });
    }

    // Update route vale
    await updateDoc(doc(db, 'routes', route.id), {
      containerVale: {
        jvOut: safeJv,
        jnOut: safeJn,
        qtyOutBy: operatorProfile.uid,
        qtyOutByName: operatorProfile.name,
        qtyOutAt: serverTimestamp(),
        unitCost: containerUnitCost
      }
    });

    return existingMovementDocId;
  } else if (totalJabas > 0) {
    // Check if driver has any other open movement without closing and flag as pantano
    if (movements && movements.length > 0) {
      await detectAndFlagPantano(route.driverId, movements, undefined);
    }

    // Generate clean unique folio
    const cleanUnit = (route.unitNumber || 'U').replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
    const timeSuffix = Date.now().toString().slice(-4);
    const folio = `VALE-${cleanUnit}-${timeSuffix}`;

    const newMovementData = {
      folio,
      unitId: matchedUnit?.id || '',
      unitNumber: route.unitNumber,
      driverId: route.driverId,
      driverName: driverName,
      routeId: route.id,
      routeName: route.name,
      jvOut: safeJv,
      jnOut: safeJn,
      exitTime: serverTimestamp(),
      status: 'active',
      registeredBy: operatorProfile.uid,
      registeredByName: operatorProfile.name,
      notes: notes || `Vale generado automáticamente desde carga/preparación de ruta ${route.name}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const movDocRef = await addDoc(collection(db, 'containerMovements'), newMovementData);

    // Update unit
    if (matchedUnit) {
      await updateDoc(doc(db, 'units', matchedUnit.id), {
        status: 'in_route',
        currentMovementId: movDocRef.id,
        jvPending: safeJv,
        jnPending: safeJn,
        lastDriverId: route.driverId,
        lastDriverName: driverName,
        lastRouteId: route.id,
        lastRouteName: route.name,
        updatedAt: serverTimestamp()
      });
    }

    // Update route vale
    await updateDoc(doc(db, 'routes', route.id), {
      containerVale: {
        jvOut: safeJv,
        jnOut: safeJn,
        qtyOutBy: operatorProfile.uid,
        qtyOutByName: operatorProfile.name,
        qtyOutAt: serverTimestamp(),
        unitCost: containerUnitCost
      }
    });

    return movDocRef.id;
  }

  return '';
}

export interface UpdateRouteUnitParams {
  route: DeliveryRoute;
  newUnitNumber: string;
  newDriverId: string;
  newDriverName: string;
  newRouteName?: string;
  units: Unit[];
  operatorProfile?: UserProfile;
}

/**
 * Synchronizes route changes (Unit change, Driver change, Route Name change) with:
 * 1. The active Container Movement (Vale) - updates unit, driver, route info directly (no duplicate creation).
 * 2. The previous unit (frees it up to available and clears pending containers).
 * 3. The new unit (assigns driver, status, route, and transfers pending containers count).
 * 4. The orders assigned to the route (updates driverId).
 */
export async function updateRouteUnitAndDriver({
  route,
  newUnitNumber,
  newDriverId,
  newDriverName,
  newRouteName,
  units,
  operatorProfile
}: UpdateRouteUnitParams): Promise<void> {
  const normOldUnit = (route.unitNumber || '').trim().toUpperCase();
  const normNewUnit = newUnitNumber.trim().toUpperCase();
  const isUnitChanged = normOldUnit !== normNewUnit;
  const isDriverChanged = route.driverId !== newDriverId;
  const updatedRouteName = newRouteName || route.name;

  const oldUnit = units.find(u => u.number?.trim().toUpperCase() === normOldUnit);
  const newUnit = units.find(u => u.number?.trim().toUpperCase() === normNewUnit);

  // 1. Update the route document
  await updateDoc(doc(db, 'routes', route.id), {
    name: updatedRouteName,
    unitNumber: normNewUnit,
    driverId: newDriverId,
    assignedByName: newDriverName,
    updatedAt: serverTimestamp()
  });

  // 2. Find any active container movement for this route or old unit
  let activeMovDocs: any[] = [];
  try {
    const movQuery = query(
      collection(db, 'containerMovements'),
      where('routeId', '==', route.id)
    );
    const movSnap = await getDocs(movQuery);
    activeMovDocs = movSnap.docs.filter(d => ['active', 'loading', 'pantano'].includes(d.data().status));

    if (activeMovDocs.length === 0 && normOldUnit) {
      const unitMovSnap = await getDocs(query(
        collection(db, 'containerMovements'),
        where('unitNumber', '==', normOldUnit)
      ));
      activeMovDocs = unitMovSnap.docs.filter(d => ['active', 'loading', 'pantano'].includes(d.data().status));
    }
  } catch (err) {
    console.warn('Error querying active container movements on route update:', err);
  }

  const activeMovementId = activeMovDocs.length > 0 ? activeMovDocs[0].id : null;

  // 3. Overwrite / update the existing movement (no duplicate creation!)
  for (const mDoc of activeMovDocs) {
    const existingData = mDoc.data() as ContainerMovement;
    const transferNote = isUnitChanged 
      ? `[Unidad reasignada: #${normOldUnit} -> #${normNewUnit} (${newDriverName})]`
      : `[Chofer reasignado: ${newDriverName}]`;

    await updateDoc(doc(db, 'containerMovements', mDoc.id), {
      unitNumber: normNewUnit,
      unitId: newUnit?.id || existingData.unitId || '',
      driverId: newDriverId,
      driverName: newDriverName,
      routeName: updatedRouteName,
      routeId: route.id,
      notes: existingData.notes ? `${existingData.notes} | ${transferNote}` : transferNote,
      updatedAt: serverTimestamp()
    });
  }

  // 4. Update the old unit if unit changed
  if (isUnitChanged && oldUnit) {
    await updateDoc(doc(db, 'units', oldUnit.id), {
      status: 'available',
      jvPending: 0,
      jnPending: 0,
      currentMovementId: null,
      lastRouteId: null,
      lastRouteName: null,
      updatedAt: serverTimestamp()
    });
  }

  // 5. Update the new unit
  if (newUnit) {
    const jv = route.containerVale?.jvOut || 0;
    const jn = route.containerVale?.jnOut || 0;
    const hasContainers = (jv + jn) > 0;

    await updateDoc(doc(db, 'units', newUnit.id), {
      status: hasContainers ? 'in_route' : 'loading',
      jvPending: jv,
      jnPending: jn,
      currentMovementId: activeMovementId || newUnit.currentMovementId || null,
      lastDriverId: newDriverId,
      lastDriverName: newDriverName,
      lastRouteId: route.id,
      lastRouteName: updatedRouteName,
      updatedAt: serverTimestamp()
    });
  }

  // 6. Update all orders assigned to this route so driverId stays in sync
  if (route.orderIds && route.orderIds.length > 0) {
    for (const orderId of route.orderIds) {
      try {
        await updateDoc(doc(db, 'orders', orderId), {
          driverId: newDriverId,
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        console.warn(`Error updating order ${orderId} during route edit:`, e);
      }
    }
  }
}
