import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Loader2, Plus, Check, X, EyeOff, Eye, Settings, Trash2, AlertTriangle } from 'lucide-react';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button, Input } from '../../components/ui';
import { cn } from '../../components/ui';
import { Category, ToastType } from '../../types';

export function AdminCategoriesView({ 
  categories, 
  onBack, 
  showToast, 
  onCategorySaved, 
  onCategoryDeleted 
}: { 
  categories: Category[]; 
  onBack: () => void; 
  showToast: (msg: string, type?: ToastType) => void; 
  onCategorySaved?: (cat: Category) => void; 
  onCategoryDeleted?: (id: string) => void; 
}) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setIsSaving(true);
    try {
      const newCatData = {
        name: newCategoryName.trim(),
        subcategories: [],
        isHidden: false
      };
      const docRef = await addDoc(collection(db, 'categories'), newCatData);
      if (onCategorySaved) {
        onCategorySaved({ id: docRef.id, ...newCatData } as Category);
      }
      setNewCategoryName('');
      showToast('Categoría creada con éxito', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCategory = async (id: string, name: string) => {
    try {
      await updateDoc(doc(db, 'categories', id), { name });
      const current = categories.find(c => c.id === id);
      if (current && onCategorySaved) {
        onCategorySaved({ ...current, name });
      }
      setEditingCategory(null);
      showToast('Categoría actualizada', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${id}`);
    }
  };

  const handleToggleHideCategory = async (cat: Category) => {
    const isHidden = !cat.isHidden;
    try {
      await updateDoc(doc(db, 'categories', cat.id), { isHidden });
      if (onCategorySaved) {
        onCategorySaved({ ...cat, isHidden });
      }
      showToast(isHidden ? `Categoría "${cat.name}" ocultada` : `Categoría "${cat.name}" visible`, 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${cat.id}`);
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteDoc(doc(db, 'categories', categoryToDelete.id));
      if (onCategoryDeleted) {
        onCategoryDeleted(categoryToDelete.id);
      }
      setCategoryToDelete(null);
      showToast('Categoría eliminada', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${categoryToDelete.id}`);
    }
  };

  const handleAddSubcategory = async (category: Category) => {
    if (!newSubcategoryName.trim()) return;
    try {
      const updatedSubcategories = [...category.subcategories, newSubcategoryName.trim()];
      await updateDoc(doc(db, 'categories', category.id), {
        subcategories: updatedSubcategories
      });
      if (onCategorySaved) {
        onCategorySaved({ ...category, subcategories: updatedSubcategories });
      }
      setNewSubcategoryName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${category.id}`);
    }
  };

  const handleDeleteSubcategory = async (category: Category, subName: string) => {
    try {
      const updatedSubcategories = category.subcategories.filter(s => s !== subName);
      await updateDoc(doc(db, 'categories', category.id), {
        subcategories: updatedSubcategories
      });
      if (onCategorySaved) {
        onCategorySaved({ ...category, subcategories: updatedSubcategories });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${category.id}`);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </Button>
        <h2 className="text-xl font-bold text-gray-900">Gestión de Categorías</h2>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex gap-2">
          <Input 
            placeholder="Nueva categoría..." 
            value={newCategoryName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCategoryName(e.target.value)}
          />
          <Button onClick={handleAddCategory} disabled={isSaving || !newCategoryName.trim()}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map(cat => (
            <div key={cat.id} className="border border-gray-100 rounded-2xl p-4 space-y-4 bg-gray-50/50 hover:bg-white hover:shadow-sm transition-all">
              <div className="flex items-center justify-between gap-2">
                {editingCategory?.id === cat.id ? (
                  <div className="flex gap-2 flex-1">
                    <Input 
                      value={editingCategory.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                      autoFocus
                    />
                    <Button size="sm" onClick={() => handleUpdateCategory(cat.id, editingCategory.name)}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingCategory(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <h3 className={cn("font-bold truncate", cat.isHidden ? "text-gray-400 line-through" : "text-gray-900")}>
                        {cat.name}
                      </h3>
                      {cat.isHidden && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-200">
                          Oculta
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        title={cat.isHidden ? "Mostrar categoría a los clientes" : "Ocultar categoría a los clientes"}
                        className={cat.isHidden ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-gray-400 hover:text-gray-600"}
                        onClick={() => handleToggleHideCategory(cat)}
                      >
                        {cat.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingCategory({ ...cat })}>
                        <Settings className="w-4 h-4 text-gray-400" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCategoryToDelete(cat)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <div className="pl-4 border-l-2 border-gray-50 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {cat.subcategories.map(sub => (
                    <div key={sub} className="bg-gray-50 px-3 py-1 rounded-full flex items-center gap-2">
                      <span className="text-xs text-gray-600">{sub}</span>
                      <button onClick={() => handleDeleteSubcategory(cat, sub)}>
                        <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Añadir subcategoría..." 
                    className="h-8 text-xs"
                    value={editingCategory?.id === cat.id ? newSubcategoryName : ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setEditingCategory(cat);
                      setNewSubcategoryName(e.target.value);
                    }}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleAddSubcategory(cat)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => handleAddSubcategory(cat)}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {categoryToDelete && (
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
                <h3 className="text-xl font-bold text-gray-900">¿Eliminar categoría?</h3>
                <p className="text-gray-500 text-sm">
                  Esta acción eliminará la categoría <strong>{categoryToDelete.name}</strong> y no se puede deshacer.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setCategoryToDelete(null)}>
                  Cancelar
                </Button>
                <Button variant="danger" className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleDeleteCategory}>
                  Eliminar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
