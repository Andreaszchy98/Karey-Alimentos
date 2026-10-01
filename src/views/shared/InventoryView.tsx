import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Search, Download, History, Plus, Settings, Edit, X, Minus, EyeOff, ChevronRight, Factory } from 'lucide-react';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import jsPDF from 'jspdf';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { Product, UserProfile, ToastType, Supplier } from '../../types';
import { CATEGORIES, JABA_CONFIG, INITIAL_SUPPLIERS } from '../../constants';

export function InventoryView({ 
  products, 
  profile, 
  suppliers = INITIAL_SUPPLIERS,
  onBack,
  onEditProduct,
  onAddProduct,
  onHistoryClick,
  hideHeader = false,
  searchQuery: externalSearchQuery,
  setSearchQuery: setExternalSearchQuery,
  selectedCategory: externalSelectedCategory,
  setSelectedCategory: setExternalSelectedCategory,
  selectedSubcategory: externalSelectedSubcategory,
  setSelectedSubcategory: setExternalSelectedSubcategory,
  stockFilter: externalStockFilter,
  setStockFilter: setExternalStockFilter,
  showToast
}: { 
  products: Product[], 
  profile: UserProfile | null, 
  suppliers?: Supplier[],
  onBack: () => void,
  onEditProduct?: (product: Product) => void,
  onAddProduct?: () => void,
  onHistoryClick?: () => void,
  hideHeader?: boolean,
  searchQuery?: string,
  setSearchQuery?: (q: string) => void,
  selectedCategory?: string,
  setSelectedCategory?: (c: string) => void,
  selectedSubcategory?: string,
  setSelectedSubcategory?: (s: string) => void,
  stockFilter?: string,
  setStockFilter?: (f: string) => void,
  showToast?: (msg: string, type?: ToastType) => void
}) {
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newStock, setNewStock] = useState<number>(0);
  const [jabas, setJabas] = useState<number>(0);
  const [piezasAdicionales, setPiezasAdicionales] = useState<number>(0);
  const [weightKgs, setWeightKgs] = useState<number>(0);
  const [manualBaseStock, setManualBaseStock] = useState<number>(0);
  const [jabaType, setJabaType] = useState<string>('Verde');
  const [entryMode, setEntryMode] = useState<'normal' | 'jaba' | 'weight-to-pieces'>('normal');
  const [reason, setReason] = useState('');
  const [requestType, setRequestType] = useState<'update' | 'waste'>('update');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  // Supplier reception fields
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [selectedSupplierName, setSelectedSupplierName] = useState<string>('');
  const [invoiceDocNumber, setInvoiceDocNumber] = useState<string>('');

  const availableSuppliers = useMemo(() => {
    return suppliers && suppliers.length > 0 ? suppliers : INITIAL_SUPPLIERS;
  }, [suppliers]);

  // Search and Filter State (Local fallback)
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = setExternalSearchQuery || setInternalSearchQuery;

  const [internalSelectedCategory, setInternalSelectedCategory] = useState('Todos');
  const selectedCategory = externalSelectedCategory !== undefined ? externalSelectedCategory : internalSelectedCategory;
  const setSelectedCategory = setExternalSelectedCategory || setInternalSelectedCategory;

  const [internalSelectedSubcategory, setInternalSelectedSubcategory] = useState('Todas');
  const selectedSubcategory = externalSelectedSubcategory !== undefined ? externalSelectedSubcategory : internalSelectedSubcategory;
  const setSelectedSubcategory = setExternalSelectedSubcategory || setInternalSelectedSubcategory;

  const [internalStockFilter, setInternalStockFilter] = useState('all');
  const stockFilter = externalStockFilter !== undefined ? externalStockFilter : internalStockFilter;
  const setStockFilter = setExternalStockFilter || setInternalStockFilter;

  if (!profile) return null;

  const effectiveRole = profile.role === 'admin' ? (profile.viewAs || 'admin') : profile.role;

  // Get unique subcategories
  const subcategories = Array.from(new Set(products
    .filter(p => p.subcategory && !p.isDeleted && (!p.isHidden || effectiveRole === 'admin'))
    .map(p => p.subcategory)))
    .sort();

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (product.sku || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (product.subcategory || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'Todos' || product.category === selectedCategory;
    const matchesSubcategory = selectedSubcategory === 'Todas' || product.subcategory === selectedSubcategory;
    
    let matchesStock = true;
    if (stockFilter === 'out') matchesStock = product.stock <= 0;
    else if (stockFilter === 'low') matchesStock = product.stock > 0 && product.stock < 10;
    else if (stockFilter === 'in') matchesStock = product.stock >= 10;
    const isDeleted = (product as unknown as { isDeleted?: boolean }).isDeleted;

    let matchesVisibility = true;
    if (effectiveRole !== 'admin') {
      matchesVisibility = !product.isHidden;
    } else {
      if (visibilityFilter === 'visible') matchesVisibility = !product.isHidden;
      else if (visibilityFilter === 'hidden') matchesVisibility = !!product.isHidden;
    }

    return matchesSearch && matchesCategory && matchesSubcategory && matchesStock && !isDeleted && matchesVisibility;
  }).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  useEffect(() => {
    if (selectedProduct && newStock > selectedProduct.stock) {
      setRequestType('update');
    }
  }, [newStock, selectedProduct]);

  // Helper to get capacity
  const getCapacity = () => {
    if (!selectedProduct) return 0;
    let capacity = selectedProduct.piecesPerJaba || 0;
    if (capacity === 0) {
      const configKey = Object.keys(JABA_CONFIG).find(key => selectedProduct.name.toLowerCase().includes(key.toLowerCase()));
      if (configKey) {
        const config = JABA_CONFIG[configKey];
        capacity = config.options ? (config.options[jabaType as keyof typeof config.options] || config.perJaba) : config.perJaba;
      }
    }
    return capacity;
  };

  // Jaba calculation effect
  useEffect(() => {
    if (selectedProduct && entryMode === 'jaba') {
      const capacity = getCapacity();
      setNewStock((jabas * capacity) + piezasAdicionales);
    }
  }, [jabas, piezasAdicionales, jabaType, entryMode, selectedProduct]);

  // Weight to pieces preview calculation
  const getWeightPieces = () => {
    if (!selectedProduct) return 0;
    const factor = selectedProduct.approxWeight || 1;
    return Math.round(weightKgs / factor);
  };

  // Weight to pieces additive calculation effect
  useEffect(() => {
    if (selectedProduct && entryMode === 'weight-to-pieces') {
      setNewStock(manualBaseStock + getWeightPieces());
    }
  }, [weightKgs, manualBaseStock, entryMode, selectedProduct]);

  const applyWeightToStock = () => {
    const pieces = getWeightPieces();
    setManualBaseStock(prev => prev + pieces);
    setWeightKgs(0);
  };

  const handleEntryModeChange = (newMode: 'normal' | 'jaba' | 'weight-to-pieces') => {
    let currentNewStock = newStock;
    
    // If switching OUT of weight-to-pieces, commit the calculated extra pieces to manualBaseStock
    if (entryMode === 'weight-to-pieces' && newMode !== 'weight-to-pieces') {
      const convertedPieces = getWeightPieces();
      currentNewStock = manualBaseStock + convertedPieces;
      setManualBaseStock(currentNewStock);
      setWeightKgs(0);
    }

    if (newMode === 'jaba' && entryMode !== 'jaba') {
      const capacity = getCapacity();
      if (capacity > 0) {
        // Translate currently declared stock in form manual (currentNewStock) to Jabas & extra pieces
        const calculatedJabas = Math.floor(currentNewStock / capacity);
        const calculatedExtras = Number((currentNewStock - (calculatedJabas * capacity)).toFixed(2));
        setJabas(calculatedJabas);
        setPiezasAdicionales(calculatedExtras);
      }
    }
    
    if (newMode === 'weight-to-pieces' && entryMode !== 'weight-to-pieces') {
      setManualBaseStock(currentNewStock);
      setWeightKgs(0);
    }

    setEntryMode(newMode);
  };

  const generateJabaReport = () => {
    const productsInJabas = products.filter(p => 
      !p.isDeleted && (
        (p.piecesPerJaba && p.piecesPerJaba > 0) || 
        Object.keys(JABA_CONFIG).some(key => p.name.toLowerCase().includes(key.toLowerCase())) ||
        ['jamon', 'jamón', 'salchicha', 'tocino', 'chorizo', 'peperoni', 'salami'].some(keyword => p.name.toLowerCase().includes(keyword))
      )
    );

    if (productsInJabas.length === 0) {
      alert("No hay productos configurados con jabas para generar el reporte.");
      return;
    }

    const doc = new jsPDF();
    const now = new Date();
    
    // Header
    doc.setFillColor(0, 86, 179);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("KAREY ALIMENTOS", 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text("REPORTE DE INVENTARIO POR JABAS", 105, 30, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text(`Fecha: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 150, 50);

    let y = 60;
    // Table Headers
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(10, y - 5, 190, 8, 'F');
    doc.text("Producto", 12, y);
    doc.text("Stock Total", 100, y);
    doc.text("Jabas", 130, y);
    doc.text("Extras", 160, y);
    
    y += 8;
    doc.setFont("helvetica", "normal");

    productsInJabas.sort((a, b) => a.name.localeCompare(b.name)).forEach((p) => {
      let capacity = p.piecesPerJaba || 0;
      let unit = p.unit || 'Pza';

      if (capacity === 0) {
        const configKey = Object.keys(JABA_CONFIG).find(key => p.name.toLowerCase().includes(key.toLowerCase()));
        if (configKey) {
          capacity = JABA_CONFIG[configKey].perJaba;
          unit = JABA_CONFIG[configKey].unit;
        }
      }

      const totalJabas = capacity > 0 ? Math.floor(p.stock / capacity) : 0;
      const extras = capacity > 0 ? Number((p.stock % capacity).toFixed(2)) : p.stock;

      if (y > 270) {
        doc.addPage();
        y = 30;
      }

      doc.setFontSize(8);
      doc.text(p.name.substring(0, 55), 12, y);
      doc.text(`${p.stock} ${p.unit}`, 100, y);
      doc.text(`${totalJabas} jabas`, 130, y);
      doc.text(`${extras} ${unit}`, 160, y);
      
      doc.setDrawColor(230, 230, 230);
      doc.line(10, y + 2, 200, y + 2);
      y += 8;
    });

    doc.save(`Inventario_Jabas_${now.toISOString().split('T')[0]}.pdf`);
  };

  const handleRequest = async () => {
    if (!selectedProduct || !profile) return;

    const isStockIncrease = newStock > selectedProduct.stock;
    const finalType = isStockIncrease ? 'update' : requestType;

    if (finalType === 'update' && !selectedSupplierId) {
      showToast?.('Debes seleccionar un Proveedor de Origen para registrar la entrada de mercancía', 'error');
      return;
    }

    try {
      const supObj = availableSuppliers.find(s => s.id === selectedSupplierId);
      const supplierNameToSave = selectedSupplierName || supObj?.name || (selectedSupplierId ? 'Karey' : undefined);

      if (profile.role === 'admin' || profile.role === 'inventory') {
        const prodUpdate: Partial<Product> = {
          stock: newStock
        };
        if (selectedSupplierId && !selectedProduct.supplierId) {
          prodUpdate.supplierId = selectedSupplierId;
          prodUpdate.supplierName = supplierNameToSave;
        }

        await updateDoc(doc(db, 'products', selectedProduct.id), prodUpdate);
        
        await addDoc(collection(db, 'inventoryRequests'), {
          productId: selectedProduct.id || '',
          productName: selectedProduct.name || 'Producto',
          type: finalType || 'update',
          oldValue: selectedProduct.stock || 0,
          newValue: newStock || 0,
          supplierId: selectedSupplierId || null,
          supplierName: supplierNameToSave || null,
          invoiceOrDocNumber: invoiceDocNumber.trim() || null,
          reason: reason || (profile.role === 'admin' ? `Entrada/Ajuste por Admin (Proveedor: ${supplierNameToSave || 'N/A'})` : `Entrada/Ajuste por Inventario (Proveedor: ${supplierNameToSave || 'N/A'})`),
          status: 'approved',
          requestedBy: profile.uid || 'unknown',
          requestedByName: profile.name || 'Admin',
          createdAt: serverTimestamp()
        });
        showToast?.('Inventario y entrada de mercancía registrados', 'success');
      } else {
        await addDoc(collection(db, 'inventoryRequests'), {
          productId: selectedProduct.id || '',
          productName: selectedProduct.name || 'Producto',
          type: finalType || 'update',
          oldValue: selectedProduct.stock || 0,
          newValue: newStock || 0,
          supplierId: selectedSupplierId || null,
          supplierName: supplierNameToSave || null,
          invoiceOrDocNumber: invoiceDocNumber.trim() || null,
          reason: reason || '',
          status: 'pending',
          requestedBy: profile.uid || 'unknown',
          requestedByName: profile.name || 'Usuario',
          createdAt: serverTimestamp()
        });
        showToast?.('Solicitud de entrada enviada para aprobación', 'info');
      }
      
      setIsRequestModalOpen(false);
      setSelectedProduct(null);
      setReason('');
      setInvoiceDocNumber('');
    } catch (error) {
      const op = profile.role === 'admin' ? OperationType.UPDATE : OperationType.CREATE;
      const path = profile.role === 'admin' ? `products/${selectedProduct.id}` : 'inventoryRequests';
      handleFirestoreError(error, op, path);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn("space-y-6 pb-20", hideHeader && "pb-0")}
    >
      {!hideHeader && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {effectiveRole !== 'inventory' && (
              <Button variant="ghost" onClick={onBack} className="p-2 -ml-2">
                <ChevronRight className="w-6 h-6 rotate-180" />
              </Button>
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900">Gestión de Inventario</h2>
              <p className="text-xs text-gray-400 font-medium">Ajustes directos y control de existencias</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {(profile.role === 'admin' || effectiveRole === 'admin' || effectiveRole === 'inventory') && (
              <Button
                variant="primary"
                size="sm"
                onClick={generateJabaReport}
                className="rounded-xl flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 h-9 px-3.5 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span className="font-bold text-xs">Reporte Jabas</span>
              </Button>
            )}
            {(profile.role === 'admin' || effectiveRole === 'admin' || effectiveRole === 'inventory') && (
              <Button 
                variant="outline"
                size="sm"
                onClick={onHistoryClick}
                className="rounded-xl flex items-center gap-2 h-9 px-3.5 bg-gray-50 border-gray-200 text-gray-700 font-semibold text-xs shadow-xs"
              >
                <History className="w-3.5 h-3.5 text-gray-500" />
                <span>Historial</span>
              </Button>
            )}
            {(profile.role === 'admin' || effectiveRole === 'admin') && onAddProduct && (
              <Button 
                onClick={onAddProduct}
                className="rounded-xl flex items-center gap-2 h-9 px-3.5 py-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span className="text-xs font-bold">Nuevo Producto</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar producto o marca..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-red-600/20 text-sm"
          />
        </div>

        <div className={cn("grid gap-2", effectiveRole === 'admin' ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-4")}>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Categoría</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-red-600/20"
            >
              <option value="Todos">Todas</option>
              {CATEGORIES.filter(c => c !== 'Todos').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Marca</label>
            <select
              value={selectedSubcategory}
              onChange={(e) => setSelectedSubcategory(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-red-600/20"
            >
              <option value="Todas">Todas</option>
              {subcategories.map(sub => (
                <option key={sub} value={sub || ''}>{sub}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Existencias</label>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-red-600/20"
            >
              <option value="all">Ver Todos</option>
              <option value="in">En Stock (+10)</option>
              <option value="low">{"Stock Bajo (<10)"}</option>
              <option value="out">Sin Stock (0)</option>
            </select>
          </div>

          {effectiveRole === 'admin' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Visibilidad</label>
              <select
                value={visibilityFilter}
                onChange={(e) => setVisibilityFilter(e.target.value as 'all' | 'visible' | 'hidden')}
                className="w-full px-2 py-1.5 text-xs bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-red-600/20 font-semibold text-gray-800"
              >
                <option value="all">Todos (Visibles y Ocultos)</option>
                <option value="visible">Solo Visibles</option>
                <option value="hidden">Solo Ocultos</option>
              </select>
            </div>
          )}

          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('Todos');
                setSelectedSubcategory('Todas');
                setStockFilter('all');
                setVisibilityFilter('all');
              }}
              className="w-full py-1.5 text-[10px] text-gray-400 hover:text-red-600"
            >
              Limpiar
            </Button>
          </div>
        </div>
        
        <div className="pt-2 border-t border-gray-50 flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-wider">
          <span>Catálogo de Productos (A-Z)</span>
          <span className="text-gray-900">{filteredProducts.length} productos</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay productos que coincidan filtros</p>
          </div>
        ) : (
          filteredProducts.map(product => (
            <div 
              key={product.id} 
              className={cn(
                "p-4 rounded-2xl border shadow-xs flex items-center justify-between gap-3 transition-all",
                product.isHidden ? "bg-amber-50/40 border-amber-200" : "bg-white border-gray-100 shadow-sm"
              )}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {product.imageUrl ? (
                  <img 
                    src={product.imageUrl} 
                    alt={product.name} 
                    className="w-14 h-14 rounded-xl object-cover bg-gray-50 flex-shrink-0 border border-gray-100 shadow-xs" 
                    referrerPolicy="no-referrer" 
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100 text-gray-300">
                    <Package className="w-6 h-6" />
                  </div>
                )}
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider truncate">
                      {product.category}
                      {product.subcategory && ` • ${product.subcategory}`}
                    </p>
                    {product.sku && (
                      <span className="inline-flex items-center bg-gray-100 text-gray-700 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded">
                        SKU: {product.sku}
                      </span>
                    )}
                    {product.isHidden && effectiveRole === 'admin' && (
                      <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                        <EyeOff className="w-2.5 h-2.5 text-amber-700" />
                        Oculto
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-gray-900 truncate">
                    {product.name}
                    {product.unit === 'Kg' && product.approxWeight && (
                      <span className="text-gray-400 font-normal"> ({product.approxWeight} Kg aprox.)</span>
                    )}
                  </h4>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-gray-500">Stock: <span className="font-bold text-gray-900">{product.stock} pzs</span></span>
                    <span className="text-orange-500">Apartado: <span className="font-bold">{product.reserved} pzs</span></span>
                    <span className="text-blue-500">Disp: <span className="font-bold">{product.stock - product.reserved} pzs</span></span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {effectiveRole === 'admin' && onEditProduct && (
                  <Button 
                    variant="ghost" 
                    className="p-2 rounded-xl text-gray-400 hover:text-red-600 h-9 w-9 flex items-center justify-center"
                    onClick={() => onEditProduct(product)}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  className="p-2 rounded-xl h-9 w-9 flex items-center justify-center border-gray-200"
                  onClick={() => {
                    setSelectedProduct(product);
                    setNewStock(product.stock);
                    setJabas(0);
                    setPiezasAdicionales(0);
                    setWeightKgs(0);
                    setManualBaseStock(product.stock);
                    setEntryMode('normal');
                    setRequestType('update');
                    setReason('');
                    setInvoiceDocNumber('');

                    // Preselect supplier
                    const targetSupId = product.supplierId || (product.category === 'Quesos' ? (product.name.toLowerCase().includes('santa rita') ? 'sup_santa_rita' : (product.name.toLowerCase().includes('superior') || product.name.toLowerCase().includes('pomas') ? 'sup_superior' : 'sup_karey')) : 'sup_karey');
                    const matchSup = availableSuppliers.find(s => s.id === targetSupId) || availableSuppliers.find(s => s.isDefault) || availableSuppliers[0];
                    setSelectedSupplierId(matchSup?.id || 'sup_karey');
                    setSelectedSupplierName(matchSup?.name || 'Karey');
                    
                    setIsRequestModalOpen(true);
                  }}
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isRequestModalOpen && selectedProduct && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md space-y-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">{profile.role === 'admin' ? 'Actualizar Inventario / Recepción' : 'Solicitar Entrada / Modificación'}</h3>
                <Button variant="ghost" onClick={() => setIsRequestModalOpen(false)} className="p-1">
                  <X className="w-6 h-6" />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Producto a Actualizar</label>
                    <p className="font-bold text-gray-900 text-sm truncate">{selectedProduct.name}</p>
                    <p className="text-[11px] text-gray-500">{selectedProduct.category} • Stock actual: <strong className="text-blue-900">{selectedProduct.stock} {selectedProduct.unit}</strong></p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    variant={requestType === 'update' ? 'primary' : 'outline'}
                    onClick={() => setRequestType('update')}
                    className="text-xs font-bold"
                  >
                    Entrada / Actualizar
                  </Button>
                  <Button 
                    variant={requestType === 'waste' ? 'secondary' : 'outline'}
                    onClick={() => setRequestType('waste')}
                    className="text-xs font-bold"
                    disabled={newStock > selectedProduct.stock}
                  >
                    Reportar Merma
                  </Button>
                </div>

                {/* Mandatory Origin Supplier selection for stock entries & updates */}
                {requestType === 'update' && (
                  <div className="space-y-2 p-3.5 bg-teal-50/70 rounded-2xl border border-teal-200 shadow-xs">
                    <label className="text-[10px] font-black text-teal-900 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Factory className="w-3.5 h-3.5 text-teal-600" />
                        Proveedor de Origen
                      </span>
                      <span className="text-red-600 font-bold lowercase text-[10px] bg-red-50 px-1.5 py-0.5 rounded border border-red-100">* obligatorio</span>
                    </label>

                    <select
                      value={selectedSupplierId}
                      onChange={(e) => {
                        const sup = availableSuppliers.find(s => s.id === e.target.value);
                        setSelectedSupplierId(e.target.value);
                        setSelectedSupplierName(sup?.name || '');
                      }}
                      className="w-full px-3 py-2 bg-white border border-teal-300 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                      <option value="" disabled>-- Selecciona el Proveedor de Procedencia --</option>
                      {availableSuppliers.map(sup => (
                        <option key={sup.id} value={sup.id}>
                          {sup.name} {sup.code ? `(${sup.code})` : ''} {sup.isDefault ? '• Predeterminado' : ''}
                        </option>
                      ))}
                    </select>

                    <div>
                      <input
                        type="text"
                        placeholder="Folio / Remisión / Factura (Opcional)"
                        value={invoiceDocNumber}
                        onChange={(e) => setInvoiceDocNumber(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-teal-200 rounded-lg text-xs placeholder:text-gray-400 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Entry Mode Selector */}
                {(selectedProduct.piecesPerJaba || 
                  Object.keys(JABA_CONFIG).some(key => selectedProduct.name.toLowerCase().includes(key.toLowerCase())) ||
                  ['jamon', 'jamón', 'salchicha', 'tocino', 'chorizo', 'peperoni', 'salami'].some(keyword => selectedProduct.name.toLowerCase().includes(keyword))) && (
                  <div className="bg-gray-50 p-1 rounded-xl flex gap-1">
                    {[
                      { id: 'normal', label: 'Manual' },
                      { id: 'jaba', label: 'Jabas/Pzs' },
                      { id: 'weight-to-pieces', label: 'Kilos a Pzs' }
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => handleEntryModeChange(m.id as 'normal' | 'jaba' | 'weight-to-pieces')}
                        className={cn(
                          "flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all",
                          entryMode === m.id ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}

                {entryMode === 'normal' && (
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Nuevo Valor ({selectedProduct.unit})</label>
                    <div className="flex items-center gap-4 mt-1">
                      <Button 
                        variant="outline" 
                        onClick={() => setNewStock(Math.max(0, newStock - 1))}
                        className="p-2"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <input 
                        type="number"
                        className="text-xl font-bold w-24 text-center border-b-2 border-gray-100 focus:border-[#0056b3] focus:outline-none transition-colors bg-transparent"
                        value={newStock}
                        onChange={(e) => setNewStock(parseFloat(e.target.value) || 0)}
                        step={selectedProduct.unit === 'Kg' ? "0.1" : "1"}
                      />
                      <Button 
                        variant="outline" 
                        onClick={() => setNewStock(newStock + 1)}
                        className="p-2"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {entryMode === 'jaba' && (
                  <div className="space-y-4 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                    {(() => {
                      let capacity = selectedProduct.piecesPerJaba || 0;
                      let unitLabel = selectedProduct.unit;
                      let options: Record<string, number> | undefined;

                      const configKey = Object.keys(JABA_CONFIG).find(key => selectedProduct.name.toLowerCase().includes(key.toLowerCase()));
                      const config = configKey ? JABA_CONFIG[configKey] : null;

                      if (capacity === 0 && config) {
                        capacity = config.perJaba;
                        unitLabel = config.unit as 'Kg' | 'Paq' | 'Pza' | 'Fco' | 'Bolsa' | 'Caja';
                        options = config.options;
                      }

                      const finalCapacity = options ? options[jabaType] || capacity : capacity;
                      
                      return (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">Jabas ({finalCapacity} {unitLabel}/jaba)</label>
                              <div className="flex items-center gap-2 mt-1">
                                <input 
                                  type="number"
                                  className="w-full text-lg font-bold bg-white border border-blue-200 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  value={jabas}
                                  onChange={(e) => setJabas(parseInt(e.target.value) || 0)}
                                  min="0"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">Piezas/Kg Extras</label>
                              <div className="flex items-center gap-2 mt-1">
                                <input 
                                  type="number"
                                  className="w-full text-lg font-bold bg-white border border-blue-200 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  value={piezasAdicionales}
                                  onChange={(e) => setPiezasAdicionales(parseFloat(e.target.value) || 0)}
                                  min="0"
                                  step={unitLabel === 'Kg' ? "0.1" : "1"}
                                />
                              </div>
                            </div>
                          </div>

                          {options && (
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-blue-600 uppercase">Tipo de Jaba</label>
                              <div className="flex gap-2">
                                {Object.keys(options).map(opt => (
                                  <button
                                    key={opt}
                                    onClick={() => setJabaType(opt)}
                                    className={cn(
                                      "flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all",
                                      jabaType === opt ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"
                                    )}
                                  >
                                    {opt} ({options![opt]} {unitLabel})
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="pt-2 border-t border-blue-100 flex justify-between items-center text-xs">
                            <span className="text-gray-500 font-medium tracking-tight">Total calculado:</span>
                            <span className="text-blue-700 font-black text-sm">{newStock} {unitLabel}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {entryMode === 'weight-to-pieces' && (
                  <div className="space-y-4 bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
                    <div>
                      <label className="text-[10px] font-black text-orange-600 uppercase italic">Sumar Peso Recibido (Kilos)</label>
                      <div className="flex items-center gap-3 mt-1">
                        <input 
                          type="number"
                          className="w-full text-xl font-bold bg-white border border-orange-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="0.00 kg"
                          value={weightKgs || ''}
                          onChange={(e) => setWeightKgs(parseFloat(e.target.value) || 0)}
                          step="0.01"
                        />
                      </div>
                      <p className="text-[9px] text-orange-400 mt-2 italic px-1">
                        * Calcula piezas basándose en {selectedProduct.approxWeight || 1}kg por pieza y las suma al total manual ({manualBaseStock})
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-gray-400">Base Manual:</span>
                        <span className="font-bold">{manualBaseStock} Pzs</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-gray-400">Extra por Peso:</span>
                        <span className="font-bold text-orange-600">+{getWeightPieces()} Pzs</span>
                      </div>
                      <div className="pt-2 border-t border-orange-100 flex justify-between items-center text-xs pb-3">
                        <span className="text-gray-500 font-medium tracking-tight">Nuevo Total:</span>
                        <span className="text-orange-700 font-black text-sm">{newStock} Pzs</span>
                      </div>
                      
                      <Button 
                        onClick={applyWeightToStock}
                        disabled={weightKgs <= 0}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black text-xs h-8 rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-3 h-3" />
                        CONFIRMAR Y SUMAR AL TOTAL
                      </Button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Motivo {profile.role !== 'admin' && '(Obligatorio)'}</label>
                  <textarea 
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] transition-all resize-none h-24"
                    placeholder={profile.role === 'admin' ? "Opcional: Notas sobre el cambio..." : "Explica por qué necesitas este cambio..."}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                <Button 
                  className="w-full py-4 text-lg" 
                  disabled={profile.role !== 'admin' && !reason}
                  onClick={handleRequest}
                >
                  {profile.role === 'admin' ? 'Confirmar Cambios' : 'Enviar Solicitud'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
