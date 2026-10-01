import { AppSettings } from '../types';

export interface TenantConfig {
  /** Commercial name of the company or store */
  name: string;
  /** Short abbreviation or commercial brand label */
  shortName: string;
  /** Subtitle or slogan displayed across headers and footers */
  tagline: string;
  /** Legal business identifier (e.g. RFC, CIF, Tax ID) */
  taxId?: string;
  /** Direct contact and dispatch center channels */
  contact: {
    phone: string;
    whatsapp?: string;
    email: string;
    supportHours: string;
  };
  /** Localization and currency display defaults */
  localization: {
    currencySymbol: string;
    currencyCode: string;
    locale: string;
    timezone: string;
  };
  /** Default distribution center / headquarters coordinates */
  defaultLocation: {
    address: string;
    lat: number;
    lng: number;
    colonia?: string;
    city: string;
    state: string;
    country: string;
  };
  /** Visual branding themes */
  branding: {
    logoUrl?: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    deliveryBannerText?: string;
  };
  /** Operational features and validation limits */
  operations: {
    minOrderAmount: number;
    defaultDeliveryFee: number;
    freeDeliveryThreshold?: number;
    allowCustomerSelfPickup: boolean;
    requireWeightVerification: boolean;
    enableJabaOptimization: boolean;
    enableReturnRequests: boolean;
  };
}

/**
 * Baseline default white-label configuration.
 * Can be overridden in real-time via the Admin Settings view (stored in Firestore `appSettings/general`).
 */
export const DEFAULT_TENANT_CONFIG: TenantConfig = {
  name: 'Karey Alimentos',
  shortName: 'Karey Alimentos',
  tagline: 'Gestión integral de pedidos, inventario y logística de envíos',
  taxId: 'KAL-260822-001',
  contact: {
    phone: '+52 (669) 980-0000',
    whatsapp: '+526699800000',
    email: 'contacto@kareyalimentos.com',
    supportHours: 'Lun a Sáb 7:00 AM - 6:00 PM',
  },
  localization: {
    currencySymbol: '$',
    currencyCode: 'MXN',
    locale: 'es-MX',
    timezone: 'America/Mazatlan',
  },
  defaultLocation: {
    address: 'Av. Del Rastro #402, Parque Industrial',
    lat: 23.2312,
    lng: -106.4154,
    colonia: 'Parque Industrial',
    city: 'Mazatlán',
    state: 'Sinaloa',
    country: 'México',
  },
  branding: {
    logoUrl: '',
    primaryColor: '#001f3f', // Navy
    secondaryColor: '#059669', // Emerald Green
    accentColor: '#2563eb', // Blue
    deliveryBannerText: '🚚 Envíos programados a domicilio y recolección en sucursal',
  },
  operations: {
    minOrderAmount: 0,
    defaultDeliveryFee: 50,
    freeDeliveryThreshold: 1500,
    allowCustomerSelfPickup: true,
    requireWeightVerification: true,
    enableJabaOptimization: true,
    enableReturnRequests: true,
  },
};

/**
 * Resolves active tenant config combining default fallback with dynamic Firestore AppSettings.
 */
export function resolveTenantConfig(settings?: AppSettings | null): TenantConfig {
  if (!settings) return DEFAULT_TENANT_CONFIG;

  return {
    ...DEFAULT_TENANT_CONFIG,
    name: settings.appName?.trim() || DEFAULT_TENANT_CONFIG.name,
    shortName: settings.appName?.trim() ? settings.appName.split(' ')[0] : DEFAULT_TENANT_CONFIG.shortName,
    branding: {
      ...DEFAULT_TENANT_CONFIG.branding,
      logoUrl: settings.logoUrl || DEFAULT_TENANT_CONFIG.branding.logoUrl,
    },
    defaultLocation: {
      ...DEFAULT_TENANT_CONFIG.defaultLocation,
      address: settings.shopAddress || DEFAULT_TENANT_CONFIG.defaultLocation.address,
      lat: typeof settings.shopLat === 'number' && !isNaN(settings.shopLat) 
        ? settings.shopLat 
        : DEFAULT_TENANT_CONFIG.defaultLocation.lat,
      lng: typeof settings.shopLng === 'number' && !isNaN(settings.shopLng) 
        ? settings.shopLng 
        : DEFAULT_TENANT_CONFIG.defaultLocation.lng,
    },
  };
}

/**
 * Formats monetary amounts using tenant currency standards.
 */
export function formatCurrency(amount: number, config: TenantConfig = DEFAULT_TENANT_CONFIG): string {
  return new Intl.NumberFormat(config.localization.locale, {
    style: 'currency',
    currency: config.localization.currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
