import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Trash2, Loader2, Image, Plus, AlertTriangle, EyeOff, Eye, Factory } from 'lucide-react';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { ref as sRef, deleteObject } from 'firebase/storage';
import { db, storage, uploadImage, handleFirestoreError, OperationType } from '../../firebase';
import { Button, Input } from '../../components/ui';
import { cn } from '../../components/ui';
import { Product, Category, ToastType, Supplier } from '../../types';
import { compressImageToBlob, transformImageUrl } from '../../lib/utils';
import { INITIAL_SUPPLIERS } from '../../constants';

export function AdminProductFormView({ 
  product, 
  categories, 
  suppliers = INITIAL_SUPPLIERS,
  onBack, 
  effectiveRole, 
  showToast, 
  onProductSaved, 
  onProductDeleted 
}: { 
  product: Product | null; 
  categories: Category[]; 
  suppliers?: Supplier[];
  onBack: () => void; 
  effectiveRole: string; 
  showToast: (msg: string, type?: ToastType) => void; 
  onProductSaved?: (prod: Product) => void; 
  onProductDeleted?: (id: string) => void; 
}) {
  const isAdmin = effectiveRole === 'admin';
  const [name, setName] = useState(product?.name || '');
  const [category, setCategory] = useState(product?.category || categories[0]?.name || '');
  const [subcategory, setSubcategory] = useState(product?.subcategory || '');
  const [supplierId, setSupplierId] = useState(product?.supplierId || (suppliers.find(s => s.isDefault)?.id || 'sup_karey'));
  const [unit, setUnit] = useState<'Kg' | 'Paq' | 'Pza' | 'Fco' | 'Bolsa' | 'Caja'>(product?.unit || 'Paq');
  const [price, setPrice] = useState(product?.price.toString() || '0');
  const [description, setDescription] = useState(product?.description || '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || '');
  const [approxWeight, setApproxWeight] = useState(product?.approxWeight?.toString() || '');
  const [piecesPerJaba, setPiecesPerJaba] = useState(product?.piecesPerJaba?.toString() || '');
  const [isHidden, setIsHidden] = useState(product?.isHidden || false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const selectedCategoryData = categories.find(c => c.name === category);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const blob = await compressImageToBlob(file);
      const filename = `products/${name.replace(/\s+/g, '_').toLowerCase() || 'product'}_${Date.now()}.jpg`;

      if (imageUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const oldRef = sRef(storage, imageUrl);
          await deleteObject(oldRef);
        } catch (e) {
          console.warn('Could not delete old product image:', e);
        }
      }

      const url = await uploadImage(blob, filename);
      setImageUrl(url);
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name || !price) return;
    setIsSaving(true);
    try {
      const selectedSup = suppliers.find(s => s.id === supplierId);
      const productData: Partial<Product> = {
        name: name || 'S/N',
        category: category || 'Sin Categoría',
        subcategory: subcategory || '',
        supplierId: supplierId || null as any,
        supplierName: selectedSup ? selectedSup.name : 'Karey',
        unit: unit || 'Paq',
        price: Number(price) || 0,
        description: description || '',
        imageUrl: imageUrl || '',
        stock: product?.stock || 0,
        reserved: product?.reserved || 0,
        piecesPerJaba: Number(piecesPerJaba) || 0,
        isHidden: !!isHidden
      };

      if (unit === 'Kg') {
        productData.approxWeight = parseFloat(approxWeight) || 0;
      }

      if (product) {
        await updateDoc(doc(db, 'products', product.id), productData);
        if (onProductSaved) {
          onProductSaved({ id: product.id, ...productData } as Product);
        }
        showToast('Producto actualizado correctamente', 'success');
      } else {
        const newDoc = await addDoc(collection(db, 'products'), productData);
        if (onProductSaved) {
          onProductSaved({ id: newDoc.id, ...productData } as Product);
        }
        showToast('Producto creado correctamente', 'success');
      }
      onBack();
    } catch (error) {
      const op = product ? OperationType.UPDATE : OperationType.CREATE;
      const path = product ? `products/${product.id}` : 'products';
      handleFirestoreError(error, op, path);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!product) return;
    setIsDeleting(true);
    try {
      await updateDoc(doc(db, 'products', product.id), { isDeleted: true });
      if (onProductDeleted) {
        onProductDeleted(product.id);
      }
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${product.id}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ChevronRight className="w-6 h-6 rotate-180" />
          </Button>
          <h2 className="text-xl font-bold text-gray-900">{product ? 'Editar Producto' : 'Nuevo Producto'}</h2>
        </div>
        {product && isAdmin && (
          <Button 
            variant="ghost" 
            onClick={() => setShowDeleteConfirm(true)} 
            className="text-red-600 hover:bg-red-50 p-2 rounded-xl"
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
          </Button>
        )}
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div className="space-y-4">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Imagen del Producto</label>
          <div className="flex flex-col items-center gap-4">
            <div className="w-48 h-48 rounded-3xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden relative group">
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-10 h-10 animate-spin text-red-500" />
                  <span className="text-[10px] font-bold text-gray-400">SUBIENDO...</span>
                </div>
              ) : (imageUrl && imageUrl.trim()) ? (
                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Image className="w-12 h-12 text-gray-300" />
              )}
              {isAdmin && !isUploading && (
                <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <Plus className="w-10 h-10 text-white" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-2 mt-4">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1 block">URL Directa de la Imagen</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={imageUrl} 
                  onChange={(e) => setImageUrl(transformImageUrl(e.target.value))}
                  placeholder="https://ejemplo.com/producto.jpg"
                  className={`w-full bg-gray-50 border ${imageUrl && !(/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(imageUrl) || imageUrl.includes('drive.google.com')) ? 'border-amber-500' : 'border-gray-200'} rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 pr-10`}
                />
                <Image className="absolute right-3 top-3.5 w-4 h-4 text-gray-400" />
              </div>
              {imageUrl && !(/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(imageUrl) || imageUrl.includes('drive.google.com')) && (
                <p className="text-[10px] text-amber-600 font-medium px-1">
                  ⚠️ El link debe ser directo (ej: termina en .jpg o es de Google Drive).
                </p>
              )}
              <p className="text-[10px] text-gray-400">Puedes usar una URL de internet o un link compartido de Google Drive.</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Nombre</label>
          <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Nombre del producto" disabled={!isAdmin} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Categoría</label>
            <select 
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all disabled:bg-gray-50 text-xs"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSubcategory('');
              }}
              disabled={!isAdmin}
            >
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Subcategoría</label>
            <select 
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all disabled:bg-gray-50 text-xs"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              disabled={!isAdmin || !selectedCategoryData || selectedCategoryData.subcategories.length === 0}
            >
              <option value="">Ninguna</option>
              {selectedCategoryData?.subcategories.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-teal-700 uppercase ml-1 flex items-center gap-1">
              <Factory className="w-3.5 h-3.5 text-teal-600" />
              Proveedor
            </label>
            <select 
              className="w-full px-4 py-2 border border-teal-200 bg-teal-50/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-all disabled:bg-gray-50 text-xs font-medium text-gray-900"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              disabled={!isAdmin}
            >
              <option value="">-- Sin asignar / Karey Base --</option>
              {suppliers.map(sup => (
                <option key={sup.id} value={sup.id}>
                  {sup.name} {sup.code ? `(${sup.code})` : ''} {sup.isDefault ? '• Principal' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Precio</label>
            <Input type="number" value={price} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrice(e.target.value)} disabled={!isAdmin} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Unidad de Venta</label>
            <select 
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all disabled:bg-gray-50"
              value={unit}
              onChange={(e) => setUnit(e.target.value as 'Kg' | 'Paq' | 'Pza' | 'Fco' | 'Bolsa' | 'Caja')}
              disabled={!isAdmin}
            >
              <option value="Paq">Paquete (Paq)</option>
              <option value="Kg">Kilogramo (Kg)</option>
              <option value="Pza">Pieza (Pza)</option>
              <option value="Fco">Frasco (Fco)</option>
              <option value="Bolsa">Bolsa</option>
              <option value="Caja">Caja</option>
            </select>
          </div>
        </div>

        {unit === 'Kg' && (
          <div className="space-y-2 bg-orange-50/50 p-4 rounded-2xl border border-orange-100/50">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Peso en Kg aproximado</label>
            <Input 
              type="number" 
              step="0.01" 
              value={approxWeight} 
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApproxWeight(e.target.value)} 
              placeholder="Ej: 1.5"
              className="bg-white"
              disabled={!isAdmin} 
            />
            <p className="text-[10px] text-gray-500 italic ml-1">
              Este valor se multiplicará por el precio/Kg para dar un total de referencia al cliente.
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="space-y-2 bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Piezas por Jaba (Inventario)</label>
            <Input 
              type="number" 
              value={piecesPerJaba} 
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPiecesPerJaba(e.target.value)} 
              placeholder="Ej: 20"
              className="bg-white"
              disabled={!isAdmin} 
            />
            <p className="text-[10px] text-gray-500 italic ml-1">
              Configura cuántas piezas o kilos contiene una jaba para este producto.
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                {isHidden ? <EyeOff className="w-4 h-4 text-amber-600" /> : <Eye className="w-4 h-4 text-gray-500" />}
                <label className="text-sm font-bold text-gray-900">Ocultar producto a clientes y staff</label>
              </div>
              <p className="text-xs text-gray-500">
                Al activar esto, el producto no aparecerá en el catálogo de los clientes ni en la lista de los trabajadores.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsHidden(!isHidden)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                isHidden ? "bg-amber-500" : "bg-gray-200"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out",
                  isHidden ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Descripción</label>
          <textarea 
            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all resize-none h-32 disabled:bg-gray-50"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción del producto..."
            disabled={!isAdmin}
          />
        </div>

        {isAdmin && (
          <Button onClick={handleSave} className="w-full py-4" disabled={isSaving || isUploading}>
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (product ? 'Guardar Cambios' : 'Crear Producto')}
          </Button>
        )}
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[110]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">¿Eliminar producto?</h3>
                <p className="text-gray-500 text-sm">
                  Esta acción eliminará el producto <strong>{product?.name}</strong> y no se puede deshacer.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>
                  Cancelar
                </Button>
                <Button variant="danger" className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Eliminar'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
