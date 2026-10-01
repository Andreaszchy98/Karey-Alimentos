import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Factory, Plus, Search, Phone, Mail, MapPin, Edit, Trash2, X, Check, Building2, Package, Tag, ShieldCheck, ChevronRight } from 'lucide-react';
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button, Input } from '../../components/ui';
import { cn } from '../../components/ui';
import { Supplier, Product, ToastType } from '../../types';
import { CATEGORIES } from '../../constants';

export function AdminSuppliersView({
  suppliers,
  products,
  onBack,
  showToast,
  onSupplierSaved,
  onSupplierDeleted
}: {
  suppliers: Supplier[];
  products: Product[];
  onBack: () => void;
  showToast?: (msg: string, type?: ToastType) => void;
  onSupplierSaved?: (supplier: Supplier) => void;
  onSupplierDeleted?: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [categoriesSupplied, setCategoriesSupplied] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);

  const openCreateModal = () => {
    setEditingSupplier(null);
    setName('');
    setCode('');
    setContactName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setNotes('');
    setCategoriesSupplied(['Jamones', 'Salchichas']);
    setIsDefault(false);
    setIsModalOpen(true);
  };

  const openEditModal = (sup: Supplier) => {
    setEditingSupplier(sup);
    setName(sup.name);
    setCode(sup.code || '');
    setContactName(sup.contactName || '');
    setPhone(sup.phone || '');
    setEmail(sup.email || '');
    setAddress(sup.address || '');
    setNotes(sup.notes || '');
    setCategoriesSupplied(sup.categoriesSupplied || []);
    setIsDefault(!!sup.isDefault);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast?.('El nombre del proveedor es obligatorio', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<Supplier> = {
        name: name.trim(),
        code: code.trim().toUpperCase() || undefined,
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        categoriesSupplied,
        isDefault,
        updatedAt: serverTimestamp() as any
      };

      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.id), payload);
        const updated: Supplier = { ...editingSupplier, ...payload };
        onSupplierSaved?.(updated);
        showToast?.('Proveedor actualizado correctamente', 'success');
      } else {
        payload.createdAt = serverTimestamp() as any;
        const ref = await addDoc(collection(db, 'suppliers'), payload);
        const created: Supplier = { id: ref.id, ...payload } as Supplier;
        onSupplierSaved?.(created);
        showToast?.('Proveedor registrado correctamente', 'success');
      }

      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving supplier:', error);
      const op = editingSupplier ? OperationType.UPDATE : OperationType.CREATE;
      handleFirestoreError(error, op, editingSupplier ? `suppliers/${editingSupplier.id}` : 'suppliers');
      showToast?.('Error al guardar proveedor', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'suppliers', id));
      onSupplierDeleted?.(id);
      showToast?.('Proveedor eliminado', 'success');
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Error deleting supplier:', error);
      handleFirestoreError(error, OperationType.DELETE, `suppliers/${id}`);
      showToast?.('Error al eliminar proveedor', 'error');
    }
  };

  const filteredSuppliers = suppliers.filter(s => {
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) ||
      (s.code || '').toLowerCase().includes(q) ||
      (s.contactName || '').toLowerCase().includes(q) ||
      (s.categoriesSupplied || []).some(c => c.toLowerCase().includes(q));
  });

  const toggleCategory = (cat: string) => {
    setCategoriesSupplied(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onBack} className="p-2 -ml-2">
            <ChevronRight className="w-6 h-6 rotate-180" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Factory className="w-5 h-5 text-teal-600" />
              Catálogo de Proveedores
            </h2>
            <p className="text-xs text-gray-400 font-medium">Gestión de fabricantes, queserías y orígenes de mercancía</p>
          </div>
        </div>

        <Button onClick={openCreateModal} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-xs">
          <Plus className="w-4 h-4" />
          <span className="text-xs font-bold">Nuevo Proveedor</span>
        </Button>
      </div>

      {/* Search & Info Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar proveedor, código o marca..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
          />
        </div>
        <div className="text-xs font-semibold text-gray-500 flex items-center gap-3 w-full sm:w-auto justify-end">
          <span>{filteredSuppliers.length} proveedores registrados</span>
        </div>
      </div>

      {/* Supplier Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSuppliers.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-gray-200 p-6">
            <Factory className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-bold text-sm">No se encontraron proveedores</p>
            <p className="text-xs text-gray-400 mt-1">Crea un nuevo proveedor para comenzar a relacionar la mercancía.</p>
          </div>
        ) : (
          filteredSuppliers.map(supplier => {
            const suppliedCount = products.filter(p => p.supplierId === supplier.id || (!p.supplierId && supplier.isDefault)).length;

            return (
              <div 
                key={supplier.id}
                className={cn(
                  "bg-white rounded-2xl p-5 border shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative",
                  supplier.isDefault ? "border-teal-200 bg-teal-50/10" : "border-gray-100"
                )}
              >
                {supplier.isDefault && (
                  <span className="absolute top-3 right-3 bg-teal-100 text-teal-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-teal-600" />
                    Principal
                  </span>
                )}

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-black text-sm shrink-0 border border-teal-100">
                      {supplier.code ? supplier.code.slice(0, 3) : supplier.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1 pr-14">
                      <h3 className="font-bold text-gray-900 text-sm leading-snug truncate" title={supplier.name}>
                        {supplier.name}
                      </h3>
                      {supplier.code && (
                        <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mt-0.5">
                          Cód: {supplier.code}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs text-gray-600 pt-1 border-t border-gray-50">
                    {supplier.contactName && (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{supplier.contactName}</span>
                      </div>
                    )}
                    {supplier.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <a href={`tel:${supplier.phone}`} className="text-blue-600 hover:underline truncate">
                          {supplier.phone}
                        </a>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <a href={`mailto:${supplier.email}`} className="text-gray-600 hover:underline truncate">
                          {supplier.email}
                        </a>
                      </div>
                    )}
                    {supplier.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate text-gray-500">{supplier.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Categories badges */}
                  {supplier.categoriesSupplied && supplier.categoriesSupplied.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {supplier.categoriesSupplied.map(cat => (
                        <span key={cat} className="bg-gray-100 text-gray-600 text-[9px] font-bold px-2 py-0.5 rounded-md">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  {supplier.notes && (
                    <p className="text-[11px] text-gray-400 italic line-clamp-2 bg-gray-50/70 p-2 rounded-lg">
                      "{supplier.notes}"
                    </p>
                  )}
                </div>

                {/* Footer / Stats & Actions */}
                <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Package className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-bold text-gray-800">{suppliedCount}</span>
                    <span className="text-[11px]">productos asociados</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(supplier)}
                      className="p-1.5 text-gray-400 hover:text-teal-600 rounded-lg hover:bg-teal-50 transition-colors"
                      title="Editar proveedor"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {!supplier.isDefault && (
                      <button
                        onClick={() => setDeleteConfirmId(supplier.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Eliminar proveedor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl">
              <h3 className="text-base font-bold text-gray-900">¿Eliminar proveedor?</h3>
              <p className="text-xs text-gray-500">Esta acción removerá el proveedor del catálogo. Los productos asociados mantendrán su historial.</p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(deleteConfirmId)}>Eliminar</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-xl my-8">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <Factory className="w-5 h-5 text-teal-600" />
                  <h3 className="text-base font-bold text-gray-900">
                    {editingSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                  </h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-gray-700 uppercase">
                    Nombre o Razón Social <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Karey, Lácteos Santa Rita, etc."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 mt-1 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 uppercase">Código / Siglas</label>
                    <input
                      type="text"
                      placeholder="Ej. KAREY, STA_RITA"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 uppercase">Contacto / Representante</label>
                    <input
                      type="text"
                      placeholder="Ej. Juan Pérez"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 uppercase">Teléfono de Pedidos</label>
                    <input
                      type="text"
                      placeholder="Ej. 800-123-4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-700 uppercase">Correo Electrónico</label>
                    <input
                      type="email"
                      placeholder="pedidos@proveedor.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs mt-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-700 uppercase">Ubicación / Planta / Dirección</label>
                  <input
                    type="text"
                    placeholder="Ej. Cuauhtémoc, Chihuahua"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs mt-1"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-700 uppercase block mb-1.5">Líneas de Producto Suministradas</label>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.filter(c => c !== 'Todos').map(cat => {
                      const selected = categoriesSupplied.includes(cat);
                      return (
                        <button
                          type="button"
                          key={cat}
                          onClick={() => toggleCategory(cat)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all",
                            selected ? "bg-teal-600 text-white border-teal-600 shadow-xs" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                          )}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-700 uppercase">Notas Operativas</label>
                  <textarea
                    rows={2}
                    placeholder="Condiciones de entrega, días de surtido, etc."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs mt-1 resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isDefaultCheck"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded"
                  />
                  <label htmlFor="isDefaultCheck" className="text-xs text-gray-700 font-semibold cursor-pointer">
                    Marcar como proveedor predeterminado para nuevos productos
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSaving} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 text-xs font-bold">
                    {isSaving ? 'Guardando...' : (editingSupplier ? 'Actualizar Proveedor' : 'Guardar Proveedor')}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
