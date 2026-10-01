import React from 'react';
import { 
  ShieldCheck, 
  Users, 
  Package, 
  History, 
  MapPin, 
  ClipboardList, 
  CreditCard, 
  Home as HomeIcon, 
  Truck, 
  Box, 
  RotateCcw, 
  Tags, 
  Settings, 
  Activity, 
  User as UserIcon, 
  LogOut, 
  Bell,
  Layers
} from 'lucide-react';
import { UserProfile, Order, Page, AppSettings } from '../../types';
import { cn, KLogo } from '../../components/ui';

interface DesktopSidebarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  profile: UserProfile | null;
  effectiveRole: string;
  setProfile: (p: UserProfile | null) => void;
  orders: Order[];
  unreadNotificationsCount?: number;
  settings?: AppSettings;
  onLogout?: () => void;
}

export function DesktopSidebar({
  currentPage,
  setCurrentPage,
  profile,
  effectiveRole,
  setProfile,
  orders,
  unreadNotificationsCount = 0,
  settings,
  onLogout
}: DesktopSidebarProps) {
  const activeOrdersCount = orders.filter(o => ['pending', 'processing', 'ready', 'shipped'].includes(o.status)).length;
  const pendingPrepCount = orders.filter(o => o.status === 'processing').length;
  const readyLoadCount = orders.filter(o => o.status === 'ready').length;

  const roleBadgeColor: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-800 border-purple-200',
    dispatcher: 'bg-orange-100 text-orange-800 border-orange-200',
    preparer: 'bg-blue-100 text-blue-800 border-blue-200',
    loader: 'bg-amber-100 text-amber-800 border-amber-200',
    driver: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    store_sales: 'bg-teal-100 text-teal-800 border-teal-200',
    karey_inventory: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    inventory: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    company: 'bg-sky-100 text-sky-800 border-sky-200',
    client: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  const roleLabel: Record<string, string> = {
    admin: 'Administrador',
    dispatcher: 'Despacho y Rutas',
    preparer: 'Preparación',
    loader: 'Cargador Andén',
    driver: 'Repartidor / Chofer',
    store_sales: 'Caja / Tienda',
    karey_inventory: 'Inv. Jabas Karey',
    inventory: 'Inventarios',
    company: 'Cliente Empresa',
    client: 'Cliente',
  };

  return (
    <aside 
      id="desktop-sidebar-navigation"
      aria-label="Navegación principal de escritorio"
      className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-slate-900 text-slate-200 z-50 shadow-2xl border-r border-slate-800 select-none"
    >
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center gap-3">
        <KLogo size="w-10 h-10 text-xl" logoUrl={settings?.logoUrl} />
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-black text-white truncate tracking-tight">
            {settings?.appName || 'Karey Alimentos'}
          </h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Gestión & Logística
          </p>
        </div>
      </div>

      {/* User Card */}
      {profile && (
        <div className="p-4 mx-3 my-3 bg-slate-800/80 rounded-2xl border border-slate-700/60 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center font-black text-blue-400 shrink-0">
            {(profile.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate">{profile.name || 'Usuario'}</p>
            <span className={cn(
              "inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-md border mt-0.5",
              roleBadgeColor[effectiveRole] || 'bg-slate-700 text-slate-300 border-slate-600'
            )}>
              {roleLabel[effectiveRole] || effectiveRole}
            </span>
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-2 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-3 py-1">
          Menú de Navegación
        </p>

        {effectiveRole === 'admin' ? (
          <div className="space-y-4">
            {/* 1. Panel Principal */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-3 mb-1">
                1. Panel de Mando
              </p>
              <SidebarItem
                active={currentPage === 'admin-dashboard'}
                icon={ShieldCheck}
                label="Panel Principal"
                onClick={() => setCurrentPage('admin-dashboard')}
              />
            </div>

            {/* 2. Operaciones & Logística */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-400/80 px-3 mb-1">
                2. Operaciones & Logística
              </p>
              <SidebarItem
                active={currentPage === 'admin-units'}
                icon={Truck}
                label="Unidades y Camiones"
                onClick={() => setCurrentPage('admin-units')}
              />
              <SidebarItem
                active={currentPage === 'karey-dashboard' || currentPage === 'karey-movement' || currentPage === 'karey-return' || currentPage === 'karey-transfer' || currentPage === 'karey-balances'}
                icon={Box}
                label="Control Jabas Karey"
                onClick={() => setCurrentPage('karey-dashboard')}
              />
            </div>

            {/* 3. Catálogo e Inventario */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400/80 px-3 mb-1">
                3. Catálogo e Inventario
              </p>
              <SidebarItem
                active={currentPage === 'admin-inventory-tracking'}
                icon={Package}
                label="Inventario y Stock"
                onClick={() => setCurrentPage('admin-inventory-tracking')}
              />
              <SidebarItem
                active={currentPage === 'admin-categories'}
                icon={Tags}
                label="Categorías"
                onClick={() => setCurrentPage('admin-categories')}
              />
              <SidebarItem
                active={currentPage === 'admin-returns'}
                icon={RotateCcw}
                label="Devoluciones y Mermas"
                onClick={() => setCurrentPage('admin-returns')}
              />
            </div>

            {/* 4. Personal y Clientes */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-purple-400/80 px-3 mb-1">
                4. Personal y Clientes
              </p>
              <SidebarItem
                active={currentPage === 'admin-users'}
                icon={Users}
                label="Usuarios y Roles"
                onClick={() => setCurrentPage('admin-users')}
              />
            </div>

            {/* 5. Administración y Auditoría */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-400/80 px-3 mb-1">
                5. Administración & Control
              </p>
              <SidebarItem
                active={currentPage === 'admin-activity'}
                icon={Activity}
                label="Auditoría y Actividad"
                onClick={() => setCurrentPage('admin-activity')}
              />
              <SidebarItem
                active={currentPage === 'admin-settings'}
                icon={Settings}
                label="Configuración del Negocio"
                onClick={() => setCurrentPage('admin-settings')}
              />
            </div>
          </div>
        ) : effectiveRole === 'dispatcher' ? (
          <>
            <SidebarItem
              active={currentPage === 'dispatcher-view'}
              icon={Package}
              label="Despacho de Rutas"
              badge={activeOrdersCount > 0 ? activeOrdersCount : undefined}
              onClick={() => setCurrentPage('dispatcher-view')}
            />
            <SidebarItem
              active={currentPage === 'dispatcher-history'}
              icon={History}
              label="Historial de Despacho"
              onClick={() => setCurrentPage('dispatcher-history')}
            />
          </>
        ) : effectiveRole === 'karey_inventory' ? (
          <>
            <SidebarItem
              active={currentPage === 'karey-dashboard'}
              icon={Box}
              label="Panel de Jabas"
              onClick={() => setCurrentPage('karey-dashboard')}
            />
            <SidebarItem
              active={currentPage === 'karey-movement'}
              icon={Truck}
              label="Registro Salida / Carga"
              onClick={() => setCurrentPage('karey-movement')}
            />
            <SidebarItem
              active={currentPage === 'karey-return'}
              icon={RotateCcw}
              label="Recepción y Cierre"
              onClick={() => setCurrentPage('karey-return')}
            />
            <SidebarItem
              active={currentPage === 'karey-transfer'}
              icon={Layers}
              label="Traspaso entre Unidades"
              onClick={() => setCurrentPage('karey-transfer')}
            />
            <SidebarItem
              active={currentPage === 'karey-balances'}
              icon={Users}
              label="Adeudos y Choferes"
              onClick={() => setCurrentPage('karey-balances')}
            />
          </>
        ) : effectiveRole === 'inventory' ? (
          <>
            <SidebarItem
              active={currentPage === 'admin-inventory-tracking'}
              icon={Package}
              label="Seguimiento de Stock"
              onClick={() => setCurrentPage('admin-inventory-tracking')}
            />
          </>
        ) : effectiveRole === 'preparer' ? (
          <>
            <SidebarItem
              active={currentPage === 'preparer-view'}
              icon={ClipboardList}
              label="Mesa de Preparación"
              badge={pendingPrepCount > 0 ? pendingPrepCount : undefined}
              onClick={() => setCurrentPage('preparer-view')}
            />
            <SidebarItem
              active={currentPage === 'preparer-history'}
              icon={History}
              label="Historial de Preparados"
              onClick={() => setCurrentPage('preparer-history')}
            />
          </>
        ) : effectiveRole === 'loader' ? (
          <>
            <SidebarItem
              active={currentPage === 'loader-view'}
              icon={Package}
              label="Andén de Carga"
              badge={readyLoadCount > 0 ? readyLoadCount : undefined}
              onClick={() => setCurrentPage('loader-view')}
            />
            <SidebarItem
              active={currentPage === 'loader-history'}
              icon={History}
              label="Historial de Carga"
              onClick={() => setCurrentPage('loader-history')}
            />
          </>
        ) : effectiveRole === 'driver' ? (
          <>
            <SidebarItem
              active={currentPage === 'driver-view'}
              icon={MapPin}
              label="Mi Ruta Asignada"
              onClick={() => setCurrentPage('driver-view')}
            />
            <SidebarItem
              active={currentPage === 'driver-history'}
              icon={History}
              label="Historial de Entregas"
              onClick={() => setCurrentPage('driver-history')}
            />
          </>
        ) : effectiveRole === 'store_sales' ? (
          <>
            <SidebarItem
              active={currentPage === 'home'}
              icon={HomeIcon}
              label="Catálogo de Productos"
              onClick={() => setCurrentPage('home')}
            />
            <SidebarItem
              active={currentPage === 'store-sales-view'}
              icon={CreditCard}
              label="Caja y Ventas Tienda"
              onClick={() => setCurrentPage('store-sales-view')}
            />
          </>
        ) : (
          <>
            <SidebarItem
              active={currentPage === 'home'}
              icon={HomeIcon}
              label="Catálogo de Productos"
              onClick={() => setCurrentPage('home')}
            />
            <SidebarItem
              active={currentPage === 'current-order'}
              icon={ClipboardList}
              label="Mi Pedido Activo"
              badge={activeOrdersCount > 0 ? activeOrdersCount : undefined}
              onClick={() => setCurrentPage('current-order')}
            />
            <SidebarItem
              active={currentPage === 'history'}
              icon={History}
              label="Historial de Compras"
              onClick={() => setCurrentPage('history')}
            />
          </>
        )}

        <div className="pt-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-3 py-1">
            Cuenta
          </p>
          <SidebarItem
            active={currentPage === 'admin-notifications'}
            icon={Bell}
            label="Notificaciones"
            badge={unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined}
            onClick={() => setCurrentPage('admin-notifications')}
          />
          <SidebarItem
            active={currentPage === 'profile'}
            icon={UserIcon}
            label="Mi Perfil"
            onClick={() => setCurrentPage('profile')}
          />
        </div>

        {/* Role Switcher for Admin */}
        {profile?.role === 'admin' && (
          <div className="pt-4 px-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 px-1">
              Simulador de Rol
            </p>
            <select 
              className="w-full text-xs font-bold bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              value={profile.viewAs || 'admin'}
              onChange={(e) => {
                const newView = e.target.value as any;
                const updated = { ...profile, viewAs: newView };
                localStorage.setItem('viewAs', newView);
                setProfile(updated);
              }}
            >
              <option value="admin">Admin (Completo)</option>
              <option value="client">Cliente</option>
              <option value="company">Empresa</option>
              <option value="dispatcher">Despacho</option>
              <option value="preparer">Preparación</option>
              <option value="loader">Cargador</option>
              <option value="store_sales">Cajero / Tienda</option>
              <option value="driver">Repartidor</option>
              <option value="inventory">Inventarios</option>
              <option value="karey_inventory">Jabas Karey</option>
            </select>
          </div>
        )}
      </div>

      {/* Footer / Logout */}
      {onLogout && (
        <div className="p-3 border-t border-slate-800">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      )}
    </aside>
  );
}

function SidebarItem({
  active,
  icon: Icon,
  label,
  badge,
  onClick
}: {
  active: boolean;
  icon: React.ElementType;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left",
        active 
          ? "bg-blue-600 text-white shadow-md shadow-blue-900/30" 
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon className={cn("w-4 h-4 shrink-0", active ? "text-white" : "text-slate-400")} />
        <span className="truncate">{label}</span>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className={cn(
          "text-[10px] font-black px-1.5 py-0.2 rounded-full",
          active ? "bg-white text-blue-700" : "bg-red-500 text-white"
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}
