import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Download, RotateCcw, Plus, Calendar, Search, Package, Trash2, Factory, Building2, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { Order, InventoryRequest, Product, UserProfile, ToastType, Supplier } from '../../types';
import { JABA_CONFIG, INITIAL_SUPPLIERS } from '../../constants';
import { InventoryView } from '../shared/InventoryView';
import { AdminSuppliersView } from './AdminSuppliersView';

export function AdminInventoryTrackingView({ 
  orders, 
  requests, 
  products, 
  profile, 
  suppliers = INITIAL_SUPPLIERS,
  initialTab = 'management',
  selectedDate, 
  onDateChange, 
  period = 'day', 
  onPeriodChange, 
  onBack, 
  onDeleteRequest, 
  onEditProduct, 
  onAddProduct, 
  onSupplierSaved,
  onSupplierDeleted,
  onRefresh, 
  inventorySearchQuery, 
  setInventorySearchQuery, 
  inventorySelectedCategory, 
  setInventorySelectedCategory, 
  inventorySelectedSubcategory, 
  setInventorySelectedSubcategory, 
  inventoryStockFilter, 
  setInventoryStockFilter, 
  showToast 
}: { 
  orders: Order[]; 
  requests: InventoryRequest[]; 
  products: Product[]; 
  profile: UserProfile; 
  suppliers?: Supplier[];
  initialTab?: 'management' | 'sold' | 'waste' | 'entries' | 'suppliers';
  selectedDate: string; 
  onDateChange?: (date: string) => void; 
  period?: 'day' | 'week' | 'month' | 'year'; 
  onPeriodChange?: (p: 'day' | 'week' | 'month' | 'year') => void; 
  onBack: () => void; 
  onDeleteRequest: (id: string) => void; 
  onEditProduct?: (product: Product) => void; 
  onAddProduct?: () => void; 
  onSupplierSaved?: (supplier: Supplier) => void;
  onSupplierDeleted?: (id: string) => void;
  onRefresh?: () => void; 
  inventorySearchQuery?: string; 
  setInventorySearchQuery?: (q: string) => void; 
  inventorySelectedCategory?: string; 
  setInventorySelectedCategory?: (c: string) => void; 
  inventorySelectedSubcategory?: string; 
  setInventorySelectedSubcategory?: (s: string) => void; 
  inventoryStockFilter?: string; 
  setInventoryStockFilter?: (f: string) => void; 
  showToast?: (msg: string, type?: ToastType) => void; 
}) {
  const effectiveRole = profile.role === 'admin' ? (profile.viewAs || 'admin') : profile.role;
  const [activeTab, setActiveTab] = useState<'management' | 'sold' | 'waste' | 'entries' | 'suppliers'>(initialTab);
  const [historySearch, setHistorySearch] = useState('');

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

  const anchorDate = new Date(selectedDate + 'T00:00:00');
  const startOfPeriod = new Date(anchorDate);
  const endOfPeriod = new Date(anchorDate);

  if (period === 'week') {
    startOfPeriod.setDate(anchorDate.getDate() - anchorDate.getDay());
    startOfPeriod.setHours(0,0,0,0);
    endOfPeriod.setDate(startOfPeriod.getDate() + 6);
    endOfPeriod.setHours(23,59,59,999);
  } else if (period === 'month') {
    startOfPeriod.setDate(1);
    startOfPeriod.setHours(0,0,0,0);
    endOfPeriod.setMonth(startOfPeriod.getMonth() + 1, 0);
    endOfPeriod.setHours(23,59,59,999);
  } else if (period === 'year') {
    startOfPeriod.setMonth(0, 1);
    startOfPeriod.setHours(0,0,0,0);
    endOfPeriod.setFullYear(startOfPeriod.getFullYear(), 11, 31);
    endOfPeriod.setHours(23,59,59,999);
  }

  const soldProducts = useMemo(() => {
    const sold: Record<string, { name: string, quantity: number, total: number }> = {};
    orders
      .filter(o => {
        if (!o.createdAt) return false;
        const orderDate = new Date(o.createdAt.seconds * 1000);
        
        const isDelivered = o.status === 'delivered';
        if (!isDelivered) return false;

        if (period === 'day') {
          return orderDate.toISOString().split('T')[0] === selectedDate;
        } else {
          return orderDate >= startOfPeriod && orderDate <= endOfPeriod;
        }
      })
      .forEach(o => {
        o.items.forEach(item => {
          if (!sold[item.productId]) {
            sold[item.productId] = { name: item.name, quantity: 0, total: 0 };
          }
          sold[item.productId].quantity += item.quantity;
          sold[item.productId].total += item.quantity * item.price;
        });
      });
    return Object.entries(sold)
      .filter(([_, data]) => data.name.toLowerCase().includes(historySearch.toLowerCase()))
      .sort((a, b) => b[1].quantity - a[1].quantity);
  }, [orders, selectedDate, period, startOfPeriod, endOfPeriod, historySearch]);

  const wasteRecords = useMemo(() => {
    return requests
      .filter(r => {
        if (!r.createdAt) return false;
        const requestDate = new Date(r.createdAt.seconds * 1000);
        
        const isWaste = r.type === 'waste' && r.status === 'approved';
        if (!isWaste) return false;

        if (period === 'day') {
          return requestDate.toISOString().split('T')[0] === selectedDate;
        } else {
          return requestDate >= startOfPeriod && requestDate <= endOfPeriod;
        }
      })
      .filter(r => r.productName.toLowerCase().includes(historySearch.toLowerCase()))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }, [requests, selectedDate, period, startOfPeriod, endOfPeriod, historySearch]);

  const entryRecords = useMemo(() => {
    return requests
      .filter(r => {
        if (!r.createdAt) return false;
        const requestDate = new Date(r.createdAt.seconds * 1000);
        
        const isEntry = r.type === 'update' && r.status === 'approved' && r.newValue > r.oldValue;
        if (!isEntry) return false;

        if (period === 'day') {
          return requestDate.toISOString().split('T')[0] === selectedDate;
        } else {
          return requestDate >= startOfPeriod && requestDate <= endOfPeriod;
        }
      })
      .filter(r => r.productName.toLowerCase().includes(historySearch.toLowerCase()))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }, [requests, selectedDate, period, startOfPeriod, endOfPeriod, historySearch]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {effectiveRole !== 'inventory' && (
            <Button variant="ghost" onClick={onBack} className="p-2 -ml-2">
              <ChevronRight className="w-6 h-6 rotate-180" />
            </Button>
          )}
          <div>
            <h2 className="text-xl font-bold text-gray-900">Gestión e Inventario</h2>
            <p className="text-xs text-gray-400 font-medium">Control de stock, reportes y métricas operativas</p>
          </div>
        </div>

        {/* Action Buttons arranged cleanly beneath the title */}
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
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={onRefresh} 
            className="rounded-xl flex items-center gap-2 h-9 px-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs border border-gray-200/60 shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Actualizar</span>
          </Button>
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

      <div className="space-y-4">
        {/* Period Selector */}
        {effectiveRole === 'admin' && (
          <div className="bg-gray-100 p-1 rounded-2xl flex">
            {[
              { id: 'day', label: 'Día' },
              { id: 'week', label: 'Semana' },
              { id: 'month', label: 'Mes' },
              { id: 'year', label: 'Año' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => onPeriodChange?.(p.id as 'day' | 'week' | 'month' | 'year')}
                className={cn(
                  "flex-1 py-1.5 text-[9px] font-bold rounded-xl transition-all",
                  period === p.id ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase">
              {period === 'day' ? 'Fecha Seleccionada' : 'Seleccionar Referencia'}
            </p>
            <Calendar className="w-3 h-3 text-gray-400" />
          </div>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => onDateChange && onDateChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] text-xs font-medium text-gray-900"
          />
          {period !== 'day' && (
            <div className="pt-2 border-t border-gray-50 text-center">
              <p className="text-[10px] font-bold text-blue-600 uppercase">
                {period === 'week' ? 'Semana selecionada' : period === 'month' ? 'Mes selecionado' : 'Año selecionado'}
              </p>
              <p className="text-[9px] text-blue-400 italic">
                {startOfPeriod.toLocaleDateString()} - {endOfPeriod.toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex bg-gray-100 p-1 rounded-2xl overflow-x-auto no-scrollbar gap-1">
        <button 
          onClick={() => { setActiveTab('management'); setHistorySearch(''); }}
          className={cn(
            "flex-1 min-w-[75px] py-2 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap",
            activeTab === 'management' ? "bg-white text-[#0056b3] shadow-sm" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Gestión
        </button>
        <button 
          onClick={() => { setActiveTab('sold'); setHistorySearch(''); }}
          className={cn(
            "flex-1 min-w-[75px] py-2 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap",
            activeTab === 'sold' ? "bg-white text-[#0056b3] shadow-sm" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Vendidos
        </button>
        <button 
          onClick={() => { setActiveTab('waste'); setHistorySearch(''); }}
          className={cn(
            "flex-1 min-w-[75px] py-2 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap",
            activeTab === 'waste' ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Mermas
        </button>
        <button 
          onClick={() => { setActiveTab('entries'); setHistorySearch(''); }}
          className={cn(
            "flex-1 min-w-[75px] py-2 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap",
            activeTab === 'entries' ? "bg-white text-green-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Entradas
        </button>
        <button 
          onClick={() => { setActiveTab('suppliers'); setHistorySearch(''); }}
          className={cn(
            "flex-1 min-w-[85px] py-2 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap flex items-center justify-center gap-1",
            activeTab === 'suppliers' ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
          )}
        >
          <Factory className="w-3 h-3" />
          Proveedores
        </button>
      </div>

      {activeTab !== 'management' && activeTab !== 'suppliers' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Filtrar por nombre de producto..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-600/20 text-xs"
          />
        </div>
      )}

      <div className="space-y-4">
        {activeTab === 'management' && (
          <InventoryView 
            products={products} 
            profile={profile} 
            suppliers={suppliers}
            onBack={() => {}} 
            onEditProduct={onEditProduct}
            onAddProduct={onAddProduct}
            hideHeader 
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
        )}

        {activeTab === 'suppliers' && (
          <AdminSuppliersView
            suppliers={suppliers}
            products={products}
            onBack={() => setActiveTab('management')}
            showToast={showToast}
            onSupplierSaved={onSupplierSaved}
            onSupplierDeleted={onSupplierDeleted}
          />
        )}

        {activeTab === 'sold' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {soldProducts.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-sm">No hay registros de ventas entregadas</p>
            ) : (
              soldProducts.map(([id, data]) => {
                const prod = products.find(p => p.id === id || p.name.toLowerCase() === data.name.toLowerCase());
                return (
                  <div key={id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {prod?.imageUrl ? (
                        <img 
                          src={prod.imageUrl} 
                          alt={data.name} 
                          className="w-12 h-12 rounded-xl object-cover bg-gray-50 flex-shrink-0 border border-gray-100 shadow-xs" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100 text-gray-300">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900 truncate">{data.name}</p>
                        <p className="text-xs text-gray-400">Total vendido: ${data.total.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-black text-[#0056b3]">{data.quantity}</p>
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Unidades</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'waste' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {wasteRecords.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-sm">No hay registros de mermas aprobadas</p>
            ) : (
              wasteRecords.map(record => {
                const prod = products.find(p => p.id === record.productId || p.name.toLowerCase() === record.productName?.toLowerCase());
                return (
                  <div key={record.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-2 relative group">
                    <button 
                      onClick={() => onDeleteRequest(record.id)}
                      className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-3 pr-8">
                      {prod?.imageUrl ? (
                        <img 
                          src={prod.imageUrl} 
                          alt={record.productName} 
                          className="w-12 h-12 rounded-xl object-cover bg-gray-50 flex-shrink-0 border border-gray-100 shadow-xs" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100 text-gray-300">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-bold text-gray-900 truncate">{record.productName}</p>
                          <div className="bg-red-50 text-red-600 px-2 py-0.5 rounded-lg text-xs font-bold whitespace-nowrap">
                            -{record.oldValue - record.newValue} uds
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400">{record.createdAt?.toDate().toLocaleString()}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 italic pl-1">"{record.reason}"</p>
                    <p className="text-[10px] text-gray-400 pl-1">Reportado por: {record.requestedByName}</p>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'entries' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {entryRecords.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-sm">No hay registros de entradas aprobadas</p>
            ) : (
              entryRecords.map(record => {
                const prod = products.find(p => p.id === record.productId || p.name.toLowerCase() === record.productName?.toLowerCase());
                return (
                  <div key={record.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-2 relative group">
                    <button 
                      onClick={() => onDeleteRequest(record.id)}
                      className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-3 pr-8">
                      {prod?.imageUrl ? (
                        <img 
                          src={prod.imageUrl} 
                          alt={record.productName} 
                          className="w-12 h-12 rounded-xl object-cover bg-gray-50 flex-shrink-0 border border-gray-100 shadow-xs" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100 text-gray-300">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-bold text-gray-900 truncate">{record.productName}</p>
                          <div className="bg-green-50 text-green-600 px-2 py-0.5 rounded-lg text-xs font-bold whitespace-nowrap">
                            +{record.newValue - record.oldValue} uds
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400">{record.createdAt?.toDate().toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {record.supplierName ? (
                        <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-teal-100">
                          <Factory className="w-3 h-3 text-teal-600" />
                          {record.supplierName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-500 text-[10px] font-medium px-2 py-0.5 rounded-md">
                          <Factory className="w-3 h-3 text-gray-400" />
                          Karey (Origen base)
                        </span>
                      )}
                      {record.invoiceOrDocNumber && (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-100">
                          <FileText className="w-3 h-3 text-blue-500" />
                          Doc: {record.invoiceOrDocNumber}
                        </span>
                      )}
                    </div>
                    {record.reason && (
                      <p className="text-xs text-gray-500 italic pl-1">"{record.reason}"</p>
                    )}
                    <p className="text-[10px] text-gray-400 pl-1">Registrado por: {record.requestedByName}</p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
