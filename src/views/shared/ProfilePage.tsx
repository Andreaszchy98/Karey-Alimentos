import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, ChevronRight, LogOut } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db, logout } from '../../firebase';
import { Button, Input } from '../../components/ui';
import { cn } from '../../components/ui';
import { UserProfile, UserRole, Page } from '../../types';

export interface ProfilePageProps {
  profile: UserProfile | null;
  onUpdate: (updated: UserProfile) => void;
  isAdmin: boolean;
  effectiveRole: UserRole;
  setCurrentPage: (page: Page) => void;
  onLogout: () => void;
}

export function ProfilePage({ profile, onUpdate, effectiveRole, setCurrentPage, onLogout }: ProfilePageProps) {
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [role, setRole] = useState(profile?.role || 'client');
  const [isSaving, setIsSaving] = useState(false);

  if (!profile) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
        <Loader2 className="w-16 h-16 text-blue-900 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
      </div>
    );
  }

  const isWorker = ['dispatcher', 'preparer', 'driver', 'loader', 'store_sales', 'inventory', 'karey_inventory'].includes(effectiveRole);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = { ...profile, name, phone, role };
      await setDoc(doc(db, 'users', profile.uid), updated);
      onUpdate(updated);
    } catch (error) {
      console.error("Error updating profile:", error);
    }
    setIsSaving(false);
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    client: 'Cliente',
    company: 'Empresa',
    dispatcher: 'Despachador',
    preparer: 'Preparador',
    driver: 'Conductor',
    loader: 'Cargador',
    inventory: 'Inventarios',
    store_sales: 'Cajero',
    karey_inventory: 'Inv. Jabas Karey'
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <h2 className="text-xl font-bold text-gray-900">Mi Perfil</h2>
      
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Nombre Completo</label>
          <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
        </div>

        {isWorker && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Rol</label>
            <Input value={roleLabels[profile.role] || profile.role} disabled className="bg-gray-50" />
          </div>
        )}

        {(profile.role === 'admin' || profile.role === 'client' || profile.role === 'company') && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">
              {profile.role === 'admin' ? 'Modo de Vista' : 'Tipo de Perfil'}
            </label>
            {profile.role === 'admin' ? (
              <div className="flex flex-wrap gap-2">
                {(['admin', 'client', 'company', 'dispatcher', 'preparer', 'loader', 'store_sales', 'driver', 'inventory', 'karey_inventory'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      const updated = { ...profile, viewAs: v };
                      localStorage.setItem('viewAs', v);
                      onUpdate(updated);
                    }}
                    className={cn(
                      "flex-1 min-w-[80px] py-2 px-3 rounded-lg border text-[10px] font-bold transition-all",
                      (profile.viewAs || 'admin') === v ? "bg-[#0056b3] text-white border-[#0056b3]" : "bg-white text-gray-500 border-gray-200"
                    )}
                  >
                    {roleLabels[v] || v}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                <button 
                  onClick={() => setRole('client')}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg border text-xs font-bold transition-all",
                    role === 'client' ? "bg-[#0056b3] text-white border-[#0056b3]" : "bg-white text-gray-500 border-gray-200"
                  )}
                >
                  Cliente
                </button>
                <button 
                  onClick={() => setRole('company')}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg border text-xs font-bold transition-all",
                    role === 'company' ? "bg-[#0056b3] text-white border-[#0056b3]" : "bg-white text-gray-500 border-gray-200"
                  )}
                >
                  Empresa
                </button>
              </div>
            )}
          </div>
        )}
        
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Número de Celular</label>
          <Input value={phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)} />
        </div>

        {isWorker && (
          <div className="pt-2">
            <Button 
              variant="outline" 
              className="w-full flex items-center justify-center gap-2 border-[#0056b3] text-[#0056b3] hover:bg-blue-50"
              onClick={() => {
                if (effectiveRole === 'dispatcher') setCurrentPage('dispatcher-view');
                else if (effectiveRole === 'preparer') setCurrentPage('preparer-view');
                else if (effectiveRole === 'loader') setCurrentPage('loader-view');
                else if (effectiveRole === 'driver') setCurrentPage('driver-view');
                else if (effectiveRole === 'store_sales') setCurrentPage('store-sales-view');
                else if (effectiveRole === 'admin') setCurrentPage('admin-dashboard');
              }}
            >
              <ChevronRight className="w-5 h-5" />
              Ir a Panel de {roleLabels[effectiveRole] || 'Trabajo'}
            </Button>
          </div>
        )}

        {!isWorker && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Correo Electrónico</label>
            <Input value={profile.email} disabled className="bg-gray-50" />
          </div>
        )}
      </div>

      <div className="pt-4 space-y-3">
        <Button onClick={handleSave} className="w-full h-12" disabled={isSaving}>
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Guardar Cambios'}
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => {
            if (onLogout) onLogout();
            else logout();
          }} 
          className="w-full flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="w-5 h-5" />
          Cerrar Sesión
        </Button>
      </div>
    </motion.div>
  );
}
