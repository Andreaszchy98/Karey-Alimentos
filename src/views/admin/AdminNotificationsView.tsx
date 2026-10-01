import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, ClipboardList, Bell, Package, AlertTriangle, X } from 'lucide-react';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { InventoryRequest, AppNotification } from '../../types';

export function AdminNotificationsView({ 
  requests, 
  notifications, 
  onBack,
  onApprove,
  onReject,
  onMarkAsRead,
  onDeleteNotification,
  isAdmin
}: { 
  requests: InventoryRequest[]; 
  notifications: AppNotification[]; 
  onBack: () => void; 
  onApprove: (request: InventoryRequest) => void; 
  onReject: (request: InventoryRequest) => void; 
  onMarkAsRead: (id: string) => void; 
  onDeleteNotification: (id: string) => void; 
  isAdmin: boolean; 
}) {
  const [activeTab, setActiveTab] = useState<'requests' | 'notifications'>(isAdmin ? 'requests' : 'notifications');

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </Button>
        <h2 className="text-xl font-bold text-gray-900">
          {isAdmin ? 'Notificaciones y Solicitudes' : 'Mis Alertas'}
        </h2>
      </div>

      {isAdmin && (
        <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
          <button 
            onClick={() => setActiveTab('requests')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
              activeTab === 'requests' ? "bg-white shadow-sm text-[#0056b3]" : "text-gray-500"
            )}
          >
            Solicitudes ({requests.filter(r => r.status === 'pending').length})
          </button>
          <button 
            onClick={() => setActiveTab('notifications')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
              activeTab === 'notifications' ? "bg-white shadow-sm text-[#0056b3]" : "text-gray-500"
            )}
          >
            Alertas ({notifications.filter(n => !n.read).length})
          </button>
        </div>
      )}

      <div className="space-y-4">
        {activeTab === 'requests' && isAdmin ? (
          requests.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
              <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No hay solicitudes pendientes</p>
            </div>
          ) : (
            requests.map(request => (
              <div key={request.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded font-bold uppercase mb-1 inline-block",
                      request.type === 'update' ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                    )}>
                      {request.type === 'update' ? 'Actualización' : 'Merma'}
                    </span>
                    <h4 className="font-bold text-gray-900">{request.productName}</h4>
                    <p className="text-[10px] text-gray-500">Por: {request.requestedByName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-gray-400">Cambio</p>
                    <p className="text-sm font-black">{request.oldValue} → {request.newValue}</p>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-xl">
                  <p className="text-xs text-gray-600 italic">"{request.reason}"</p>
                </div>

                {request.status === 'pending' ? (
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="secondary" 
                      className="flex-1 py-2 text-xs"
                      onClick={() => onReject(request)}
                    >
                      Rechazar
                    </Button>
                    <Button 
                      className="flex-1 py-2 text-xs"
                      onClick={() => onApprove(request)}
                    >
                      Aprobar
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-center pt-2">
                    <span className={cn(
                      "text-xs font-bold px-4 py-1 rounded-full",
                      request.status === 'approved' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {request.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                    </span>
                  </div>
                )}
              </div>
            ))
          )
        ) : (
          notifications.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No tienes notificaciones</p>
            </div>
          ) : (
            notifications.map(notification => (
              <div 
                key={notification.id} 
                className={cn(
                  "bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex gap-4 items-start transition-all relative group cursor-pointer",
                  !notification.read && "border-l-4 border-l-[#0056b3]"
                )}
                onClick={() => onMarkAsRead(notification.id)}
              >
                <div className={cn(
                  "p-2 rounded-xl shrink-0",
                  notification.type === 'order' ? "bg-blue-100 text-blue-600" :
                  notification.type === 'inventory' ? "bg-orange-100 text-orange-600" :
                  "bg-gray-100 text-gray-600"
                )}>
                  {notification.type === 'order' ? <Package className="w-5 h-5" /> :
                   notification.type === 'inventory' ? <AlertTriangle className="w-5 h-5" /> :
                   <Bell className="w-5 h-5" />}
                </div>
                <div className="flex-1 space-y-1 pr-6">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-sm text-gray-900">{notification.title}</h4>
                    <span className="text-[10px] text-gray-400">
                      {notification.createdAt?.seconds ? new Date(notification.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ahora'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{notification.message}</p>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNotification(notification.id);
                  }}
                  className="absolute top-4 right-4 p-1 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )
        )}
      </div>
    </motion.div>
  );
}
