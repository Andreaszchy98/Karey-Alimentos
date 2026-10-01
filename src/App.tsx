import React, { useState, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, onSnapshot, query, where, orderBy, addDoc, updateDoc, serverTimestamp, getDocFromServer, deleteDoc, deleteField, limit, startAfter, QuerySnapshot, DocumentData, QueryDocumentSnapshot, Unsubscribe } from 'firebase/firestore';
import { auth, db, storage, sRef, uploadBytes, getDownloadURL, deleteObject, uploadImage, signInWithGoogle, logout, handleFirestoreError, OperationType, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, updateProfile } from './firebase';
import { Product, UserProfile, Order, Page, OrderItem, InventoryRequest, AppNotification, AppSettings, Category, Return, DeliveryRoute, ToastType, UserRole, ReturnSubmitPayload, Unit, ContainerMovement, Supplier } from './types';
import { CATEGORIES, INITIAL_PRODUCTS, COLORS, JABA_CONFIG, INITIAL_SUPPLIERS } from './constants';
import { DEFAULT_TENANT_CONFIG, resolveTenantConfig } from './config/tenant';
import { Search, ShoppingCart, Home as HomeIcon, ClipboardList, History, User as UserIcon, Plus, Minus, ChevronRight, MapPin, CreditCard, CheckCircle2, Loader2, LogOut, Package, Users, ArrowLeft, X, Settings, ShieldCheck, Edit, Check, Bell, AlertTriangle, Trash2, CheckCircle, Truck, Phone, FileText, Image, Tags, Printer, ChevronDown, ChevronUp, Banknote, Mail, Locate, Navigation, Camera, RotateCcw, Calendar, Info, PackageCheck, PackageOpen, Clock, Download, ExternalLink, Store, Eye, EyeOff, RefreshCw, Box } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'motion/react';
import { Button, Input, KLogo, cn } from './components/ui';
import { OSMMap } from './components/OSMMap';
import { searchOSMPlaces, reverseOSMGeocode, reverseOSMDetails, getOSRMRoute, OSMPlace, RouteResult, calculateStraightDistance } from './lib/osm';
import { generateInvoicePDF } from './lib/invoice';
import { fileToBase64, compressImage, compressImageToBlob, transformImageUrl, sortOrdersByWindowAndDistance } from './lib/utils';
import { validateStockAvailability } from './lib/inventory';
import { calculateOrderPricing } from './lib/orders';
import { calculateRouteContainerTotals, syncRouteContainerMovement, calculateOrderEstimatedJabas } from './lib/containers';

// Modular Views
import {
  AdminDashboard,
  AdminUsersView,
  AdminSettingsView,
  AdminProductFormView,
  AdminCategoriesView,
  AdminInventoryTrackingView,
  AdminNotificationsView,
  AdminOrdersView,
  AdminReturnsView,
  AdminActivityView,
  AdminUnitsView,
  AdminSuppliersView
} from './views/admin';
import {
  KareyDashboard,
  KareyMovementForm,
  KareyReturnForm,
  KareyTransferForm,
  KareyDriverBalances
} from './views/karey';
import { DriverView } from './views/driver/DriverView';
import { DispatcherView } from './views/dispatcher/DispatcherView';
import { LoaderView } from './views/loader/LoaderView';
import { PreparerView } from './views/preparer/PreparerView';
import { StoreSalesView, StoreTicketView } from './views/store';
import {
  AddressPicker,
  CheckoutPage,
  CurrentOrderPage,
  HistoryPage,
  InventoryView,
  NavButton,
  ProductDetailPage,
  ProfilePage,
  ReturnModal
} from './views/shared';

const SHOP_LOCATION = {
  address: "Calle Torreón 2220, Francisco Villa, 82127 Mazatlán, Sin.",
  lat: 23.2422,
  lng: -106.4024
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  return calculateStraightDistance(lat1, lon1, lat2, lon2);
}

function getDeliveryFee(roadDistance: number) {
  // Ahora usamos la distancia real por carretera (kilómetros de conducción)
  if (roadDistance <= 3) return 30; // Mínimo para distancias muy cortas
  if (roadDistance <= 5) return 45;
  if (roadDistance <= 7) return 60;
  if (roadDistance <= 9) return 75;
  if (roadDistance <= 11) return 95;
  if (roadDistance <= 13) return 115;
  if (roadDistance <= 15) return 140;
  return 180;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "Algo salió mal.";
      let isQuotaError = false;
      try {
        if (this.state.error?.message) {
          const errInfo = JSON.parse(this.state.error.message);
          if (errInfo.error) {
            message = errInfo.error;
            if (message.includes('Quota limit exceeded')) {
              isQuotaError = true;
              message = "Se ha alcanzado el límite de uso diario gratuito de la base de datos. Este límite se reinicia automáticamente cada 24 horas.";
            }
          }
        }
      } catch (e) {
        message = this.state.error?.message || message;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-gray-100 text-center">
            <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{isQuotaError ? "Límite de Cuota Alcanzado" : "¡Ups!"}</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            {isQuotaError ? (
              <div className="space-y-4">
                <p className="text-xs text-gray-400">Puedes seguir usando la aplicación con los datos guardados localmente en algunos casos, o esperar al reinicio de la cuota.</p>
                <Button onClick={() => window.location.reload()} className="w-full">Reintentar</Button>
              </div>
            ) : (
              <Button onClick={() => window.location.reload()} className="w-full">Reintentar</Button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main App ---

export default function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOnlineStatus, setShowOnlineStatus] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOnlineStatus(true);
      setTimeout(() => setShowOnlineStatus(false), 3000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Estás sin conexión. Los datos podrían estar desactualizados.', 'error');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial server check
    const checkActualConnection = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOnline(false);
        return;
      }
      try {
        await getDocFromServer(doc(db, '_health', 'check'));
      } catch (error: unknown) {
        const err = error as { message?: string; code?: string };
        if (err.message?.includes('offline') || err.code === 'unavailable') {
          setIsOnline(false);
        }
      }
    };
    checkActualConnection();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const saved = localStorage.getItem('currentPage');
    return (saved as Page) || 'home';
  });
  const [adminOrderFilter, setAdminOrderFilter] = useState<Order['status'] | 'all'>('all');
  const [adminSelectedDate, setAdminSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [adminPeriod, setAdminPeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [cart, setCart] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : {};
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [sortBy, setSortBy] = useState<'name' | 'sales'>('name');
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]); // For admin
  const [lastOrderDoc, setLastOrderDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const [isFetchingOrders, setIsFetchingOrders] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]); // For admin
  const [allRoutes, setAllRoutes] = useState<DeliveryRoute[]>([]); // For dispatcher/loader
  const [allReturns, setAllReturns] = useState<Return[]>([]); // For admin
  const [units, setUnits] = useState<Unit[]>([]);
  const [containerMovements, setContainerMovements] = useState<ContainerMovement[]>([]);
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const cached = localStorage.getItem('karey_cached_products');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return INITIAL_PRODUCTS;
  });
  const [isFetchingProducts, setIsFetchingProducts] = useState(false);
  const [hasLoadedAllProducts, setHasLoadedAllProducts] = useState(false);
  const [inventoryRequests, setInventoryRequests] = useState<InventoryRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const cached = localStorage.getItem('karey_cached_categories');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return CATEGORIES.filter(c => c !== 'Todos').map(name => ({ id: name, name, subcategories: [] }));
  });
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      const cached = localStorage.getItem('karey_cached_suppliers');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return INITIAL_SUPPLIERS;
  });
  const [inventoryInitialTab, setInventoryInitialTab] = useState<'management' | 'sold' | 'waste' | 'entries' | 'suppliers'>('management');
  const [settings, setSettings] = useState<AppSettings | null>(() => {
    try {
      const cached = localStorage.getItem('karey_cached_settings');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  });
  const [isSyncing, setIsSyncing] = useState(false);

  const effectiveShopLocation = useMemo(() => ({
    address: settings?.shopAddress || SHOP_LOCATION.address,
    lat: settings?.shopLat || SHOP_LOCATION.lat,
    lng: settings?.shopLng || SHOP_LOCATION.lng
  }), [settings]);

  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null);
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [authMode, setAuthMode] = useState<'options' | 'email'>('options');
  const [emailMode, setEmailMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showRoleSelection, setShowRoleSelection] = useState(false);

  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [inventorySelectedCategory, setInventorySelectedCategory] = useState('Todos');
  const [inventorySelectedSubcategory, setInventorySelectedSubcategory] = useState('Todas');
  const [inventoryStockFilter, setInventoryStockFilter] = useState('all');

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.warn("SignOut error:", e);
    } finally {
      setUser(null);
      setProfile(null);
      setShowRoleSelection(false);
      setGuestMode(false);
      setAuthMode('options');
      setEmail('');
      setPassword('');
      setRegName('');
      setCurrentPage('home');
      localStorage.removeItem('currentPage');
      localStorage.removeItem('viewAs');
      showToast('Sesión cerrada correctamente', 'info');
    }
  };

  const loadUserProfile = async (u: User) => {
    try {
      const docRef = doc(db, 'users', u.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        const savedViewAs = data.role === 'admin' ? (localStorage.getItem('viewAs') as any) : undefined;
        setProfile({ ...data, viewAs: savedViewAs || data.viewAs || (data.role === 'admin' ? 'admin' : undefined) });
        setShowRoleSelection(false);
        if (data.role === 'admin') {
          if (savedViewAs === 'client' || savedViewAs === 'company') setCurrentPage('home');
          else if (savedViewAs === 'dispatcher') setCurrentPage('dispatcher-view');
          else if (savedViewAs === 'preparer') setCurrentPage('preparer-view');
          else if (savedViewAs === 'driver') setCurrentPage('driver-view');
          else if (savedViewAs === 'loader') setCurrentPage('loader-view');
          else if (savedViewAs === 'store_sales') setCurrentPage('store-sales-view');
          else if (savedViewAs === 'inventory') setCurrentPage('admin-inventory-tracking');
          else if (savedViewAs === 'karey_inventory') setCurrentPage('karey-dashboard');
          else setCurrentPage('admin-dashboard');
        }
        else if (data.role === 'dispatcher') setCurrentPage('dispatcher-view');
        else if (data.role === 'preparer') setCurrentPage('preparer-view');
        else if (data.role === 'driver') setCurrentPage('driver-view');
        else if (data.role === 'loader') setCurrentPage('loader-view');
        else if (data.role === 'store_sales') setCurrentPage('store-sales-view');
        else if (data.role === 'inventory') setCurrentPage('admin-inventory-tracking');
        else if (data.role === 'karey_inventory') setCurrentPage('karey-dashboard');
        else setCurrentPage('home');
      } else {
        // New user without profile document
        setShowRoleSelection(true);
      }
    } catch (err) {
      console.error("Error retrieving user profile:", err);
      const fallbackProfile: UserProfile = {
        uid: u.uid,
        name: u.displayName || u.email?.split('@')[0] || 'Usuario',
        email: u.email || '',
        role: 'client'
      };
      setProfile(fallbackProfile);
      setShowRoleSelection(false);
      setCurrentPage('home');
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isOnline) {
      showToast('No puedes iniciar sesión sin conexión a internet', 'error');
      return;
    }
    if (isAuthLoading) return;
    setIsAuthLoading(true);
    try {
      const loggedUser = await signInWithGoogle();
      if (loggedUser) {
        setUser(loggedUser);
        await loadUserProfile(loggedUser);
      }
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        showToast('No se completó el inicio con Google. Si no cerraste la ventana tú, puede ser tu conexión — intenta de nuevo o usa correo y contraseña.', 'info');
      } else if (err.code === 'auth/missing-or-invalid-nonce' || err.message?.includes('nonce') || err.message?.includes('Duplicate credential')) {
        showToast('Para iniciar con Google, usa el botón de correo o abre la app en pestaña nueva.', 'info');
      } else {
        console.error("SignInWithGoogle error:", error);
        showToast('Error al iniciar sesión con Google. Intenta con correo y contraseña.', 'error');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      showToast('No puedes iniciar sesión sin conexión a internet', 'error');
      return;
    }
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      showToast('Por favor completa el correo y la contraseña', 'error');
      return;
    }
    setIsAuthLoading(true);
    try {
      if (emailMode === 'register') {
        const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        if (regName.trim()) {
          await updateProfile(result.user, { displayName: regName.trim() }).catch(() => {});
        }
        await sendEmailVerification(result.user).catch(() => {});
        showToast('Cuenta creada exitosamente. ¡Bienvenido!', 'success');
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        showToast('Bienvenido a Karey Alimentos', 'success');
      }
    } catch (error: unknown) {
      console.error("Auth Error:", error);
      const err = error as { code?: string; message?: string };
      let msg = "Error al autenticar";
      if (err.code === 'auth/email-already-in-use') msg = "El correo ya está registrado. Selecciona 'Iniciar sesión'.";
      else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') msg = "Correo o contraseña incorrectos";
      else if (err.code === 'auth/invalid-email') msg = "El formato de correo no es válido";
      else if (err.code === 'auth/weak-password') msg = "La contraseña debe tener al menos 6 caracteres";
      else if (err.code === 'auth/too-many-requests') msg = "Demasiados intentos fallidos. Intenta más tarde o recupera tu contraseña";
      else if (err.code === 'auth/network-request-failed') msg = "Error de conexión. Verifica tu internet";
      else if (err.message) msg = err.message;
      showToast(msg, 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      showToast('Ingresa tu correo primero en el campo de texto', 'info');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      showToast('Enlace de recuperación enviado a tu correo', 'success');
    } catch {
      showToast('Error al enviar recuperación: verifica tu correo', 'error');
    }
  };
  const [isDriverOrdering, setIsDriverOrdering] = useState(false);
  const [isStoreOrdering, setIsStoreOrdering] = useState(false);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const hasSeeded = useRef(false);

  // Persist Cart
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  // Persist Current Page
  useEffect(() => {
    localStorage.setItem('currentPage', currentPage);
  }, [currentPage]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Auth & Profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await loadUserProfile(u);
      } else {
        setProfile(null);
        setShowRoleSelection(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);  // Public Data Fetches (Real-time)
  // On-demand & Cached Data Sync (0 database reads on tab clicks, filters, searching, and navigation)
  const refreshCatalogData = async (showNotification = false) => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const [productsSnap, categoriesSnap, settingsSnap, suppliersSnap] = await Promise.all([
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'categories')),
        getDoc(doc(db, 'settings', 'app')),
        getDocs(collection(db, 'suppliers'))
      ]);

      if (!productsSnap.empty) {
        const prods = productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
        setProducts(prods);
        try { localStorage.setItem('karey_cached_products', JSON.stringify(prods)); } catch (e) {}
        setHasLoadedAllProducts(true);
      }

      if (!categoriesSnap.empty) {
        const cats = categoriesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
        setCategories(cats);
        try { localStorage.setItem('karey_cached_categories', JSON.stringify(cats)); } catch (e) {}
      }

      if (!suppliersSnap.empty) {
        const sups = suppliersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
        setSuppliers(sups);
        try { localStorage.setItem('karey_cached_suppliers', JSON.stringify(sups)); } catch (e) {}
      }

      if (settingsSnap.exists()) {
        const sett = settingsSnap.data() as AppSettings;
        setSettings(sett);
        try { localStorage.setItem('karey_cached_settings', JSON.stringify(sett)); } catch (e) {}
      }

      try { localStorage.setItem('karey_cache_timestamp', Date.now().toString()); } catch (e) {}
      if (showNotification) {
        showToast('Catálogo e inventario sincronizados', 'success');
      }
    } catch (error) {
      console.error("Error syncing catalog:", error);
      if (showNotification) {
        showToast('Error al sincronizar datos', 'error');
      }
    } finally {
      setIsSyncing(false);
      setIsFetchingProducts(false);
    }
  };

  useEffect(() => {
    // Initial silent sync on mount
    refreshCatalogData(false);
  }, []);

  const loadAllProducts = async () => {
    await refreshCatalogData(false);
  };


  const loadOrders = async (isInitial = false) => {
    if (isFetchingOrders || (!isInitial && !hasMoreOrders)) return;
    setIsFetchingOrders(true);

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', thirtyDaysAgo),
        orderBy('createdAt', 'desc'),
        limit(200)
      );

      if (!isInitial && lastOrderDoc) {
        q = query(q, startAfter(lastOrderDoc));
      }

      const snapshot = await getDocs(q);
      const newOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      
      if (isInitial) {
        setAllOrders(newOrders);
      } else {
        setAllOrders(prev => [...prev, ...newOrders]);
      }

      setLastOrderDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMoreOrders(snapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setIsFetchingOrders(false);
    }
  };

  const loadAuthenticatedData = async () => {
    if (!user || !profile) return;
    
    // Refined queries with limits
    const requestsQuery = query(collection(db, 'inventoryRequests'), orderBy('createdAt', 'desc'), limit(100));
    const returnsQuery = query(collection(db, 'returns'), orderBy('createdAt', 'desc'), limit(50));
    const usersQuery = query(collection(db, 'users'), limit(100));

    if (profile.role === 'admin' || profile.role === 'dispatcher' || profile.role === 'loader' || profile.role === 'preparer' || profile.role === 'driver' || profile.role === 'store_sales' || profile.role === 'inventory') {
      try {
        const [requestsSnap, returnsSnap] = await Promise.all([
          getDocs(requestsQuery),
          getDocs(returnsQuery)
        ]);
        setInventoryRequests(requestsSnap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryRequest)));
        setAllReturns(returnsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Return)));
      } catch (error) {
        console.error("Error loading authenticated data:", error);
      }
    }

    if (profile.role === 'admin' || profile.role === 'loader' || profile.role === 'karey_inventory' || profile.role === 'dispatcher') {
      try {
        const usersSnap = await getDocs(usersQuery);
        setAllUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      } catch (error) {
        console.error("Error loading users:", error);
      }
    }
  };

  // Authenticated Data Listeners & One-time loads
  useEffect(() => {
    if (!user || !profile) return;

    // Load initial orders
    if (profile.role === 'admin' || profile.role === 'dispatcher' || profile.role === 'loader' || profile.role === 'preparer' || profile.role === 'driver' || profile.role === 'store_sales' || profile.role === 'inventory') {
      loadOrders(true);
    }

    // Load static-ish data once
    loadAuthenticatedData();

    // Notifications - Real-time
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const notificationsUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      setNotifications(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'notifications'));

    // Critical Real-time listeners
    let adminOrdersUnsubscribe: Unsubscribe | null = null;
    let routesUnsubscribe: Unsubscribe | null = null;

    if (profile.role === 'admin' || profile.role === 'dispatcher' || profile.role === 'driver' || profile.role === 'loader' || profile.role === 'preparer' || profile.role === 'store_sales') {
      const activeOrdersQuery = query(
        collection(db, 'orders'), 
        where('status', 'in', ['pending', 'accepted', 'processing', 'ready', 'shipped']), 
        orderBy('createdAt', 'desc'), 
        limit(100)
      );
      adminOrdersUnsubscribe = onSnapshot(activeOrdersQuery, (snapshot) => {
        setAllOrders(prev => {
          const updated = [...prev];
          snapshot.docChanges().forEach(change => {
            const data = { id: change.doc.id, ...change.doc.data() } as Order;
            const idx = updated.findIndex(o => o.id === data.id);
            if (change.type === 'added' && idx === -1) {
              updated.unshift(data);
            } else if (change.type === 'modified' && idx !== -1) {
              updated[idx] = data;
            } else if (change.type === 'removed' && idx !== -1) {
              updated.splice(idx, 1);
            }
          });
          return updated.sort((a: Order, b: Order) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        });
      }, (error) => handleFirestoreError(error, OperationType.GET, 'orders'));
    }

    if (profile.role === 'driver' || profile.role === 'admin' || profile.role === 'dispatcher' || profile.role === 'karey_inventory' || profile.role === 'loader') {
      const routesQuery = query(collection(db, 'routes'), orderBy('createdAt', 'desc'), limit(50));
      routesUnsubscribe = onSnapshot(routesQuery, (snapshot) => {
        setAllRoutes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryRoute)));
      }, (error) => handleFirestoreError(error, OperationType.GET, 'routes'));
    }

    // Units listener
    let unitsUnsubscribe: Unsubscribe | null = null;
    let movementsUnsubscribe: Unsubscribe | null = null;
    if (profile.role === 'admin' || profile.role === 'karey_inventory' || profile.role === 'loader' || profile.role === 'dispatcher' || profile.role === 'driver') {
      const unitsQuery = query(collection(db, 'units'), orderBy('number', 'asc'));
      unitsUnsubscribe = onSnapshot(unitsQuery, (snapshot) => {
        setUnits(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Unit)));
      }, (err) => console.warn("Units listener warning:", err));

      const movementsQuery = query(collection(db, 'containerMovements'), orderBy('exitTime', 'desc'), limit(100));
      movementsUnsubscribe = onSnapshot(movementsQuery, (snapshot) => {
        setContainerMovements(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ContainerMovement)));
      }, (err) => console.warn("Movements listener warning:", err));
    }

    return () => {
      notificationsUnsubscribe();
      if (adminOrdersUnsubscribe) adminOrdersUnsubscribe();
      if (routesUnsubscribe) routesUnsubscribe();
      if (unitsUnsubscribe) unitsUnsubscribe();
      if (movementsUnsubscribe) movementsUnsubscribe();
    };
  }, [user, profile]);

  const handleRoleSelection = async (role: 'client' | 'company') => {
    if (!user) return;
    const cleanName = user.displayName?.trim() || user.email?.split('@')[0] || 'Usuario';
    const newProfile: UserProfile = {
      uid: user.uid,
      name: cleanName,
      email: user.email || '',
      role: role
    };
    try {
      await setDoc(doc(db, 'users', user.uid), newProfile);
    } catch (err) {
      console.error("Error saving user profile role:", err);
    }
    setProfile(newProfile);
    setShowRoleSelection(false);
    setCurrentPage('home');
  };

  // Orders Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(fetchedOrders);
      const active = fetchedOrders.find(o => ['pending', 'processing', 'ready', 'shipped'].includes(o.status));
      setCurrentOrder(active || null);
    }, (error) => {
      console.error("Firestore Error:", error);
    });
    return unsubscribe;
  }, [user]);

  const effectiveRole = profile?.role === 'admin' ? (profile.viewAs || 'admin') : profile?.role;

  useEffect(() => {
    if (profile?.role === 'admin') {
      const view = profile.viewAs || 'admin';
      if (view === 'admin') setCurrentPage('admin-dashboard');
      else if (view === 'client' || view === 'company') setCurrentPage('home');
      else if (view === 'dispatcher') setCurrentPage('dispatcher-view');
      else if (view === 'preparer') setCurrentPage('preparer-view');
      else if (view === 'driver') setCurrentPage('driver-view');
      else if (view === 'loader') setCurrentPage('loader-view');
      else if (view === 'inventory') setCurrentPage('admin-inventory-tracking');
      else if (view === 'store_sales') setCurrentPage('store-sales-view');
    } else if (profile?.role) {
      if (profile.role === 'dispatcher') setCurrentPage('dispatcher-view');
      else if (profile.role === 'preparer') setCurrentPage('preparer-view');
      else if (profile.role === 'driver') setCurrentPage('driver-view');
      else if (profile.role === 'loader') setCurrentPage('loader-view');
      else if (profile.role === 'inventory') setCurrentPage('admin-inventory-tracking');
      else if (profile.role === 'store_sales') setCurrentPage('store-sales-view');
    }
  }, [profile?.viewAs, profile?.role]);

  const cartTotal = useMemo(() => {
    return Object.entries(cart).reduce((sum, [id, qty]) => {
      const product = products.find(p => p.id === id);
      if (!product) return sum;
      const multiplier = product.unit === 'Kg' ? (product.approxWeight || 1) : 1;
      return sum + (product.price * multiplier) * qty;
    }, 0);
  }, [cart, products]);

  const cartItemsCount = useMemo(() => {
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  }, [cart]);

  const filteredProducts = useMemo(() => {
    const productSales: Record<string, number> = {};
    allOrders.forEach(order => {
      if (order.status !== 'cancelled') {
        order.items.forEach(item => {
          productSales[item.productId] = (productSales[item.productId] || 0) + item.quantity;
        });
      }
    });

    const hiddenCategoryNames = new Set(
      categories.filter(c => c.isHidden).map(c => c.name)
    );

    const filtered = products.filter(p => {
      if (!p) return false;
      const name = p.name || '';
      const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
      const matchesSubcategory = selectedSubcategory === 'Todas' || p.subcategory === selectedSubcategory;
      const isVisible = !p.isHidden || effectiveRole === 'admin';
      const isCategoryVisible = effectiveRole === 'admin' || !hiddenCategoryNames.has(p.category);
      
      return matchesSearch && matchesCategory && matchesSubcategory && !p.isDeleted && isVisible && isCategoryVisible;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'sales') {
        const salesA = productSales[a.id] || 0;
        const salesB = productSales[b.id] || 0;
        return salesB - salesA;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [searchQuery, selectedCategory, selectedSubcategory, products, categories, allOrders, sortBy, effectiveRole]);

  const updateCart = (productId: string, delta: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    setCart(prev => {
      const currentQty = prev[productId] || 0;
      let newQty = currentQty + delta;

      if (delta > 0) {
        const validation = validateStockAvailability(product, newQty);
        if (!validation.isValid) {
          showToast(validation.message || `Solo hay ${validation.availableStock} piezas disponibles de ${product.name}`, 'info');
          newQty = validation.availableStock;
        }
      }

      if (newQty <= 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: newQty };
    });
  };

  const setCartQuantity = (productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    let finalQty = quantity;
    if (finalQty > 0) {
      const validation = validateStockAvailability(product, finalQty);
      if (!validation.isValid) {
        showToast(validation.message || `Solo hay ${validation.availableStock} piezas disponibles de ${product.name}`, 'info');
        finalQty = validation.availableStock;
      }
    }

    setCart(prev => {
      if (finalQty <= 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: finalQty };
    });
  };

  const handleCheckout = async (
    address: string, 
    deliverySlot: string, 
    paymentMethod: 'cash' | 'card' | 'credit', 
    recipientName?: string, 
    type: 'delivery' | 'pickup' = 'delivery', 
    notes: string = '', 
    location?: { lat: number, lng: number }, 
    preCalculatedFee?: number, 
    preCalculatedDistance?: number,
    deliveryWindowStart?: string,
    deliveryWindowEnd?: string
  ) => {
    if (!user || !profile) return;
    
    // Use pre-calculated values if provided, otherwise fallback to simple calculation (though pre-calculated is preferred)
    let deliveryFee = preCalculatedFee !== undefined ? preCalculatedFee : 0;
    let deliveryDistance = preCalculatedDistance !== undefined ? preCalculatedDistance : 0;

    if (type === 'delivery' && location && preCalculatedFee === undefined) {
      const distance = calculateDistance(effectiveShopLocation.lat, effectiveShopLocation.lng, location.lat, location.lng);
      deliveryDistance = distance * 1.3; // fallback estimate
      deliveryFee = getDeliveryFee(deliveryDistance);
    }

    const orderItems: OrderItem[] = Object.entries(cart).map(([id, qty]) => {
      const p = products.find(prod => prod.id === id) || INITIAL_PRODUCTS.find(prod => prod.id === id);
      return {
        productId: id,
        name: p?.name || 'Producto Desconocido',
        quantity: qty,
        price: p?.price || 0,
        unit: p?.unit || 'Paq',
        approxWeight: p?.approxWeight || 0,
        packaging: p?.packaging || 'bolsa'
      };
    });

    const pricing = calculateOrderPricing(orderItems, deliveryFee, 0);

    const pickupCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const isStoreSale = isStoreOrdering || profile.role === 'store_sales';

    // Calculate smart initial container counts based on JABA_CONFIG & packaging
    const estContainers = calculateOrderEstimatedJabas(orderItems);
    const orderJv = estContainers.estimatedJv;
    const orderJn = estContainers.estimatedJn;
    const orderHasJaba = estContainers.hasJaba || orderJv > 0 || orderJn > 0;

    // Find driver's active route if placing order from driver view
    const activeDriverRoute = isDriverOrdering 
      ? allRoutes.find(r => r.driverId === profile.uid && (r.status === 'in_progress' || r.status === 'active'))
      : undefined;

    const newOrder: Omit<Order, 'id'> = {
      userId: (isDriverOrdering || isStoreSale) ? `${isDriverOrdering ? 'driver' : 'store'}-placed` : (user?.uid || 'unknown'),
      userName: (isDriverOrdering || isStoreSale) ? (recipientName || 'Cliente') : (profile.name || 'Usuario'),
      userEmail: (isDriverOrdering || isStoreSale) ? `${isDriverOrdering ? 'driver' : 'store'}@kareyalimentos.com` : (profile.email || ''),
      userPhone: (isDriverOrdering || isStoreSale) ? '' : (profile.phone || ''),
      items: orderItems || [],
      total: pricing.total,
      status: isDriverOrdering ? 'shipped' : (isStoreSale ? 'processing' : 'pending'),
      onboarded: isDriverOrdering ? true : false,
      ...(isDriverOrdering && profile?.uid ? { driverId: profile.uid } : {}),
      ...(activeDriverRoute ? { routeId: activeDriverRoute.id } : {}),
      jvCount: orderJv,
      jnCount: orderJn,
      hasJaba: orderHasJaba,
      type: isStoreSale ? 'pickup' : (type || 'delivery'),
      pickupCode: pickupCode || 'ERROR', 
      createdAt: serverTimestamp(),
      address: (isStoreSale || type === 'pickup') ? (effectiveShopLocation.address || 'Tienda') : (address || ''),
      location: type === 'delivery' && location && typeof location.lat === 'number' && typeof location.lng === 'number' 
        ? { lat: location.lat, lng: location.lng } 
        : null,
      notes: notes || '',
      paymentStatus: (isStoreSale && paymentMethod === 'card') ? 'paid' : (isStoreSale ? 'pending' : (paymentMethod === 'card' ? 'paid' : 'pending')),
      paymentMethod: paymentMethod || 'cash',
      deliverySlot: (isStoreSale || type === 'pickup') ? 'Inmediato' : (deliverySlot || 'Próximo Reparto'),
      deliveryWindowStart: deliveryWindowStart || null,
      deliveryWindowEnd: deliveryWindowEnd || null,
      deliveryFee: Number(deliveryFee) || 0,
      deliveryDistance: Number(deliveryDistance) || 0,
      ...((isDriverOrdering || isStoreSale) && profile?.uid ? { placedBy: profile.uid } : {})
    };

    try {
      // For store sales, we use a custom ID prefix for easy identification in history
      const orderRef = isStoreSale ? doc(collection(db, 'orders')) : null;
      const orderId = orderRef ? `STORE-${orderRef.id.slice(0, 8)}` : null;
      
      const docRef = orderId 
        ? (await setDoc(doc(db, 'orders', orderId), newOrder), { id: orderId })
        : await addDoc(collection(db, 'orders'), newOrder);
        
      const finalOrder = { id: docRef.id, ...newOrder };

      // If driver placed on route, attach order to the route and sync the container movement
      if (isDriverOrdering && activeDriverRoute) {
        const updatedOrderIds = activeDriverRoute.orderIds.includes(docRef.id) 
          ? activeDriverRoute.orderIds 
          : [...activeDriverRoute.orderIds, docRef.id];
        
        await updateDoc(doc(db, 'routes', activeDriverRoute.id), {
          orderIds: updatedOrderIds,
          updatedAt: serverTimestamp()
        });

        const updatedAllOrders = [...allOrders, finalOrder as Order];
        const routeTotals = calculateRouteContainerTotals(activeDriverRoute.id, updatedAllOrders, undefined, { ...activeDriverRoute, orderIds: updatedOrderIds });

        if (routeTotals.totalJabas > 0 || activeDriverRoute.containerVale) {
          await syncRouteContainerMovement({
            route: { ...activeDriverRoute, orderIds: updatedOrderIds },
            driver: profile,
            units,
            movements: containerMovements,
            operatorProfile: profile,
            jvCount: routeTotals.totalJv,
            jnCount: routeTotals.totalJn,
            notes: 'Actualizado automáticamente al registrar venta en ruta'
          });
        }
      }

      setCart({});
      if (isDriverOrdering) {
        setIsDriverOrdering(false);
        setCurrentPage('driver-view');
      } else if (isStoreOrdering) {
        setLastOrder(finalOrder);
        setIsStoreOrdering(false);
        setCurrentPage('store-ticket');
      } else {
        setCurrentPage('current-order');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-900" />
      </div>
    );
  }

  if (showRoleSelection) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
        <div className="mb-6">
          <KLogo size="w-24 h-24 text-4xl" logoUrl={settings?.logoUrl} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Selecciona tu tipo de perfil</h1>
        <p className="text-gray-500 mb-8 max-w-xs">Elige cómo usarás la aplicación para darte la mejor experiencia.</p>
        <div className="w-full max-w-xs space-y-4">
          <button 
            onClick={() => handleRoleSelection('client')}
            className="w-full p-6 bg-white border-2 border-gray-100 rounded-2xl text-left hover:border-emerald-600 hover:bg-emerald-50 transition-all group"
          >
            <h3 className="font-bold text-gray-900 group-hover:text-emerald-600">Cliente Individual</h3>
            <p className="text-xs text-gray-500">Para compras personales y familiares.</p>
          </button>
          <button 
            onClick={() => handleRoleSelection('company')}
            className="w-full p-6 bg-white border-2 border-gray-100 rounded-2xl text-left hover:border-emerald-600 hover:bg-emerald-50 transition-all group"
          >
            <h3 className="font-bold text-gray-900 group-hover:text-emerald-600">Empresa / Negocio</h3>
            <p className="text-xs text-gray-500">Para compras al por mayor con incrementos de 10 o 100.</p>
          </button>
        </div>
      </div>
    );
  }

  if (!user && !guestMode) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
        <div className="mb-8">
          <KLogo size="w-32 h-32 text-5xl" logoUrl={settings?.logoUrl} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2 font-sans tracking-tight">Bienvenido a {settings?.appName || 'Karey Alimentos'}</h1>
        <p className="text-gray-500 mb-8 max-w-xs">Tus carnes frías y embutidos favoritos, con la calidad y frescura de siempre.</p>
        
        <div className="w-full max-w-xs space-y-4">
          <div id="recaptcha-container"></div>
          {authMode === 'options' ? (
            <div className="space-y-3">
              <Button 
                onClick={handleGoogleSignIn} 
                disabled={isAuthLoading}
                className="w-full flex items-center justify-center gap-3 py-4 shadow-lg shadow-blue-100 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-70"
              >
                {isAuthLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                ) : (
                  <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" className="w-5 h-5 flex-shrink-0" alt="Google Logo" referrerPolicy="no-referrer" />
                )}
                <span className="font-semibold text-[#1f1f1f]">
                  {isAuthLoading ? 'Iniciando sesión...' : 'Continuar con Google'}
                </span>
              </Button>
              <Button onClick={() => setAuthMode('email')} variant="secondary" className="w-full py-4 flex items-center justify-center gap-3 border border-gray-100 bg-white shadow-sm">
                <Mail className="w-5 h-5 text-blue-900" />
                <span className="font-semibold text-gray-700">Continuar con Correo</span>
              </Button>
              <div className="relative py-3">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400 font-bold">O</span></div>
              </div>
              <Button variant="outline" onClick={() => setGuestMode(true)} className="w-full py-4 border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-600">
                Ver catálogo como invitado
              </Button>
              
              {window.self !== window.top && (
                <div className="pt-2 text-center">
                  <a 
                    href={window.location.href} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-[11px] text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
                  >
                    <span>Abrir en pestaña nueva para acceso completo</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 text-left">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setAuthMode('options')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <ArrowLeft className="w-5 h-5 text-gray-500" />
                </button>
                <h2 className="text-lg font-bold text-gray-900">
                  {emailMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                </h2>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-3">
                {emailMode === 'register' && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Nombre Completo</label>
                    <Input 
                      placeholder="Ej. Juan Pérez" 
                      value={regName} 
                      onChange={(e: any) => setRegName(e.target.value)} 
                      required 
                    />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Correo Electrónico</label>
                  <Input 
                    type="email" 
                    placeholder="correo@ejemplo.com" 
                    value={email} 
                    onChange={(e: any) => setEmail(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Contraseña</label>
                  <Input 
                    type="password" 
                    placeholder="••••••••" 
                    value={password} 
                    onChange={(e: any) => setPassword(e.target.value)} 
                    required 
                  />
                </div>

                <div className="pt-2">
                  <Button type="submit" disabled={isAuthLoading} className="w-full py-3">
                    {isAuthLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (emailMode === 'login' ? 'Entrar' : 'Registrarme')}
                  </Button>
                </div>
              </form>

              <div className="text-center space-y-2 pt-2">
                <button 
                  onClick={() => setEmailMode(emailMode === 'login' ? 'register' : 'login')}
                  className="text-xs text-blue-900 font-bold hover:underline"
                >
                  {emailMode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
                </button>
                {emailMode === 'login' && (
                  <div>
                    <button onClick={handleResetPassword} className="text-xs text-gray-400 hover:text-gray-600">
                      Olvidé mi contraseña
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between max-w-md md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <KLogo size="w-10 h-10 text-xl" logoUrl={settings?.logoUrl} />
            <div>
              <h1 className="text-lg font-bold text-blue-900 leading-tight">{settings?.appName || 'Karey Alimentos'}</h1>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                {effectiveRole === 'admin' ? 'Panel Admin' : effectiveRole === 'company' ? 'Empresa' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {profile?.role === 'admin' && (
              <select 
                className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-gray-50 font-bold text-gray-600"
                value={profile.viewAs || 'admin'}
                onChange={(e) => {
                  const newView = e.target.value as any;
                  const updated = { ...profile, viewAs: newView };
                  localStorage.setItem('viewAs', newView);
                  setProfile(updated);
                }}
              >
                <option value="admin">Ver como Admin</option>
                <option value="client">Ver como Cliente</option>
                <option value="company">Ver como Empresa</option>
                <option value="dispatcher">Ver como Despacho</option>
                <option value="preparer">Ver como Preparación</option>
                <option value="loader">Ver como Cargador</option>
                <option value="store_sales">Ver como Cajero</option>
                <option value="driver">Ver como Repartidor</option>
                <option value="inventory">Ver como Inventarios</option>
              </select>
            )}
            {user ? (
              <>
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{profile?.name}</p>
                  <p className="text-xs text-gray-400">{profile?.email}</p>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-10 h-10 rounded-full border-2 border-gray-100 shadow-sm" alt="Profile" />
                ) : (
                  <div className="w-10 h-10 rounded-full border-2 border-gray-100 shadow-sm bg-gray-100 flex items-center justify-center">
                    <UserIcon className="w-6 h-6 text-gray-400" />
                  </div>
                )}
              </>
            ) : (
              <Button variant="outline" onClick={() => setGuestMode(false)} className="text-xs py-1.5 px-3">
                Iniciar Sesión
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto p-4 pb-24">
        {/* Connectivity Banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 z-[60] sticky top-0"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Sin conexión a internet. Cambios guardados localmente serán sincronizados al volver.</span>
          </motion.div>
        )}
        {showOnlineStatus && isOnline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-green-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 z-[60] sticky top-0"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Conexión restablecida</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
          {currentPage === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {isDriverOrdering && (
                <div className="bg-blue-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-blue-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold opacity-80 uppercase tracking-wider">Modo Repartidor</p>
                      <p className="font-bold">Realizando pedido para cliente</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setIsDriverOrdering(false);
                      setCurrentPage('driver-view');
                    }}
                    className="bg-white/10 hover:bg-white/20 text-white border-none text-[10px] font-bold"
                  >
                    Volver a Ruta
                  </Button>
                </div>
              )}
              {effectiveRole === 'admin' && (
                <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">Modo Administrador</h3>
                    <p className="text-xs opacity-80">Gestiona pedidos y usuarios</p>
                  </div>
                  <Button 
                    onClick={() => setCurrentPage('admin-dashboard')}
                    className="bg-white text-blue-600 hover:bg-blue-50 text-xs py-1.5"
                  >
                    Ir al Dashboard
                  </Button>
                </div>
              )}
              {/* Search */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input 
                    placeholder="Buscar productos..." 
                    className="pl-10 h-12"
                    value={searchQuery}
                    onChange={(e: any) => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="px-3 h-12 bg-white border border-gray-100 rounded-xl text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-600/20"
                >
                  <option value="name">A-Z</option>
                  <option value="sales">Más Vendidos</option>
                </select>
              </div>

              {/* Categories */}
              <div className="space-y-3">
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  <button
                    onClick={() => {
                      setSelectedCategory('Todos');
                      setSelectedSubcategory('Todas');
                    }}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                      selectedCategory === 'Todos' 
                        ? "bg-blue-900 text-white shadow-md shadow-blue-200" 
                        : "bg-white text-gray-600 border border-gray-100"
                    )}
                  >
                    Todos
                  </button>
                  {categories.filter(cat => !cat.isHidden || effectiveRole === 'admin').map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(cat.name);
                        setSelectedSubcategory('Todas');
                      }}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5",
                        selectedCategory === cat.name 
                          ? "bg-blue-900 text-white shadow-md shadow-blue-200" 
                          : "bg-white text-gray-600 border border-gray-100",
                        cat.isHidden && effectiveRole === 'admin' ? "opacity-60 border-dashed border-amber-400" : ""
                      )}
                    >
                      <span>{cat.name}</span>
                      {cat.isHidden && effectiveRole === 'admin' && (
                        <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                      )}
                    </button>
                  ))}
                </div>

                {selectedCategory !== 'Todos' && categories.find(c => c.name === selectedCategory)?.subcategories.length! > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    <button
                      onClick={() => setSelectedSubcategory('Todas')}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                        selectedSubcategory === 'Todas' 
                          ? "bg-gray-800 text-white" 
                          : "bg-gray-100 text-gray-500"
                      )}
                    >
                      Todas
                    </button>
                    {categories.find(c => c.name === selectedCategory)?.subcategories.map(sub => (
                      <button
                        key={sub}
                        onClick={() => setSelectedSubcategory(sub)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                          selectedSubcategory === sub 
                            ? "bg-gray-800 text-white" 
                            : "bg-gray-100 text-gray-500"
                        )}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Products */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredProducts.map(product => {
                  const isSoldOut = (product.stock || 0) <= (product.reserved || 0);

                  return (
                    <div key={product.id} className={cn(
                      "bg-white rounded-2xl p-3 border border-gray-100 shadow-sm hover:shadow-md transition-all relative",
                      isSoldOut && "opacity-75"
                    )}>
                      {isSoldOut && (
                        <div className="absolute top-2 right-2 z-10">
                          <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Agotado
                          </span>
                        </div>
                      )}
                      {product.isHidden && effectiveRole === 'admin' && (
                        <div className="absolute top-2 left-2 z-10">
                          <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                            <EyeOff className="w-2.5 h-2.5" />
                            Oculto
                          </span>
                        </div>
                      )}
                      <div 
                        className="cursor-pointer"
                        onClick={() => {
                          setSelectedProductForDetail(product);
                          setCurrentPage('product-detail');
                        }}
                      >
                      {product.imageUrl ? (
                        <img src={product.imageUrl} className="w-full aspect-square object-cover rounded-xl mb-3" alt={product.name} referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full aspect-square bg-gray-100 rounded-xl mb-3 flex items-center justify-center">
                          <Package className="w-8 h-8 text-gray-300" />
                        </div>
                      )}
                      <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 min-h-[40px]">
                        {product.name}
                        {product.unit === 'Kg' && product.approxWeight && (
                          <span className="text-gray-400 font-normal"> ({product.approxWeight} Kg aprox.)</span>
                        )}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">
                      {product.category}
                      {product.subcategory && ` • ${product.subcategory}`}
                    </p>
                    <div className="mt-auto pt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-bold text-blue-900">
                            ${(product.unit === 'Kg' ? product.price * (product.approxWeight || 1) : product.price).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-gray-400 font-normal">
                             ${product.price.toFixed(2)} / {product.unit || 'Paq'}
                          </span>
                        </div>
                        {product.unit === 'Kg' && (
                          <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded leading-tight">PRECIO ESTIMADO</span>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <div className={cn(
                          "flex items-center justify-between rounded-xl p-1 transition-colors",
                          isSoldOut ? "bg-gray-100 opacity-50" : "bg-gray-50"
                        )}>
                          <button 
                            onClick={() => !isSoldOut && updateCart(product.id, -1)}
                            className={cn("p-1.5 rounded-lg transition-colors", !isSoldOut && "hover:bg-white")}
                            disabled={isSoldOut}
                          >
                            <Minus className="w-4 h-4 text-gray-600" />
                          </button>
                          <input 
                            type="number"
                            value={cart[product.id] || 0}
                            onChange={(e) => !isSoldOut && setCartQuantity(product.id, parseInt(e.target.value) || 0)}
                            className="text-sm font-bold w-12 text-center bg-transparent border-none focus:ring-0 p-0"
                            min="0"
                            disabled={isSoldOut}
                          />
                          <button 
                            onClick={() => !isSoldOut && updateCart(product.id, 1)}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors", 
                              !isSoldOut && (cart[product.id] || 0) < (product.stock || 0) - (product.reserved || 0) ? "hover:bg-white" : "opacity-30 cursor-not-allowed"
                            )}
                            disabled={isSoldOut || (cart[product.id] || 0) >= (product.stock || 0) - (product.reserved || 0)}
                          >
                            <Plus className="w-4 h-4 text-emerald-600" />
                          </button>
                        </div>

                        {effectiveRole === 'company' && (
                          <div className="flex gap-1">
                            <button 
                              onClick={() => !isSoldOut && updateCart(product.id, 10)}
                              className={cn(
                                "flex-1 text-[10px] font-bold py-1 rounded-lg transition-colors",
                                isSoldOut ? "bg-gray-200 text-gray-400" : "bg-gray-100 hover:bg-gray-200"
                              )}
                              disabled={isSoldOut}
                            >
                              +10
                            </button>
                            <button 
                              onClick={() => !isSoldOut && updateCart(product.id, 100)}
                              className={cn(
                                "flex-1 text-[10px] font-bold py-1 rounded-lg transition-colors",
                                isSoldOut ? "bg-gray-200 text-gray-400" : "bg-gray-100 hover:bg-gray-200"
                              )}
                              disabled={isSoldOut}
                            >
                              +100
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>

              {cartItemsCount > 0 && (
                <motion.div 
                  initial={{ y: 100 }}
                  animate={{ y: 0 }}
                  className="fixed bottom-24 left-4 right-4 max-w-md mx-auto z-40"
                >
                  <Button 
                    onClick={() => setCurrentPage('checkout')}
                    className="w-full h-14 flex items-center justify-between px-6 shadow-xl shadow-blue-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 px-2 py-1 rounded text-xs font-bold">{cartItemsCount} artículos</div>
                      <span className="font-bold">Ver Carrito</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">${cartTotal.toFixed(2)}</span>
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </Button>
                </motion.div>
              )}
            </motion.div>
          )}

          {currentPage === 'product-detail' && selectedProductForDetail && (
            <ProductDetailPage 
              product={selectedProductForDetail}
              onBack={() => {
                setSelectedProductForDetail(null);
                setCurrentPage('home');
              }}
              cartQuantity={cart[selectedProductForDetail.id] || 0}
              onUpdateCart={updateCart}
              onSetCartQuantity={setCartQuantity}
              effectiveRole={effectiveRole}
            />
          )}

          {currentPage === 'checkout' && (
            user ? (
              profile ? (
                  <CheckoutPage 
                    cart={cart} 
                    total={cartTotal} 
                    products={products}
                    orders={orders}
                    onBack={() => {
                      if (isStoreOrdering) {
                        setIsStoreOrdering(false);
                        setCurrentPage('store-sales-view');
                      } else {
                        setCurrentPage('home');
                      }
                    }}
                    onConfirm={handleCheckout}
                    profile={profile}
                    isDriverOrdering={isDriverOrdering || isStoreOrdering}
                    shopLocation={effectiveShopLocation}
                    isOnline={isOnline}
                  />
              ) : (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                  <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
                </div>
              )
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <ShoppingCart className="w-16 h-16 text-red-600 mb-4 opacity-20" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Inicia Sesión para Comprar</h2>
                <p className="text-gray-500 mb-6">Necesitamos identificarte para procesar tu pedido de forma segura.</p>
                <Button onClick={() => setGuestMode(false)} className="w-full max-w-xs">Ir a Iniciar Sesión</Button>
                <Button variant="ghost" onClick={() => setCurrentPage('home')} className="mt-2">Seguir Navegando</Button>
              </div>
            )
          )}

          {currentPage === 'current-order' && (
            user ? (
              <CurrentOrderPage 
                orders={orders} 
                onGoHome={() => setCurrentPage('home')} 
                onCancelOrder={async (id) => {
                  try {
                    await updateDoc(doc(db, 'orders', id), { status: 'cancelled' });
                    showToast('Pedido cancelado correctamente', 'success');
                  } catch (error) {
                    handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
                  }
                }}
                onModifyOrder={async (order) => {
                  try {
                    // Restore cart
                    const newCart: any = {};
                    order.items.forEach(item => {
                      newCart[item.productId] = item.quantity;
                    });
                    setCart(newCart);
                    // Cancel old order
                    await updateDoc(doc(db, 'orders', order.id), { status: 'cancelled' });
                    setCurrentPage('home');
                    showToast('Pedido cargado en el carrito para modificar', 'info');
                  } catch (error) {
                    handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
                  }
                }}
                showToast={showToast}
              />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <ClipboardList className="w-16 h-16 text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Rastrea tu Pedido</h2>
                <p className="text-gray-500 mb-6">Inicia sesión para ver el estado de tus pedidos en tiempo real.</p>
                <Button onClick={() => setGuestMode(false)}>Iniciar Sesión</Button>
              </div>
            )
          )}

          {currentPage === 'history' && (
            user ? (
              <HistoryPage orders={orders} />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <History className="w-16 h-16 text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Historial de Pedidos</h2>
                <p className="text-gray-500 mb-6">Inicia sesión para ver tus compras anteriores.</p>
                <Button onClick={() => setGuestMode(false)}>Iniciar Sesión</Button>
              </div>
            )
          )}

          {currentPage === 'profile' && (
            user ? (
              profile ? (
                <ProfilePage 
                  profile={profile} 
                  onUpdate={setProfile} 
                  isAdmin={profile.role === 'admin'} 
                  effectiveRole={effectiveRole}
                  setCurrentPage={setCurrentPage}
                  onLogout={handleLogout}
                />
              ) : (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                  <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
                </div>
              )
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <UserIcon className="w-16 h-16 text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Tu Perfil</h2>
                <p className="text-gray-500 mb-6">Inicia sesión para guardar tus datos de entrega y celular.</p>
                <Button onClick={() => setGuestMode(false)}>Iniciar Sesión</Button>
              </div>
            )
          )}

          {currentPage === 'store-ticket' && lastOrder && (
            <StoreTicketView order={lastOrder} onDone={() => setCurrentPage('store-sales-view')} />
          )}

          {currentPage === 'admin-dashboard' && (
            <AdminDashboard 
              orders={allOrders} 
              users={allUsers}
              currentUserId={profile?.uid || ''}
              selectedDate={adminSelectedDate}
              onDateChange={setAdminSelectedDate}
              onStatClick={(status) => {
                setAdminOrderFilter(status);
                setCurrentPage('admin-orders');
              }}
              onUsersClick={() => setCurrentPage('admin-users')}
              onInventoryTrackingClick={(p, tab) => {
                setAdminPeriod(p);
                setInventoryInitialTab(tab || 'management');
                setCurrentPage('admin-inventory-tracking');
              }}
              onReturnsClick={() => setCurrentPage('admin-returns')}
              onDriverRouteClick={() => setCurrentPage('driver-view')}
              onActivityClick={() => setCurrentPage('admin-activity')}
              onUnitsClick={() => setCurrentPage('admin-units')}
              onKareyControlClick={() => setCurrentPage('karey-dashboard')}
              onSettingsClick={() => setCurrentPage('admin-settings')}
              onProductsClick={() => setCurrentPage('inventory-view')}
              onCategoriesClick={() => setCurrentPage('admin-categories')}
              onRefresh={async () => {
                await loadOrders(true);
                await loadAuthenticatedData();
                showToast('Datos actualizados', 'success');
              }}
            />
          )}

          {currentPage === 'admin-units' && (
            <AdminUnitsView 
              units={units}
              onBack={() => setCurrentPage('admin-dashboard')}
              showToast={showToast}
              onUnitSaved={(savedUnit) => {
                setUnits(prev => {
                  const idx = prev.findIndex(u => u.id === savedUnit.id);
                  if (idx >= 0) {
                    const copy = [...prev];
                    copy[idx] = savedUnit;
                    return copy;
                  }
                  return [...prev, savedUnit];
                });
              }}
              onUnitDeleted={(id) => {
                setUnits(prev => prev.filter(u => u.id !== id));
              }}
            />
          )}

          {currentPage === 'karey-dashboard' && (
            <KareyDashboard 
              units={units}
              movements={containerMovements}
              drivers={allUsers.filter(u => u.role === 'driver' || u.role === 'admin')}
              appSettings={settings || undefined}
              onNavigate={(page) => setCurrentPage(page as Page)}
              onRefresh={async () => {
                await loadAuthenticatedData();
                showToast('Datos actualizados', 'success');
              }}
              showToast={showToast}
            />
          )}

          {currentPage === 'karey-movement' && profile && (
            <KareyMovementForm 
              units={units}
              movements={containerMovements}
              drivers={allUsers.filter(u => u.role === 'driver' || u.role === 'admin')}
              routes={allRoutes}
              currentUser={profile}
              onBack={() => setCurrentPage('karey-dashboard')}
              onMovementCreated={() => {
                showToast('Salida registrada con éxito', 'success');
                setCurrentPage('karey-dashboard');
              }}
              showToast={showToast}
            />
          )}

          {currentPage === 'karey-return' && profile && (
            <KareyReturnForm 
              units={units}
              movements={containerMovements}
              currentUser={profile}
              appSettings={settings || undefined}
              onBack={() => setCurrentPage('karey-dashboard')}
              onReturnReconciled={() => {
                showToast('Recepción registrada con éxito', 'success');
                setCurrentPage('karey-dashboard');
              }}
              showToast={showToast}
            />
          )}

          {currentPage === 'karey-transfer' && profile && (
            <KareyTransferForm 
              units={units}
              drivers={allUsers.filter(u => u.role === 'driver' || u.role === 'admin')}
              routes={allRoutes}
              orders={allOrders}
              currentUser={profile}
              onBack={() => setCurrentPage('karey-dashboard')}
              onTransferComplete={() => {
                setCurrentPage('karey-dashboard');
              }}
              showToast={showToast}
            />
          )}

          {currentPage === 'karey-balances' && (
            <KareyDriverBalances 
              drivers={allUsers.filter(u => u.role === 'driver' || u.role === 'admin')}
              movements={containerMovements}
              appSettings={settings || undefined}
              onBack={() => setCurrentPage('karey-dashboard')}
              showToast={showToast}
            />
          )}

          {currentPage === 'admin-categories' && (
            <AdminCategoriesView 
              categories={categories}
              onBack={() => setCurrentPage('admin-dashboard')}
              showToast={showToast}
              onCategorySaved={(savedCat: Category) => {
                setCategories(prev => {
                  const idx = prev.findIndex(c => c.id === savedCat.id);
                  let next;
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = savedCat;
                  } else {
                    next = [...prev, savedCat];
                  }
                  try { localStorage.setItem('karey_cached_categories', JSON.stringify(next)); } catch (e) {}
                  return next;
                });
              }}
              onCategoryDeleted={(deletedId: string) => {
                setCategories(prev => {
                  const next = prev.filter(c => c.id !== deletedId);
                  try { localStorage.setItem('karey_cached_categories', JSON.stringify(next)); } catch (e) {}
                  return next;
                });
              }}
            />
          )}

          {currentPage === 'admin-settings' && (
            <AdminSettingsView 
              settings={settings} 
              onBack={() => setCurrentPage('admin-dashboard')} 
              canEditLocation={true}
              showToast={showToast}
            />
          )}

          {currentPage === 'admin-inventory-tracking' && profile && (
            <AdminInventoryTrackingView 
              orders={allOrders}
              requests={inventoryRequests}
              products={products}
              profile={profile}
              suppliers={suppliers}
              initialTab={inventoryInitialTab}
              selectedDate={adminSelectedDate}
              onDateChange={setAdminSelectedDate}
              period={adminPeriod}
              onPeriodChange={setAdminPeriod}
              onBack={() => setCurrentPage(effectiveRole === 'admin' ? 'admin-dashboard' : 'inventory-view')}
              onDeleteRequest={async (id) => {
                try {
                  await deleteDoc(doc(db, 'inventoryRequests', id));
                } catch (error) {
                  handleFirestoreError(error, OperationType.DELETE, `inventoryRequests/${id}`);
                }
              }}
              onEditProduct={effectiveRole === 'admin' ? (p) => {
                setSelectedProductForEdit(p);
                setCurrentPage('admin-product-edit' as any);
              } : undefined}
              onAddProduct={effectiveRole === 'admin' ? () => {
                setSelectedProductForEdit(null);
                setCurrentPage('admin-product-edit' as any);
              } : undefined}
              onSupplierSaved={(savedSupplier) => {
                setSuppliers(prev => {
                  const idx = prev.findIndex(s => s.id === savedSupplier.id);
                  let next;
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = savedSupplier;
                  } else {
                    next = [...prev, savedSupplier];
                  }
                  try { localStorage.setItem('karey_cached_suppliers', JSON.stringify(next)); } catch (e) {}
                  return next;
                });
              }}
              onSupplierDeleted={(deletedId) => {
                setSuppliers(prev => {
                  const next = prev.filter(s => s.id !== deletedId);
                  try { localStorage.setItem('karey_cached_suppliers', JSON.stringify(next)); } catch (e) {}
                  return next;
                });
              }}
              onRefresh={async () => {
                await loadAuthenticatedData();
                showToast('Inventario actualizado', 'success');
              }}
              inventorySearchQuery={inventorySearchQuery}
              setInventorySearchQuery={setInventorySearchQuery}
              inventorySelectedCategory={inventorySelectedCategory}
              setInventorySelectedCategory={setInventorySelectedCategory}
              inventorySelectedSubcategory={inventorySelectedSubcategory}
              setInventorySelectedSubcategory={setInventorySelectedSubcategory}
              inventoryStockFilter={inventoryStockFilter}
              setInventoryStockFilter={setInventoryStockFilter}
              showToast={showToast}
            />
          )}

          {currentPage === 'admin-users' && (
            <AdminUsersView 
              users={allUsers} 
              orders={allOrders}
              onBack={() => setCurrentPage('admin-dashboard')}
              showToast={showToast}
              onRefresh={async () => {
                await loadAuthenticatedData();
                showToast('Usuarios actualizados', 'success');
              }}
            />
          )}

          {currentPage === 'admin-returns' && (
            <AdminReturnsView 
              returns={allReturns} 
              products={products}
              onBack={() => setCurrentPage('admin-dashboard')}
              showToast={showToast}
              onRefresh={async () => {
                await loadAuthenticatedData();
                showToast('Devoluciones actualizadas', 'success');
              }}
            />
          )}

          {currentPage === 'admin-orders' && (
            <AdminOrdersView 
              orders={allOrders} 
              users={allUsers}
              products={products}
              routes={allRoutes}
              units={units}
              movements={containerMovements}
              profile={profile || undefined}
              filter={adminOrderFilter}
              selectedDate={adminSelectedDate}
              onBack={() => {
                setAdminOrderFilter('all');
                setCurrentPage('admin-dashboard');
              }}
              showToast={showToast}
              onLoadMore={() => loadOrders()}
              hasMore={hasMoreOrders}
              isLoading={isFetchingOrders}
              onRefresh={async () => {
                await loadOrders(true);
                showToast('Pedidos actualizados', 'success');
              }}
            />
          )}

          {currentPage === 'admin-activity' && (
            <AdminActivityView 
              orders={allOrders}
              users={allUsers}
              routes={allRoutes}
              returns={allReturns}
              containerMovements={containerMovements}
              onBack={() => setCurrentPage('admin-dashboard')}
            />
          )}

          {currentPage === 'dispatcher-view' && (
            profile ? (
              <DispatcherView orders={allOrders} routes={allRoutes} users={allUsers} products={products} profile={profile} units={units} movements={containerMovements} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="pending" />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === 'dispatcher-history' && (
            profile ? (
              <DispatcherView orders={allOrders} routes={allRoutes} users={allUsers} products={products} profile={profile} units={units} movements={containerMovements} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="history" />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === 'preparer-view' && (
            profile ? (
              <PreparerView orders={allOrders} routes={allRoutes} products={products} profile={profile} units={units} users={allUsers} movements={containerMovements} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="pending" />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === 'preparer-history' && (
            profile ? (
              <PreparerView orders={allOrders} routes={allRoutes} products={products} profile={profile} units={units} users={allUsers} movements={containerMovements} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="history" />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === 'driver-view' && (
            profile ? (
              <DriverView 
                orders={allOrders} 
                routes={allRoutes}
                units={units}
                profile={profile} 
                products={products} 
                onBack={() => setCurrentPage('home')} 
                onNewOrderClick={() => {
                  setIsDriverOrdering(true);
                  setCurrentPage('home');
                }}
                showToast={showToast}
                initialTab="pending"
              />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === 'driver-history' && (
            profile ? (
              <DriverView 
                orders={allOrders} 
                routes={allRoutes}
                units={units}
                profile={profile} 
                products={products} 
                onBack={() => setCurrentPage('home')} 
                onNewOrderClick={() => {
                  setIsDriverOrdering(true);
                  setCurrentPage('home');
                }}
                showToast={showToast}
                initialTab="history"
              />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === 'loader-view' && (
            profile ? (
              <LoaderView orders={allOrders} routes={allRoutes} users={allUsers} units={units} products={products} profile={profile} movements={containerMovements} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="pending" />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === 'loader-history' && (
            profile ? (
              <LoaderView orders={allOrders} routes={allRoutes} users={allUsers} units={units} products={products} profile={profile} movements={containerMovements} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="history" />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === 'store-sales-view' && (
            profile ? (
              <StoreSalesView 
                orders={allOrders} 
                profile={profile}
                onBack={() => setCurrentPage('home')} 
                onNewOrderClick={() => {
                  setIsStoreOrdering(true);
                  setCurrentPage('home');
                }}
                showToast={showToast}
              />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === 'inventory-view' && (
            profile ? (
              <InventoryView 
                products={products} 
                profile={profile} 
                suppliers={suppliers}
                onBack={() => setCurrentPage('home')} 
                onEditProduct={effectiveRole === 'admin' ? (p) => {
                  setSelectedProductForEdit(p);
                  setCurrentPage('admin-product-edit' as any);
                } : undefined}
                onAddProduct={effectiveRole === 'admin' ? () => {
                  setSelectedProductForEdit(null);
                  setCurrentPage('admin-product-edit' as any);
                } : undefined}
                onHistoryClick={() => setCurrentPage('admin-inventory-tracking')}
                searchQuery={inventorySearchQuery}
                setSearchQuery={setInventorySearchQuery}
                selectedCategory={inventorySelectedCategory}
                setSelectedCategory={setInventorySelectedCategory}
                selectedSubcategory={inventorySelectedSubcategory}
                setSelectedSubcategory={setInventorySelectedSubcategory}
                stockFilter={inventoryStockFilter}
                setStockFilter={setInventoryStockFilter}
                showToast={showToast}
              />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === ('admin-product-edit' as any) && (
            <AdminProductFormView 
              product={selectedProductForEdit} 
              categories={categories}
              suppliers={suppliers}
              effectiveRole={effectiveRole}
              showToast={showToast}
              onProductSaved={(savedProduct: Product) => {
                setProducts(prev => {
                  const idx = prev.findIndex(p => p.id === savedProduct.id);
                  let next;
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = savedProduct;
                  } else {
                    next = [savedProduct, ...prev];
                  }
                  try { localStorage.setItem('karey_cached_products', JSON.stringify(next)); } catch (e) {}
                  return next;
                });
              }}
              onProductDeleted={(deletedId: string) => {
                setProducts(prev => {
                  const next = prev.filter(p => p.id !== deletedId);
                  try { localStorage.setItem('karey_cached_products', JSON.stringify(next)); } catch (e) {}
                  return next;
                });
              }}
              onBack={() => {
                setSelectedProductForEdit(null);
                setCurrentPage(effectiveRole === 'admin' ? 'admin-inventory-tracking' : 'inventory-view');
              }} 
            />
          )}

          {currentPage === 'admin-notifications' && (
            <AdminNotificationsView 
              requests={inventoryRequests} 
              notifications={notifications} 
              onBack={() => setCurrentPage(effectiveRole === 'admin' ? 'admin-dashboard' : 'home')}
              isAdmin={effectiveRole === 'admin'}
              onApprove={async (req) => {
                try {
                  const product = products.find(p => p.id === req.productId);
                  if (product) {
                    await updateDoc(doc(db, 'products', product.id), {
                      stock: req.newValue
                    });
                    await updateDoc(doc(db, 'inventoryRequests', req.id), { status: 'approved' });
                    
                    // Notify dispatcher
                    await addDoc(collection(db, 'notifications'), {
                      userId: req.requestedBy || 'unknown',
                      title: 'Solicitud Aprobada',
                      message: `Tu solicitud para ${req.productName || 'el producto'} ha sido aprobada.`,
                      type: 'inventory',
                      read: false,
                      createdAt: serverTimestamp()
                    });
                  }
                } catch (error) {
                  handleFirestoreError(error, OperationType.UPDATE, `products/${req.productId}`);
                }
              }}
              onReject={async (req) => {
                try {
                  await updateDoc(doc(db, 'inventoryRequests', req.id), { status: 'rejected' });
                  // Notify dispatcher
                  await addDoc(collection(db, 'notifications'), {
                    userId: req.requestedBy || 'unknown',
                    title: 'Solicitud Rechazada',
                    message: `Tu solicitud para ${req.productName || 'el producto'} ha sido rechazada.`,
                    type: 'inventory',
                    read: false,
                    createdAt: serverTimestamp()
                  });
                } catch (error) {
                  handleFirestoreError(error, OperationType.UPDATE, `inventoryRequests/${req.id}`);
                }
              }}
              onMarkAsRead={async (id) => {
                try {
                  await updateDoc(doc(db, 'notifications', id), { read: true });
                } catch (error) {
                  handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
                }
              }}
              onDeleteNotification={async (id) => {
                try {
                  await deleteDoc(doc(db, 'notifications', id));
                } catch (error) {
                  handleFirestoreError(error, OperationType.DELETE, `notifications/${id}`);
                }
              }}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 z-50">
        <div className="max-w-md md:max-w-2xl lg:max-w-3xl mx-auto flex items-center justify-between">
          {effectiveRole === 'admin' ? (
            <>
              <NavButton active={currentPage === 'admin-dashboard'} icon={ShieldCheck} label="Admin" onClick={() => setCurrentPage('admin-dashboard')} />
              <NavButton active={currentPage === 'admin-users'} icon={Users} label="Roles" onClick={() => setCurrentPage('admin-users')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'dispatcher' ? (
            <>
              <NavButton active={currentPage === 'dispatcher-view'} icon={Package} label="Despacho" onClick={() => setCurrentPage('dispatcher-view')} />
              <NavButton active={currentPage === 'dispatcher-history'} icon={History} label="Historial" onClick={() => setCurrentPage('dispatcher-history')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'karey_inventory' ? (
            <>
              <NavButton active={currentPage === 'karey-dashboard'} icon={Box} label="Jabas Karey" onClick={() => setCurrentPage('karey-dashboard')} />
              <NavButton active={currentPage === 'karey-movement'} icon={Truck} label="Salida" onClick={() => setCurrentPage('karey-movement')} />
              <NavButton active={currentPage === 'karey-return'} icon={RotateCcw} label="Recepción" onClick={() => setCurrentPage('karey-return')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'inventory' ? (
            <>
              <NavButton active={currentPage === 'admin-inventory-tracking'} icon={History} label="Seguimiento" onClick={() => setCurrentPage('admin-inventory-tracking')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'preparer' ? (
            <>
              <NavButton active={currentPage === 'preparer-view'} icon={ClipboardList} label="Preparación" onClick={() => setCurrentPage('preparer-view')} />
              <NavButton active={currentPage === 'preparer-history'} icon={History} label="Historial" onClick={() => setCurrentPage('preparer-history')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'loader' ? (
            <>
              <NavButton active={currentPage === 'loader-view'} icon={Package} label="Carga" onClick={() => setCurrentPage('loader-view')} />
              <NavButton active={currentPage === 'loader-history'} icon={History} label="Historial" onClick={() => setCurrentPage('loader-history')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'driver' ? (
            <>
              <NavButton active={currentPage === 'driver-view'} icon={MapPin} label="Ruta" onClick={() => setCurrentPage('driver-view')} />
              <NavButton active={currentPage === 'driver-history'} icon={History} label="Historial" onClick={() => setCurrentPage('driver-history')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'store_sales' ? (
            <>
              <NavButton active={currentPage === 'home'} icon={HomeIcon} label="Inicio" onClick={() => setCurrentPage('home')} />
              <NavButton active={currentPage === 'store-sales-view'} icon={CreditCard} label="Ventas" onClick={() => setCurrentPage('store-sales-view')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : (
            <>
              <NavButton active={currentPage === 'home'} icon={HomeIcon} label="Inicio" onClick={() => setCurrentPage('home')} />
              <NavButton 
                active={currentPage === 'current-order'} 
                icon={ClipboardList} 
                label="Pedido" 
                onClick={() => setCurrentPage('current-order')} 
                badge={orders.filter(o => ['pending', 'processing', 'ready', 'shipped'].includes(o.status)).length}
              />
              <NavButton active={currentPage === 'history'} icon={History} label="Historial" onClick={() => setCurrentPage('history')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-lg z-[200] flex items-center gap-3 min-w-[300px]",
              toast.type === 'success' ? "bg-green-600 text-white" : 
              toast.type === 'error' ? "bg-red-600 text-white" : "bg-gray-800 text-white"
            )}
          >
            {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
            {toast.type === 'error' && <AlertTriangle className="w-5 h-5" />}
            {toast.type === 'info' && <Bell className="w-5 h-5" />}
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
}
