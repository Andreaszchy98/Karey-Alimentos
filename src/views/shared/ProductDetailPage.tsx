import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Package, Minus, Plus } from 'lucide-react';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { Product } from '../../types';

export function ProductDetailPage({ 
  product, 
  onBack, 
  cartQuantity, 
  onUpdateCart, 
  onSetCartQuantity,
  effectiveRole
}: { 
  product: Product; 
  onBack: () => void; 
  cartQuantity: number; 
  onUpdateCart: (id: string, delta: number) => void; 
  onSetCartQuantity: (id: string, qty: number) => void; 
  effectiveRole: string; 
}) {
  const isSoldOut = (product.stock || 0) <= (product.reserved || 0);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6 pb-24">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </Button>
        <h2 className="text-xl font-bold text-gray-900">Detalle del Producto</h2>
      </div>

      <div className={cn(
        "bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm relative",
        isSoldOut && "opacity-75"
      )}>
        {isSoldOut && (
          <div className="absolute top-4 right-4 z-10">
            <span className="bg-red-100 text-red-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Agotado
            </span>
          </div>
        )}
        {product.imageUrl ? (
          <img src={product.imageUrl} className="w-full aspect-square object-cover" alt={product.name} referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full aspect-square bg-gray-100 flex items-center justify-center">
            <Package className="w-20 h-20 text-gray-200" />
          </div>
        )}
        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm font-bold text-red-600 uppercase tracking-wider mb-1">
              {product.category}
              {product.subcategory && ` • ${product.subcategory}`}
            </p>
            <h1 className="text-2xl font-bold text-gray-900">
              {product.name}
              {product.unit === 'Kg' && product.approxWeight && (
                <span className="text-gray-400 font-normal block text-lg mt-1">({product.approxWeight} Kg aprox.)</span>
              )}
            </h1>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-3xl font-black text-gray-900">
                ${(product.unit === 'Kg' ? product.price * (product.approxWeight || 1) : product.price).toFixed(2)}
              </span>
              <p className="text-[10px] text-gray-400">
                Precio ref. para {product.unit === 'Kg' ? `${product.approxWeight || 1} Kg` : '1 Paq'} (${product.price.toFixed(2)}/{product.unit || 'Paq'})
              </p>
              {product.unit === 'Kg' && (
                <p className="text-[11px] font-bold text-orange-600 bg-orange-50 p-2 rounded-xl border border-orange-100 mt-2">
                  Nota: El total final se calculará cuando el preparador y el cargador confirmen el peso real del producto durante el despacho.
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className={cn(
                "flex items-center gap-4 rounded-2xl p-2 border border-gray-100",
                isSoldOut ? "bg-gray-100 opacity-50" : "bg-gray-50"
              )}>
                <button 
                  onClick={() => !isSoldOut && onUpdateCart(product.id, -1)}
                  className={cn(
                    "w-10 h-10 flex items-center justify-center rounded-xl shadow-sm transition-colors",
                    isSoldOut ? "bg-gray-200" : "bg-white hover:bg-gray-50"
                  )}
                  disabled={isSoldOut}
                >
                  <Minus className="w-5 h-5 text-gray-600" />
                </button>
                <input 
                  type="number"
                  value={cartQuantity}
                  onChange={(e) => !isSoldOut && onSetCartQuantity(product.id, parseInt(e.target.value) || 0)}
                  className="text-lg font-bold w-12 text-center bg-transparent border-none focus:ring-0 p-0"
                  min="0"
                  disabled={isSoldOut}
                />
                <button 
                  onClick={() => !isSoldOut && onUpdateCart(product.id, 1)}
                  className={cn(
                    "w-10 h-10 flex items-center justify-center rounded-xl shadow-md transition-colors",
                    isSoldOut || cartQuantity >= (product.stock || 0) - (product.reserved || 0) 
                      ? "bg-gray-300 text-gray-500 shadow-none cursor-not-allowed" 
                      : "bg-red-600 shadow-red-200 hover:bg-red-700 text-white"
                  )}
                  disabled={isSoldOut || cartQuantity >= (product.stock || 0) - (product.reserved || 0)}
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              {effectiveRole === 'company' && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => !isSoldOut && onUpdateCart(product.id, 10)}
                    className={cn(
                      "text-xs font-bold px-3 py-1 rounded-lg transition-colors",
                      isSoldOut ? "bg-gray-200 text-gray-400" : "bg-gray-100 hover:bg-gray-200"
                    )}
                    disabled={isSoldOut}
                  >
                    +10
                  </button>
                  <button 
                    onClick={() => !isSoldOut && onUpdateCart(product.id, 100)}
                    className={cn(
                      "text-xs font-bold px-3 py-1 rounded-lg transition-colors",
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

        <div className="p-6 pt-4 border-t border-gray-50 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Descripción</h3>
            <p className="text-gray-600 leading-relaxed italic">
              {product.description || 'No hay descripción disponible para este producto.'}
            </p>
          </div>

          <div className="pt-2 flex items-center gap-2 text-sm text-gray-400">
            <Package className="w-4 h-4" />
            <span>Stock disponible: {product.stock} piezas</span>
          </div>
        </div>
      </div>

      <Button 
        onClick={onBack}
        className="w-full py-4 rounded-2xl shadow-lg shadow-red-200"
      >
        Continuar Comprando
      </Button>
    </motion.div>
  );
}
