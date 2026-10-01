import { Timestamp } from 'firebase/firestore';

export type FirestoreTimestamp = any;

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type UserRole = 
  | 'client' 
  | 'company' 
  | 'admin' 
  | 'dispatcher' 
  | 'preparer' 
  | 'driver' 
  | 'loader' 
  | 'store_sales' 
  | 'inventory'
  | 'karey_inventory';

export interface Supplier {
  id: string;
  name: string;
  code?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  categoriesSupplied?: string[];
  notes?: string;
  isDefault?: boolean;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

export interface Category {
  id: string;
  name: string;
  subcategories: string[];
  imageUrl?: string;
  isHidden?: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  supplierId?: string;
  supplierName?: string;
  price: number;
  description?: string;
  imageUrl?: string;
  stock: number;
  reserved: number;
  unit?: 'Kg' | 'Paq' | 'Pza' | 'Fco' | 'Bolsa' | 'Caja';
  approxWeight?: number;
  isDeleted?: boolean;
  isHidden?: boolean;
  piecesPerJaba?: number;
  packaging?: 'bolsa' | 'jaba' | 'jaba_verde' | 'jaba_negra';
}

export interface InventoryRequest {
  id: string;
  productId: string;
  productName: string;
  type: 'update' | 'waste';
  oldValue: number;
  newValue: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedByName: string;
  supplierId?: string;
  supplierName?: string;
  invoiceOrDocNumber?: string;
  createdAt: FirestoreTimestamp;
}

export interface AppNotification {
  id: string;
  userId: string; // Target user
  title: string;
  message: string;
  type: 'order' | 'inventory' | 'system';
  read: boolean;
  createdAt: FirestoreTimestamp;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  viewAs?: UserRole;
  creditLimit?: number; // capturado por el admin, 0 o ausente = sin crédito autorizado
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  unit?: 'Kg' | 'Paq' | 'Pza' | 'Fco' | 'Bolsa' | 'Caja';
  approxWeight?: number;
  preparerWeight?: number;
  loaderWeight?: number;
  piecesPerJaba?: number;
  packaging?: 'bolsa' | 'jaba' | 'jaba_verde' | 'jaba_negra';
  comment?: string;
  notes?: string;
  checkedAt?: FirestoreTimestamp;
  preparerCheckedAt?: FirestoreTimestamp;
  loaderCheckedAt?: FirestoreTimestamp;
}

export interface Order {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'accepted' | 'processing' | 'ready' | 'shipped' | 'delivered' | 'cancelled' | 'completed';
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  address: string;
  location?: {
    lat: number;
    lng: number;
  };
  paymentStatus: 'pending' | 'paid' | 'failed';
  paymentMethod: 'cash' | 'card' | 'online' | 'card_on_delivery' | 'credit';
  deliverySlot?: string; // e.g., "2026-04-03 08:00-10:00"
  deliveryWindowStart?: string; // HH:mm format
  deliveryWindowEnd?: string; // HH:mm format
  deliveryWindowNote?: string;
  type: 'delivery' | 'pickup';
  pickupCode: string;
  driverId?: string;
  routeId?: string;
  placedBy?: string;
  eta?: string;
  driverLocation?: {
    lat: number;
    lng: number;
  };
  onboarded?: boolean;
  deliveryFee?: number;
  deliveryDistance?: number;
  discount?: number;
  adjustedTotal?: number;
  hasReturns?: boolean;
  returnedItems?: OrderItem[];
  isExchange?: boolean;
  arrivedAt?: FirestoreTimestamp;
  reviewedAt?: FirestoreTimestamp;
  dispatchedAt?: FirestoreTimestamp;
  dispatchedBy?: string;
  dispatchedByName?: string;
  preparedAt?: FirestoreTimestamp;
  preparedBy?: string;
  preparedByName?: string;
  loadedAt?: FirestoreTimestamp;
  loadedBy?: string;
  loadedByName?: string;
  deliveredAt?: FirestoreTimestamp;
  paidAt?: FirestoreTimestamp;
  processedBy?: string;
  processedByName?: string;
  weightValidated?: boolean;
  jvCount?: number;
  jnCount?: number;
  hasJaba?: boolean;
  notes?: string;
}

export interface DeliveryRoute {
  id: string;
  name: string;
  unitNumber: string;
  driverId: string;
  status: 'active' | 'in_progress' | 'completed' | 'cancelled';
  orderIds: string[];
  releasedToPrep?: boolean;
  assignedBy?: string;
  assignedByName?: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  containerVale?: {
    jvOut?: number;
    jnOut?: number;
    qtyOutBy?: string;
    qtyOutByName?: string;
    qtyOutAt?: FirestoreTimestamp;
    unitCost?: number;
  };
}

export interface Unit {
  id: string;
  number: string;
  status: 'available' | 'loading' | 'in_route' | 'in_pantano' | 'maintenance';
  lastDriverId?: string;
  lastDriverName?: string;
  lastRouteId?: string;
  lastRouteName?: string;
  currentMovementId?: string;
  jvPending: number;
  jnPending: number;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

export interface ContainerMovement {
  id: string;
  unitId: string;
  unitNumber: string;
  driverId: string;
  driverName: string;
  routeId?: string;
  routeName?: string;
  folio: string;
  jvOut: number;
  jnOut: number;
  jvIn?: number;
  jnIn?: number;
  jvShortage?: number;
  jnShortage?: number;
  payrollDeductionAmount?: number;
  exitTime: FirestoreTimestamp;
  entryTime?: FirestoreTimestamp;
  status: 'loading' | 'active' | 'pantano' | 'completed';
  registeredBy: string;
  registeredByName: string;
  reconciledBy?: string;
  reconciledByName?: string;
  notes?: string;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

export interface AppSettings {
  logoUrl?: string;
  appName?: string;
  shopAddress?: string;
  shopLat?: number;
  shopLng?: number;
  containerUnitCost?: number;
}

export interface ReturnItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  unit?: 'Kg' | 'Paq' | 'Pza' | 'Fco' | 'Bolsa' | 'Caja';
  approxWeight?: number;
  reason: string;
  photoUrl: string;
}

export interface Return {
  id: string;
  orderId: string;
  userId: string;
  userName: string;
  items: ReturnItem[];
  totalReduction: number;
  status: 'pending' | 'approved' | 'rejected';
  resolution: 'none' | 'waste' | 'stock';
  createdAt: FirestoreTimestamp;
  processedAt?: FirestoreTimestamp;
}

export interface ReturnSubmitPayload {
  orderId: string;
  userId?: string;
  userName?: string;
  items: ReturnItem[];
  totalReduction: number;
  status?: 'pending' | 'approved' | 'rejected';
  resolution?: 'none' | 'waste' | 'stock';
  createdAt?: FirestoreTimestamp;
}

export type Page = 
  | 'home' 
  | 'cart' 
  | 'current-order' 
  | 'history' 
  | 'profile' 
  | 'checkout' 
  | 'admin-dashboard' 
  | 'admin-users' 
  | 'admin-orders' 
  | 'dispatcher-view' 
  | 'dispatcher-history' 
  | 'preparer-view' 
  | 'preparer-history' 
  | 'driver-view' 
  | 'driver-history' 
  | 'inventory-view' 
  | 'admin-notifications' 
  | 'admin-inventory-tracking' 
  | 'admin-returns' 
  | 'loader-view' 
  | 'loader-history' 
  | 'admin-settings' 
  | 'product-detail' 
  | 'admin-categories' 
  | 'admin-activity' 
  | 'admin-units'
  | 'karey-dashboard'
  | 'karey-movement'
  | 'karey-return'
  | 'karey-transfer'
  | 'karey-balances'
  | 'store-sales-view' 
  | 'store-ticket';
