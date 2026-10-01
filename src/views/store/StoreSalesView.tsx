import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, CreditCard, Package, Search, X, CheckCircle2, Loader2 } from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Button, Input, cn } from '../../components/ui';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Order, UserProfile } from '../../types';
import { StoreTicketView } from './StoreTicketView';

export function StoreSalesView({ 
  orders, 
  profile,
  onBack: _onBack,
  onNewOrderClick,
  showToast
}: { 
  orders: Order[]; 
  profile: UserProfile;
  onBack: () => void; 
  onNewOrderClick: () => void; 
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void; 
}) {
  const [activeTab, setActiveTab] = useState<'pedidos' | 'historial'>('pedidos');
  const [searchTerm, setSearchTerm] = useState('');
  
  const pendingPaymentOrders = orders.filter(o => o.type === 'pickup' && o.status !== 'delivered' && o.status !== 'cancelled' && o.paymentStatus === 'pending');
  const readyToDeliverOrders = orders.filter(o => o.type === 'pickup' && o.status === 'ready' && o.paymentStatus === 'paid');
  
  const completedStoreSales = orders.filter(o => 
    (o.status === 'delivered' || o.status === 'completed') && 
    (o.type === 'pickup' || o.id.startsWith('STORE-'))
  ).sort((a, b) => {
    const dateA = (a.deliveredAt || a.paidAt || a.createdAt) as { seconds?: number } | undefined;
    const dateB = (b.deliveredAt || b.paidAt || b.createdAt) as { seconds?: number } | undefined;
    return (dateB?.seconds || 0) - (dateA?.seconds || 0);
  });

  const filteredHistory = completedStoreSales.filter(o => 
    o.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    o.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isViewingTicket, setIsViewingTicket] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const confirmPayment = async (order: Order) => {
    setIsProcessingPayment(true);
    try {
      await updateDoc(doc(db, 'orders', order.id), { 
        paymentStatus: 'paid',
        paidAt: serverTimestamp(),
        processedBy: profile.uid,
        processedByName: profile.name,
        updatedAt: serverTimestamp()
      });
      
      setSelectedOrder({
        ...order,
        paymentStatus: 'paid'
      });

      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Pago Confirmado',
        message: `Tu pago para el pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido confirmado. Ya puedes ver tu código de entrega en la app.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });

      showToast("Pago confirmado correctamente. Ya puedes introducir el código del cliente.", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  useEffect(() => {
    if (selectedOrder?.paymentStatus === 'paid' && !isProcessingPayment) {
      setTimeout(() => {
        codeInputRef.current?.focus();
      }, 100);
    }
  }, [selectedOrder?.paymentStatus, isProcessingPayment]);

  const deliverOrder = async (order: Order) => {
    if (verificationCode && verificationCode.toUpperCase() !== order.pickupCode.toUpperCase()) {
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

  if (isViewingTicket && selectedOrder) {
    return <StoreTicketView order={selectedOrder} onDone={() => { setIsViewingTicket(false); setSelectedOrder(null); }} />;
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Caja / Ventas en Tienda</h2>
            <p className="text-xs text-gray-500">Módulo de Cajero y Cobro de Pedidos</p>
          </div>
          <Button 
            onClick={onNewOrderClick}
            className="bg-gray-900 hover:bg-black text-white h-10 px-4 rounded-xl flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva Venta</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        </div>

        <div className="flex p-1 bg-gray-100 rounded-xl">
          <button
            onClick={() => setActiveTab('pedidos')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              activeTab === 'pedidos' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            Pedidos App
          </button>
          <button
            onClick={() => setActiveTab('historial')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              activeTab === 'historial' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            Historial de Ventas
          </button>
        </div>
      </div>

      {activeTab === 'pedidos' ? (
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-orange-500 uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Pendientes de Pago en Tienda
            </h3>
            {pendingPaymentOrders.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <p className="text-xs text-gray-400">No hay pagos pendientes</p>
              </div>
            ) : (
              pendingPaymentOrders.map(order => (
                <div 
                  key={order.id} 
                  onClick={() => setSelectedOrder(order)}
                  className="bg-white rounded-2xl p-4 border border-orange-100 shadow-sm space-y-3 cursor-pointer hover:border-orange-300 transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</h4>
                      <p className="text-xs text-gray-500">{order.userName}</p>
                      <div className="mt-1">
                        {order.status === 'ready' ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold uppercase tracking-wider">
                            Listo para Entrega
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold uppercase tracking-wider italic">
                            En Preparación...
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-orange-100 text-orange-700">
                      Cobrar ${(order.adjustedTotal ?? order.total).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4" />
              Listos para Entrega
            </h3>
            {readyToDeliverOrders.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <p className="text-xs text-gray-400">No hay pedidos listos para entregar</p>
              </div>
            ) : (
              readyToDeliverOrders.map(order => (
                <div 
                  key={order.id} 
                  onClick={() => setSelectedOrder(order)}
                  className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm space-y-3 cursor-pointer hover:border-emerald-300 transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</h4>
                      <p className="text-xs text-gray-500">{order.userName}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-emerald-100 text-emerald-700">
                      Entregar (Pagado)
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Buscar por cliente o folio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-gray-200"
            />
          </div>

          <div className="space-y-3">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-100">
                <p className="text-sm text-gray-400">No se encontraron ventas finalizadas</p>
              </div>
            ) : (
              filteredHistory.map(order => (
                <div 
                  key={order.id} 
                  onClick={() => {
                    setSelectedOrder(order);
                    setIsViewingTicket(true);
                  }}
                  className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2 cursor-pointer hover:border-gray-300 transition-all active:scale-[0.98]"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</span>
                        {order.id.startsWith('STORE-') && (
                          <span className="text-[8px] bg-gray-900 text-white px-1 rounded">MOSTRADOR</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{order.userName}</p>
                    </div>
                    <span className="text-sm font-black text-gray-900">${(order.adjustedTotal ?? order.total).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                    <span className="text-[10px] text-gray-400">
                      {order.deliveredAt ? new Date(((order.deliveredAt as unknown) as { toDate: () => Date }).toDate()).toLocaleString() : 
                       order.paidAt ? new Date(((order.paidAt as unknown) as { toDate: () => Date }).toDate()).toLocaleString() : 
                       new Date(((order.createdAt as unknown) as { toDate: () => Date }).toDate()).toLocaleString()}
                    </span>
                    <Button variant="ghost" className="h-6 px-2 text-[10px] font-bold text-gray-500 hover:text-gray-900">
                      Ver Ticket
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
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
                <h3 className="font-bold text-xl">Recogida: #{selectedOrder.id.slice(-6).toUpperCase()}</h3>
                <button onClick={() => { setSelectedOrder(null); setVerificationCode(''); }} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl space-y-2">
                  <p className="text-xs text-gray-400 font-bold uppercase">Cliente</p>
                  <p className="font-bold text-gray-900">{selectedOrder.userName}</p>
                  <p className="text-sm text-gray-500">{selectedOrder.userEmail}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-bold uppercase ml-1">Productos</p>
                  <div className="bg-white border border-gray-100 rounded-xl p-3">
                    {selectedOrder.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-xs text-gray-600 py-1 border-b border-gray-50 last:border-0">
                        <span>
                          {item.quantity}x {item.name}
                          {item.unit === 'Kg' && (item.loaderWeight || item.preparerWeight || item.approxWeight) && (
                            <span className="text-[10px] text-gray-400 block italic">
                              ({item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)} Kg)
                            </span>
                          )}
                        </span>
                        <span className="font-bold text-gray-700">
                          ${(item.unit === 'Kg' 
                            ? (item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)))
                            : (item.price * item.quantity)).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 space-y-4">
                  {selectedOrder.paymentStatus === 'pending' ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex flex-col items-center gap-2 text-center">
                        <CreditCard className="w-8 h-8 text-orange-500" />
                        <div>
                          <p className="text-orange-900 font-bold">Cobro Pendiente</p>
                          <p className="text-sm text-orange-700 font-medium">
                            {selectedOrder.weightValidated ? 'Peso Validado' : 'Peso Aproximado (Pendiente Pesaje)'}
                          </p>
                          <p className="text-sm text-orange-700">Total a cobrar: <span className="text-lg font-black">${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}</span></p>
                        </div>
                      </div>
                      <Button 
                        className="w-full h-12 bg-[#0056b3] hover:bg-blue-900" 
                        onClick={() => confirmPayment(selectedOrder)}
                        disabled={isProcessingPayment}
                      >
                        {isProcessingPayment ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Confirmar Pago Recibido"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        <p className="text-sm font-bold text-emerald-900 uppercase">Pago Confirmado</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase ml-1">Código de Verificación (Opcional para Staff)</label>
                        <Input 
                          ref={codeInputRef}
                          placeholder="Código del cliente (si está disponible)"
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value)}
                          className="text-center font-black tracking-widest text-lg border-emerald-100 focus:border-emerald-300"
                        />
                      </div>
                      <Button 
                        className="w-full h-12 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-100" 
                        onClick={() => deliverOrder(selectedOrder)}
                      >
                        Confirmar Entrega en Tienda
                      </Button>
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
