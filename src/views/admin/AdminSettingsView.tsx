import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Loader2, Image, Plus, MapPin, Edit, Locate, Box } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { ref as sRef, deleteObject } from 'firebase/storage';
import { db, storage, uploadImage, handleFirestoreError, OperationType } from '../../firebase';
import { Button, Input } from '../../components/ui';
import { cn } from '../../components/ui';
import { AppSettings, ToastType } from '../../types';
import { DEFAULT_TENANT_CONFIG } from '../../config/tenant';
import { compressImageToBlob, transformImageUrl } from '../../lib/utils';
import { reverseOSMGeocode } from '../../lib/osm';
import { OSMMap } from '../../components/OSMMap';

export function AdminSettingsView({ 
  settings, 
  onBack, 
  canEditLocation, 
  showToast 
}: { 
  settings: AppSettings | null; 
  onBack: () => void; 
  canEditLocation: boolean; 
  showToast: (msg: string, type?: ToastType) => void; 
}) {
  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl || '');
  const [appName, setAppName] = useState(settings?.appName || DEFAULT_TENANT_CONFIG.name);
  const [shopAddress, setShopAddress] = useState(settings?.shopAddress || DEFAULT_TENANT_CONFIG.defaultLocation.address);
  const [shopLat, setShopLat] = useState(settings?.shopLat || DEFAULT_TENANT_CONFIG.defaultLocation.lat);
  const [shopLng, setShopLng] = useState(settings?.shopLng || DEFAULT_TENANT_CONFIG.defaultLocation.lng);
  const [containerUnitCost, setContainerUnitCost] = useState<number | string>(settings?.containerUnitCost ?? 150);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);

  const detectShopLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setShopLat(lat);
        setShopLng(lng);
        const addr = await reverseOSMGeocode(lat, lng);
        setShopAddress(addr);
      },
      () => {}
    );
  };

  const handleManualMapClick = async (pos: { lat: number, lng: number }) => {
    if (!isEditingLocation) return;
    setShopLat(pos.lat);
    setShopLng(pos.lng);
    const addr = await reverseOSMGeocode(pos.lat, pos.lng);
    setShopAddress(addr);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const blob = await compressImageToBlob(file, 400, 400, 0.8);
      const filename = `app/logo_${Date.now()}.jpg`;
      
      if (logoUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const oldRef = sRef(storage, logoUrl);
          await deleteObject(oldRef);
        } catch (e) {
          console.warn('Could not delete old logo:', e);
        }
      }

      const url = await uploadImage(blob, filename);
      setLogoUrl(url);
    } catch (error) {
      console.error('Error uploading logo:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'app'), {
        logoUrl,
        appName,
        shopAddress,
        shopLat: Number(shopLat),
        shopLng: Number(shopLng),
        containerUnitCost: Math.max(0, Number(containerUnitCost) || 0)
      }, { merge: true });
      showToast('Configuración guardada correctamente', 'success');
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/app');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </Button>
        <h2 className="text-xl font-bold text-gray-900">Configuración de la App</h2>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div className="space-y-4">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Logo de la App</label>
          <div className="flex flex-col items-center gap-4">
            <div className="w-32 h-32 rounded-3xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden relative group">
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-[10px] font-bold text-gray-400">SUBIENDO...</span>
                </div>
              ) : logoUrl.trim() ? (
                <img src={logoUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Image className="w-10 h-10 text-gray-300" />
              )}
              {!isUploading && (
                <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <Plus className="w-8 h-8 text-white" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
              )}
            </div>
            <p className="text-[10px] text-gray-400 text-center">Haz clic para subir un nuevo logo (PNG, JPG)</p>
          </div>

          <div className="space-y-2 mt-4">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1 block">URL Directa del Logo</label>
            <div className="relative">
              <input 
                type="text" 
                value={logoUrl} 
                onChange={(e) => setLogoUrl(transformImageUrl(e.target.value))}
                placeholder="https://ejemplo.com/logo.png"
                className={`w-full bg-gray-50 border ${logoUrl && !(/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(logoUrl) || logoUrl.includes('drive.google.com')) ? 'border-amber-500' : 'border-gray-200'} rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 pr-10`}
              />
              <Image className="absolute right-3 top-3.5 w-4 h-4 text-gray-400" />
            </div>
            {logoUrl && !(/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(logoUrl) || logoUrl.includes('drive.google.com')) && (
              <p className="text-[10px] text-amber-600 font-medium px-1">
                ⚠️ Este link no parece ser una imagen directa. Asegúrate de que sea un link directo.
              </p>
            )}
            <p className="text-[10px] text-gray-400">Puedes pegar links de Google Drive (compartidos), Dropbox o links directos (.jpg, .png).</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Nombre de la App</label>
          <Input 
            value={appName} 
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppName(e.target.value)} 
            placeholder="Ej: Karey Alimentos"
          />
        </div>

        <div className="pt-4 border-t border-gray-50 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-500" />
              Ubicación del Establecimiento
            </h3>
            {canEditLocation && (
              <Button 
                variant="outline" 
                className={cn("text-xs h-8 px-3 py-0 flex items-center justify-center", isEditingLocation && "bg-blue-50 border-blue-200 text-blue-600")}
                onClick={() => setIsEditingLocation(!isEditingLocation)}
              >
                <Edit className="w-3 h-3 mr-1.5" />
                {isEditingLocation ? 'Fijar Ubicación' : 'Editar Ubicación'}
              </Button>
            )}
          </div>
          
          {isEditingLocation && (
            <div className="space-y-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
              <p className="text-[10px] text-blue-600 font-bold uppercase">Modo Edición Activado</p>
              <p className="text-xs text-gray-600">Haz clic en el mapa para ubicar tu establecimiento o usa el botón de detección automática.</p>
              
              <Button 
                variant="outline" 
                className="w-full bg-white border-blue-100 text-blue-600 text-xs py-2"
                onClick={detectShopLocation}
              >
                <Locate className="w-3 h-3 mr-2" />
                Detectar mi ubicación actual
              </Button>

              <div className="h-48 w-full rounded-xl overflow-hidden border border-blue-200 shadow-inner relative bg-gray-100">
                <OSMMap
                  center={{ lat: Number(shopLat), lng: Number(shopLng) }}
                  zoom={15}
                  shopLocation={{ lat: Number(shopLat), lng: Number(shopLng), address: shopAddress }}
                  customerLocation={{ lat: Number(shopLat), lng: Number(shopLng) }}
                  onMapClick={handleManualMapClick}
                  onMarkerDragEnd={handleManualMapClick}
                  className="w-full h-full"
                />
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Dirección Completa</label>
            <Input 
              value={shopAddress} 
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => isEditingLocation && setShopAddress(e.target.value)}
              readOnly={!isEditingLocation}
              className={cn(
                "font-medium text-xs h-10",
                !isEditingLocation ? "bg-gray-50/50 border-gray-100 cursor-not-allowed" : "bg-white border-blue-200 ring-2 ring-blue-50"
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Latitud</label>
              <Input 
                value={shopLat} 
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => isEditingLocation && setShopLat(Number(e.target.value))}
                readOnly={!isEditingLocation}
                className={cn(
                  "font-mono text-xs h-10",
                  !isEditingLocation ? "bg-gray-50/50 border-gray-100 cursor-not-allowed" : "bg-white border-blue-200 ring-2 ring-blue-50"
                )}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Longitud</label>
              <Input 
                value={shopLng} 
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => isEditingLocation && setShopLng(Number(e.target.value))}
                readOnly={!isEditingLocation}
                className={cn(
                  "font-mono text-xs h-10",
                  !isEditingLocation ? "bg-gray-50/50 border-gray-100 cursor-not-allowed" : "bg-white border-blue-200 ring-2 ring-blue-50"
                )}
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 italic">
            * Estos datos se usan para calcular las distancias de envío y el punto de partida en el mapa.
          </p>
        </div>

        {/* Jaba / Retornables Unit Cost */}
        <div className="pt-4 border-t border-gray-50 space-y-3">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-bold text-gray-900">Control de Jabas Retornables (Karey Alimentos)</h3>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Costo unitario por jaba que cobra el proveedor en caso de extravío o faltante en la ruta. Se usará para calcular el monto del vale de adeudo al chofer.
          </p>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Costo Unitario por Jaba ($ MXN)</label>
            <div className="relative max-w-xs">
              <span className="absolute left-3.5 top-2.5 text-sm font-bold text-gray-400">$</span>
              <Input 
                type="number" 
                min="0"
                step="1"
                value={containerUnitCost} 
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContainerUnitCost(e.target.value)} 
                placeholder="150"
                className="pl-8 font-bold text-sm h-10"
              />
            </div>
          </div>
        </div>

        <Button onClick={handleSave} className="w-full py-4" disabled={isSaving || isUploading}>
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Guardar Configuración'}
        </Button>
      </div>
    </motion.div>
  );
}
