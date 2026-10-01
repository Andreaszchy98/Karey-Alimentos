import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Truck, Package, User as UserIcon, Phone, FileText, Loader2, CreditCard, CheckCircle2, ShieldCheck, Info, Calendar, AlertTriangle, Building2 } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { cn } from '../../components/ui';
import { Product, UserProfile, Order, OrderItem } from '../../types';
import { INITIAL_PRODUCTS } from '../../constants';
import { AddressPicker } from './AddressPicker';
import { calculateRoadDistance } from '../../lib/utils';
import { calculateOrderPricing, calculateClientCreditBalance } from '../../lib/orders';
import { geocodeOSMAddress } from '../../lib/osm';

export interface CheckoutPageProps {
  cart: Record<string, number>;
  total: number;
  products: Product[];
  orders?: Order[];
  onBack: () => void;
  onConfirm: (
    address: string,
    deliverySlot: string,
    paymentMethod: 'cash' | 'card' | 'credit',
    recipientName: string,
    orderType: 'delivery' | 'pickup',
    notes: string,
    addressLocation?: { lat: number; lng: number },
    deliveryFee?: number,
    deliveryDistance?: number,
    deliveryWindowStart?: string,
    deliveryWindowEnd?: string
  ) => Promise<void>;
  profile: UserProfile | null;
  isDriverOrdering?: boolean;
  shopLocation?: { lat: number; lng: number; address: string };
  isOnline?: boolean;
}

export function CheckoutPage({ 
  cart, 
  total, 
  products, 
  orders = [],
  onBack, 
  onConfirm, 
  profile, 
  isDriverOrdering, 
  shopLocation = { lat: 23.2494, lng: -106.4111, address: 'Matriz' }, 
  isOnline = true 
}: CheckoutPageProps) {
  const isStoreOrdering = profile?.role === 'store_sales';
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>(isStoreOrdering ? 'pickup' : 'delivery');
  const [recipientName, setRecipientName] = useState(isDriverOrdering || isStoreOrdering ? '' : (profile?.name || ''));
  const [address, setAddress] = useState('');
  const [addressLocation, setAddressLocation] = useState<{ lat: number, lng: number } | undefined>(undefined);
  const [phone, setPhone] = useState(profile?.phone || '');
  const [deliverySlot, setDeliverySlot] = useState(isStoreOrdering ? 'Inmediato' : '');
  const [deliveryDate, setDeliveryDate] = useState<string>(() => {
    const now = new Date();
    const day = now.getDay();
    // If Sat (6) or Sun (0), default to next Monday
    if (day === 0) {
      const mon = new Date(now);
      mon.setDate(now.getDate() + 1);
      return mon.toISOString().split('T')[0];
    }
    if (day === 6) {
      const mon = new Date(now);
      mon.setDate(now.getDate() + 2);
      return mon.toISOString().split('T')[0];
    }
    return now.toISOString().split('T')[0];
  });
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'credit'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notes, setNotes] = useState('');
  const [deliveryWindowStart, setDeliveryWindowStart] = useState('08:00');
  const [deliveryWindowEnd, setDeliveryWindowEnd] = useState('17:30');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryDistance, setDeliveryDistance] = useState(0);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [step, setStep] = useState<'type' | 'address' | 'review' | 'delivery' | 'payment' | 'card-details'>(isStoreOrdering ? 'review' : 'type');

  const creditLimit = profile?.creditLimit || 0;
  const creditBalance = profile?.uid ? calculateClientCreditBalance(profile.uid, orders) : 0;
  const availableCredit = creditLimit - creditBalance;
  const orderFinalTotal = (total || 0) + (orderType === 'delivery' ? deliveryFee : 0);
  const canPayWithCredit = 
    profile?.role === 'company' && 
    creditLimit > 0 && 
    creditBalance < creditLimit && 
    availableCredit >= orderFinalTotal;

  const [cardInfo, setCardInfo] = useState({
    number: '',
    expiry: '',
    cvv: '',
    name: ''
  });

  const items = Object.entries(cart).map(([id, qty]) => {
    const p = products.find((prod) => prod.id === id) || INITIAL_PRODUCTS.find(prod => prod.id === id);
    return { ...p, qty };
  });

  const pricingSummary = useMemo(() => {
    const orderItems: OrderItem[] = items.map(item => ({
      productId: item.id || '',
      name: item.name || '',
      quantity: item.qty || 0,
      price: item.price || 0,
      unit: item.unit || 'Paq',
      approxWeight: item.approxWeight || 0
    }));
    return calculateOrderPricing(orderItems, deliveryFee, 0);
  }, [items, deliveryFee]);

  useEffect(() => {
    async function updateDistance() {
      if (orderType === 'delivery' && addressLocation) {
        setIsCalculatingDistance(true);
        const result = await calculateRoadDistance(shopLocation, addressLocation);
        setDeliveryFee(result.fee);
        setDeliveryDistance(result.distance);
        setIsCalculatingDistance(false);
      } else {
        setDeliveryFee(0);
        setDeliveryDistance(0);
      }
    }
    updateDistance();
  }, [orderType, addressLocation, shopLocation]);

  const handleProceedToReview = async () => {
    if (orderType === 'delivery') {
      let loc = addressLocation;
      // If no location was selected or location is identical to shop, try geocoding
      if (!loc || (shopLocation && loc.lat === shopLocation.lat && loc.lng === shopLocation.lng)) {
        setIsCalculatingDistance(true);
        const geocoded = await geocodeOSMAddress(address);
        if (geocoded) {
          loc = { lat: geocoded.lat, lng: geocoded.lng };
          setAddressLocation(loc);
          if (shopLocation) {
            const res = await calculateRoadDistance(shopLocation, loc);
            setDeliveryFee(res.fee);
            setDeliveryDistance(Math.max(1.5, res.distance));
          }
        } else {
          // Fallback to reasonable city delivery coordinates so it's never 0 km
          const fallbackLoc = { lat: 23.2425, lng: -106.4150 };
          setAddressLocation(fallbackLoc);
          if (shopLocation) {
            const res = await calculateRoadDistance(shopLocation, fallbackLoc);
            setDeliveryFee(res.fee);
            setDeliveryDistance(Math.max(2.5, res.distance));
          } else {
            setDeliveryDistance(3.5);
            setDeliveryFee(45);
          }
        }
        setIsCalculatingDistance(false);
      } else if (deliveryDistance <= 0) {
        setIsCalculatingDistance(true);
        const res = await calculateRoadDistance(shopLocation, loc);
        setDeliveryFee(res.fee);
        setDeliveryDistance(Math.max(1.5, res.distance));
        setIsCalculatingDistance(false);
      }
    }
    setStep('review');
  };

  const handleConfirm = async () => {
    if (!isOnline) {
      alert("Debes estar conectado a internet para finalizar este pedido. Por favor, revisa tu conexión.");
      return;
    }
    setIsProcessing(true);
    let finalLoc = addressLocation;
    let finalDistance = deliveryDistance;
    let finalFee = deliveryFee;

    if (orderType === 'delivery') {
      if (!finalLoc) {
        const geocoded = await geocodeOSMAddress(address);
        finalLoc = geocoded ? { lat: geocoded.lat, lng: geocoded.lng } : { lat: 23.2425, lng: -106.4150 };
      }
      if (!finalDistance || finalDistance <= 0) {
        if (shopLocation && finalLoc) {
          const res = await calculateRoadDistance(shopLocation, finalLoc);
          finalDistance = Math.max(1.5, res.distance);
          finalFee = res.fee > 0 ? res.fee : 30;
        } else {
          finalDistance = 3.0;
          finalFee = 35;
        }
      }
    }

    await onConfirm(
      address, 
      deliverySlot, 
      paymentMethod, 
      recipientName, 
      orderType, 
      notes, 
      finalLoc, 
      finalFee, 
      finalDistance, 
      deliveryWindowStart, 
      deliveryWindowEnd
    );
    setIsProcessing(false);
  };

  const getWindowDuration = () => {
    const [startH, startM] = deliveryWindowStart.split(':').map(Number);
    const [endH, endM] = deliveryWindowEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    const diff = endMinutes - startMinutes;
    return diff / 60;
  };

  const windowDuration = getWindowDuration();
  const isWindowTooShort = windowDuration > 0 && windowDuration < 4;
  
  const isOutsideAllowedWindow = (() => {
    const [startH, startM] = deliveryWindowStart.split(':').map(Number);
    const [endH, endM] = deliveryWindowEnd.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    const minLimit = 8 * 60; // 08:00
    const maxLimit = 17 * 60 + 30; // 17:30
    
    if (orderType === 'pickup') {
      return startTotal < minLimit || startTotal > maxLimit;
    }
    return startTotal < minLimit || endTotal > maxLimit;
  })();

  const isLeadTimeInvalid = (() => {
    const now = new Date();
    const isToday = deliveryDate === now.toISOString().split('T')[0];
    if (!isToday) return false;

    const [startH, startM] = deliveryWindowStart.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const currentTotal = now.getHours() * 60 + now.getMinutes();
    const leadTimeNeeded = orderType === 'pickup' ? 60 : 120; // 1 hora pickup, 2 horas delivery
    
    return startTotal < (currentTotal + leadTimeNeeded);
  })();

  const isWindowInvalid = orderType === 'pickup' 
    ? (isOutsideAllowedWindow || isLeadTimeInvalid)
    : (windowDuration <= 0 || isOutsideAllowedWindow);

  const availableDates = useMemo(() => {
    const dates = [];
    const now = new Date();
    const startIndex = orderType === 'delivery' ? 1 : 0;
    const endIndex = orderType === 'delivery' ? 9 : 8;

    for (let i = startIndex; i < endIndex; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      if (d.getDay() !== 0) {
        dates.push({
          id: d.toISOString().split('T')[0],
          label: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }),
          date: d
        });
      }
    }
    return dates;
  }, [orderType]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6 pb-12"
    >
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </Button>
        <h2 className="text-xl font-bold text-gray-900">Finalizar Pedido</h2>
      </div>

      <div className="flex gap-2 mb-6">
        {['type', 'address', 'review', 'delivery', 'payment', ...(paymentMethod === 'card' ? ['card-details'] : [])].filter(s => {
          if (orderType === 'pickup' && (s === 'address' || s === 'delivery')) return false;
          return true;
        }).map((s) => (
          <div key={s} className={cn("h-1 flex-1 rounded-full transition-all duration-500", step === s ? "bg-blue-900" : "bg-gray-200")} />
        ))}
      </div>

      {step === 'type' && (
        <div className="space-y-6">
          <h3 className="font-bold text-gray-900">¿Cómo quieres recibir tu pedido?</h3>
          <div className="grid grid-cols-1 gap-4">
            <button 
              onClick={() => setOrderType('delivery')}
              className={cn(
                "p-6 rounded-3xl border-2 text-left transition-all flex items-center gap-4",
                orderType === 'delivery' ? "border-blue-900 bg-emerald-50" : "border-gray-100 bg-white"
              )}
            >
              <div className={cn("p-3 rounded-2xl", orderType === 'delivery' ? "bg-blue-900 text-white" : "bg-gray-100 text-gray-400")}>
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Entrega a Domicilio</p>
                <p className="text-xs text-gray-500">Recibe tus productos en casa</p>
              </div>
            </button>

            <button 
              onClick={() => setOrderType('pickup')}
              className={cn(
                "p-6 rounded-3xl border-2 text-left transition-all flex items-center gap-4",
                orderType === 'pickup' ? "border-blue-900 bg-emerald-50" : "border-gray-100 bg-white"
              )}
            >
              <div className={cn("p-3 rounded-2xl", orderType === 'pickup' ? "bg-blue-900 text-white" : "bg-gray-100 text-gray-400")}>
                <Package className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Recoger en Tienda</p>
                <p className="text-xs text-gray-500">Ven por tu pedido cuando esté listo</p>
              </div>
            </button>
          </div>
          <Button onClick={() => orderType === 'delivery' ? setStep('address') : setStep('review')} className="w-full h-12">Continuar</Button>
        </div>
      )}

      {step === 'address' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Datos de Entrega</h3>
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">Nombre de quien recibe</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input 
                  placeholder="Ej. Juan Pérez" 
                  className="pl-10" 
                  value={recipientName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipientName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">Dirección exacta</label>
              <AddressPicker 
                onSelect={(addr, coords) => {
                  setAddress(addr);
                  setAddressLocation(coords);
                }} 
                currentAddress={address}
                currentCoords={addressLocation}
                shopLocation={shopLocation}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">Notas (opcional)</label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                <textarea 
                  placeholder="Ej. Tocar el timbre fuerte, casa de portón negro..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 min-h-[80px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">Teléfono de contacto</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input 
                  placeholder="Ej. 6691234567" 
                  className="pl-10" 
                  value={phone}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          {address && addressLocation && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3"
            >
              <div className="p-2 bg-blue-100 rounded-lg text-blue-900">
                <Truck className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-blue-900 uppercase">Costo de envío calculado</p>
                {isCalculatingDistance ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                    <span className="text-xs text-blue-600 italic">Calculando ruta real...</span>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-bold text-gray-900">${deliveryFee.toFixed(2)}</p>
                    <p className="text-[10px] text-blue-500 font-medium">Distancia por carretera: {deliveryDistance.toFixed(1)} km</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('type')} className="flex-1">Atrás</Button>
            <Button 
              onClick={handleProceedToReview} 
              disabled={!address || isCalculatingDistance} 
              className="flex-[2]"
            >
              Ver Resumen
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          {isStoreOrdering && (
            <div className="bg-amber-50 p-4 rounded-3xl border border-amber-100 space-y-3">
              <div className="flex items-center gap-2 text-amber-900">
                <UserIcon className="w-4 h-4" />
                <h3 className="font-bold text-sm">Datos del Cliente (Mostrador)</h3>
              </div>
              <Input 
                placeholder="Nombre del Cliente (Ej. Cliente Mostrador, Jorge Beltrán...)"
                value={recipientName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipientName(e.target.value)}
                className="bg-white border-amber-200 focus:ring-amber-500"
              />
            </div>
          )}
          <h3 className="font-bold text-gray-900">Revisar Artículos</h3>
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100">
                <div className="flex items-center gap-3">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} className="w-12 h-12 rounded-lg object-cover" alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Package className="w-6 h-6 text-gray-300" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {item.name || 'Producto Desconocido'}
                      {item.unit === 'Kg' && item.approxWeight && (
                        <span className="text-gray-400 font-normal"> ({item.approxWeight} Kg aprox.)</span>
                      )}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {item.qty} {item.unit || 'Paq'} x 
                      ${(item.unit === 'Kg' ? (item.price * (item.approxWeight || 1)) : item.price).toFixed(2)}
                      {item.unit === 'Kg' && <span className="ml-1 italic">(Ref: ${item.price.toFixed(2)}/Kg)</span>}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-gray-900">
                  ${((item.qty || 0) * (item.price || 0) * (item.unit === 'Kg' ? (item.approxWeight || 1) : 1)).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="bg-[#0056b3]/5 p-4 rounded-xl space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal Productos</span>
              <span>${pricingSummary.subtotal.toFixed(2)}</span>
            </div>
            {items.some(i => i.unit === 'Kg') && (
              <div className="p-2 bg-orange-50 border border-orange-100 rounded-lg">
                <p className="text-[10px] text-orange-700 font-bold leading-tight">
                  EL TOTAL SE AJUSTARÁ SEGÚN EL PESO REAL
                </p>
                <p className="text-[9px] text-orange-600 mt-0.5">
                  Artículos por kilo serán pesados durante la preparación. El monto final puede variar ligeramente.
                </p>
              </div>
            )}
            {orderType === 'delivery' && (
              <div className="flex justify-between text-sm text-gray-600">
                <div className="flex flex-col">
                  <span>Costo de Envío</span>
                  {isCalculatingDistance ? (
                    <span className="text-[10px] text-blue-600 animate-pulse font-medium">Calculando ruta...</span>
                  ) : (
                    deliveryDistance > 0 && (
                      <span className="text-[10px] text-gray-400 font-medium">Distancia real: {deliveryDistance.toFixed(1)} km</span>
                    )
                  )}
                </div>
                <span>{isCalculatingDistance ? "..." : `$${deliveryFee.toFixed(2)}`}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-600">
              <span>IVA Incluido (16%)</span>
              <span>${(pricingSummary.total - (pricingSummary.total / 1.16)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg text-blue-900 pt-2 border-t border-blue-900/10">
              <span>Total</span>
              <span>${pricingSummary.total.toFixed(2)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => orderType === 'delivery' ? setStep('address') : setStep('type')} className="flex-1">Atrás</Button>
            <Button onClick={() => setStep('delivery')} className="flex-[2]">Continuar</Button>
          </div>
        </div>
      )}
      {step === 'delivery' && (
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-gray-900 mb-4">¿Cuándo quieres recibir tu pedido?</h3>
            {orderType === 'delivery' && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-900 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-800 leading-tight">
                  <span className="font-bold">Nota:</span> Los pedidos a domicilio deben programarse con al menos <span className="font-bold">24 horas de antelación</span>.
                </p>
              </div>
            )}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {availableDates.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDeliveryDate(d.id)}
                  className={cn(
                    "flex-shrink-0 p-3 rounded-2xl border-2 text-center transition-all min-w-[100px]",
                    deliveryDate === d.id ? "border-blue-900 bg-blue-50" : "border-gray-100 bg-white"
                  )}
                >
                  <p className={cn("text-[10px] font-bold uppercase", deliveryDate === d.id ? "text-blue-900" : "text-gray-400")}>
                    {d.label.split(' ')[0]}
                  </p>
                  <p className="text-lg font-black text-gray-900 leading-none">
                    {d.date.getDate()}
                  </p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">
                    {d.date.toLocaleDateString('es-ES', { month: 'short' })}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-gray-900">
              {orderType === 'pickup' ? 'Define tu Hora de Recogida' : 'Define tu Ventana de Recepción'}
            </h3>
            <p className="text-xs text-gray-500">
              {orderType === 'pickup' 
                ? 'Dinos a qué hora pasarás por tu pedido.' 
                : 'Dinos en qué horario estarás disponible para recibir los productos.'}
            </p>
            
            <div className={cn("grid gap-4", orderType === 'pickup' ? "grid-cols-1" : "grid-cols-2")}>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                  {orderType === 'pickup' ? 'Hora de Recogida' : 'Desde las'}
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input 
                    type="time" 
                    value={deliveryWindowStart}
                    onChange={(e) => {
                      setDeliveryWindowStart(e.target.value);
                      if (orderType === 'pickup') {
                        setDeliveryWindowEnd(e.target.value);
                        setDeliverySlot(`Recogida: ${deliveryDate} ${e.target.value}`);
                      } else {
                        setDeliverySlot(`${deliveryDate} ${e.target.value}-${deliveryWindowEnd}`);
                      }
                    }}
                    className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                  />
                </div>
              </div>
              {orderType === 'delivery' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Hasta las</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                      type="time" 
                      value={deliveryWindowEnd}
                      onChange={(e) => {
                        setDeliveryWindowEnd(e.target.value);
                        setDeliverySlot(`${deliveryDate} ${deliveryWindowStart}-${e.target.value}`);
                      }}
                      className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                    />
                  </div>
                </div>
              )}
            </div>

            {isOutsideAllowedWindow && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-rose-700 leading-tight">
                  {orderType === 'pickup' 
                    ? 'Nuestro horario de atención es de 8:00 AM a 5:30 PM.' 
                    : 'Las entregas solo se realizan entre las 8:00 AM y las 5:30 PM.'}
                </p>
              </div>
            )}

            {isLeadTimeInvalid && !isOutsideAllowedWindow && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-rose-700 leading-tight">
                  {orderType === 'pickup'
                    ? 'Necesitamos al menos 1 hora de anticipación para tener tu pedido listo.'
                    : 'Los pedidos del mismo día requieren al menos 2 horas de anticipación.'}
                </p>
              </div>
            )}

            {orderType === 'delivery' && isWindowInvalid && !isOutsideAllowedWindow && !isLeadTimeInvalid && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-rose-700 leading-tight">La hora de fin debe ser posterior a la hora de inicio.</p>
              </div>
            )}

            {orderType === 'delivery' && isWindowTooShort && !isWindowInvalid && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3 shadow-sm">
                <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 leading-tight">
                  <span className="font-bold">Aviso:</span> Tu ventana es de {windowDuration % 1 === 0 ? windowDuration : windowDuration.toFixed(1)} horas. 
                  Recomendamos una ventana de <span className="font-bold">al menos 4 horas</span> para que el repartidor pueda planificar mejor su ruta.
                </p>
              </div>
            )}

            <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
              <div className="flex gap-3">
                {orderType === 'pickup' ? <Package className="w-5 h-5 text-blue-900 shrink-0" /> : <Truck className="w-5 h-5 text-blue-900 shrink-0" />}
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  {orderType === 'pickup' 
                    ? 'Tendremos tus productos listos y pesados a la hora que indiques. ¡Te esperamos!' 
                    : 'El despachador organizará la ruta considerando tu preferencia. Si hay saturación o retrasos fuera de tu ventana, te avisaremos de inmediato.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('review')} className="flex-1">Atrás</Button>
            <Button 
              onClick={() => {
                if (orderType === 'pickup') {
                  setDeliverySlot(`Recogida: ${deliveryDate} a las ${deliveryWindowStart}`);
                } else {
                  setDeliverySlot(`${deliveryDate} ${deliveryWindowStart}-${deliveryWindowEnd}`);
                }
                setStep('payment');
              }} 
              className="flex-[2] h-12"
              disabled={isWindowInvalid}
            >
              Continuar al Pago
            </Button>
          </div>
        </div>
      )}

      {step === 'payment' && (
        <div className="space-y-4">
          <h3 className="font-bold text-gray-900">Método de Pago</h3>
          <div className="space-y-3">
            <button 
              type="button"
              onClick={() => setPaymentMethod('cash')}
              className={cn(
                "w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all",
                paymentMethod === 'cash' ? "border-blue-900 bg-emerald-50" : "border-gray-100 bg-white"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-gray-900 text-sm">Efectivo</p>
                  <p className="text-[10px] text-gray-500">Paga al repartidor al momento de la entrega</p>
                </div>
              </div>
              {paymentMethod === 'cash' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            </button>

            <button 
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={cn(
                "w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all",
                paymentMethod === 'card' ? "border-blue-900 bg-emerald-50" : "border-gray-100 bg-white"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-gray-900 text-sm">Tarjeta de Débito o Crédito</p>
                  <p className="text-[10px] text-gray-500">Pago en línea al realizar el pedido</p>
                </div>
              </div>
              {paymentMethod === 'card' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            </button>

            {canPayWithCredit && (
              <button 
                type="button"
                onClick={() => setPaymentMethod('credit')}
                className={cn(
                  "w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all",
                  paymentMethod === 'credit' ? "border-blue-900 bg-emerald-50" : "border-gray-100 bg-white"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-sky-100 text-sky-700 rounded-lg">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 text-sm">Pagar a Crédito</p>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-sky-100 text-sky-800">
                        Empresa
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500">
                      Línea autorizada: ${creditLimit.toLocaleString('es-MX', { minimumFractionDigits: 2 })} · Disponible: ${availableCredit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                {paymentMethod === 'credit' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => orderType === 'pickup' ? setStep('review') : setStep('delivery')} className="flex-1">Atrás</Button>
            {paymentMethod === 'card' ? (
              <Button onClick={() => setStep('card-details')} className="flex-[2]">Datos de Tarjeta</Button>
            ) : (
              <Button onClick={handleConfirm} className="flex-[2]" disabled={isProcessing}>
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : paymentMethod === 'credit' ? (
                  `Confirmar a Crédito $${((total || 0) + (orderType === 'delivery' ? deliveryFee : 0)).toFixed(2)}`
                ) : (
                  `Confirmar Pedido $${((total || 0) + (orderType === 'delivery' ? deliveryFee : 0)).toFixed(2)}`
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {step === 'card-details' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-gray-900">Información de Tarjeta</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Nombre en la Tarjeta</label>
              <Input 
                placeholder="Como aparece en la tarjeta"
                value={cardInfo.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCardInfo(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Número de Tarjeta</label>
              <Input 
                placeholder="0000 0000 0000 0000"
                maxLength={19}
                value={cardInfo.number}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
                  setCardInfo(prev => ({ ...prev, number: val }));
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Vencimiento</label>
                <Input 
                  placeholder="MM/AA"
                  maxLength={5}
                  value={cardInfo.expiry}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    let val = e.target.value.replace(/\D/g, '');
                    if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2);
                    setCardInfo(prev => ({ ...prev, expiry: val }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">CVV</label>
                <Input 
                  placeholder="123"
                  type="password"
                  maxLength={3}
                  value={cardInfo.cvv}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCardInfo(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '') }))}
                />
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Tus datos están protegidos. Esta es una transacción segura encriptada de extremo a extremo.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('payment')} className="flex-1">Atrás</Button>
            <Button 
              onClick={handleConfirm} 
              className="flex-[2]" 
              disabled={isProcessing || !cardInfo.name || cardInfo.number.length < 16 || cardInfo.expiry.length < 5 || cardInfo.cvv.length < 3}
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `Pagar $${((total || 0) + deliveryFee).toFixed(2)}`}
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
