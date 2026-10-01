import { Product, Order } from '../types';

export interface StockValidationResult {
  isValid: boolean;
  availableStock: number;
  message?: string;
}

/**
 * Validates if an item can be fulfilled given the total physical stock and currently reserved units.
 * Prevents overselling by guaranteeing that `availableStock = stock - reserved`.
 */
export function validateStockAvailability(
  product: Pick<Product, 'name' | 'stock' | 'reserved'>,
  requestedQuantity: number
): StockValidationResult {
  if (requestedQuantity <= 0) {
    return {
      isValid: false,
      availableStock: Math.max(0, (product.stock || 0) - (product.reserved || 0)),
      message: 'La cantidad solicitada debe ser mayor a cero.',
    };
  }

  const stock = Number(product.stock) || 0;
  const reserved = Number(product.reserved) || 0;
  const availableStock = Math.max(0, stock - reserved);

  if (requestedQuantity > availableStock) {
    return {
      isValid: false,
      availableStock,
      message: `Stock insuficiente para "${product.name}". Disponible: ${availableStock}, Solicitado: ${requestedQuantity}`,
    };
  }

  return {
    isValid: true,
    availableStock,
  };
}

export interface InventoryDelta {
  reservedDelta: number;
  stockDelta: number;
}

/**
 * Computes exact inventory state transitions for order lifecycles:
 * - Pending -> Accepted/Shipped: Increases reservation.
 * - Accepted -> Delivered/Completed: Deducts physical stock and releases reservation.
 * - Pending/Accepted -> Cancelled: Releases reservation without modifying physical stock.
 */
export function calculateOrderStatusInventoryDelta(
  prevStatus: Order['status'] | null,
  newStatus: Order['status'],
  quantity: number
): InventoryDelta {
  if (quantity <= 0) {
    return { reservedDelta: 0, stockDelta: 0 };
  }

  // Order newly created / confirmed
  if ((prevStatus === null || prevStatus === 'pending') && (newStatus === 'accepted' || newStatus === 'processing' || newStatus === 'ready')) {
    return { reservedDelta: quantity, stockDelta: 0 };
  }

  // Order moving from reserved (processing/ready/shipped) to delivered/completed: physical deduction
  if (['pending', 'accepted', 'processing', 'ready', 'shipped'].includes(prevStatus || '') && (newStatus === 'delivered' || newStatus === 'completed')) {
    return {
      reservedDelta: prevStatus === 'pending' ? 0 : -quantity,
      stockDelta: -quantity,
    };
  }

  // Order cancelled: release reservation
  if (['accepted', 'processing', 'ready', 'shipped'].includes(prevStatus || '') && newStatus === 'cancelled') {
    return { reservedDelta: -quantity, stockDelta: 0 };
  }

  return { reservedDelta: 0, stockDelta: 0 };
}

/**
 * Handles stock resolution when an approved return is processed:
 * - 'stock': Item is in good condition, restocked back to inventory.
 * - 'waste': Item is damaged/spoiled, recorded as shrinkage/waste without increasing salable stock.
 * - 'none': No physical inventory adjustment.
 */
export function processReturnStockResolution(
  currentStock: number,
  returnQty: number,
  resolution: 'stock' | 'waste' | 'none'
): { newStock: number; wasteUnits: number } {
  const safeStock = Math.max(0, currentStock);
  const safeQty = Math.max(0, returnQty);

  if (resolution === 'stock') {
    return {
      newStock: safeStock + safeQty,
      wasteUnits: 0,
    };
  }

  if (resolution === 'waste') {
    return {
      newStock: safeStock,
      wasteUnits: safeQty,
    };
  }

  return {
    newStock: safeStock,
    wasteUnits: 0,
  };
}

/**
 * Calculates financial loss from damaged/spoiled goods (merma).
 */
export function calculateWasteLossValue(unitCostOrPrice: number, wasteQuantity: number): number {
  if (unitCostOrPrice <= 0 || wasteQuantity <= 0) return 0;
  return Math.round(unitCostOrPrice * wasteQuantity * 100) / 100;
}
