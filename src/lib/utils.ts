import { Order } from '../types';
import { getOSRMRoute, calculateStraightDistance } from './osm';

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  return calculateStraightDistance(lat1, lon1, lat2, lon2);
}

export function getDeliveryFee(roadDistance: number) {
  if (roadDistance <= 3) return 30;
  if (roadDistance <= 5) return 45;
  if (roadDistance <= 7) return 60;
  if (roadDistance <= 9) return 75;
  if (roadDistance <= 11) return 95;
  if (roadDistance <= 13) return 115;
  if (roadDistance <= 15) return 140;
  return 180;
}

export const calculateRoadDistance = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<{ distance: number; fee: number }> => {
  try {
    const route = await getOSRMRoute(origin, destination);
    return {
      distance: route.distanceKm,
      fee: getDeliveryFee(route.distanceKm)
    };
  } catch {
    const d = calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng);
    const estDistance = Math.max(0.5, Number((d * 1.35).toFixed(1)));
    return { distance: estDistance, fee: getDeliveryFee(estDistance) };
  }
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

export const compressImage = (file: File, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const compressImageToBlob = (file: File, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', quality);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const transformImageUrl = (url: string): string => {
  if (!url) return url;
  
  // Google Drive
  const driveMatch = url.match(/\/(?:file\/d\/|open\?id=)([\w-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }
  
  // Dropbox
  if (url.includes('dropbox.com') && url.includes('dl=0')) {
    return url.replace('dl=0', 'raw=1');
  }

  return url;
};

/**
 * Sorts orders prioritizing:
 * 1. Delivery Date (earliest first)
 * 2. Scheduled Time Window (explicit early deadlines take precedence over unscheduled orders)
 * 3. Smaller/Tighter Delivery Window & Earliest Deadline
 * 4. Shortest Route Distance (closest client first)
 * 5. Fallback by creation timestamp
 */
export function sortOrdersByWindowAndDistance(
  orders: Order[],
  referenceLocation?: { lat: number; lng: number }
): Order[] {
  const calculateDist = (loc?: { lat: number; lng: number }): number => {
    if (!referenceLocation || !loc || !loc.lat || !loc.lng) return 5.0;
    const R = 6371; // Earth radius in km
    const dLat = (loc.lat - referenceLocation.lat) * (Math.PI / 180);
    const dLon = (loc.lng - referenceLocation.lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(referenceLocation.lat * (Math.PI / 180)) *
        Math.cos(loc.lat * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  };

  return [...orders].sort((a, b) => {
    // 1. Extract delivery dates (YYYY-MM-DD)
    const getDate = (o: Order): string => {
      if (o.deliverySlot) {
        const match = o.deliverySlot.match(/\d{4}-\d{2}-\d{2}/);
        if (match) return match[0];
      }
      if (o.createdAt?.seconds) {
        return new Date(o.createdAt.seconds * 1000).toISOString().split('T')[0];
      }
      return '9999-12-31';
    };

    const dateA = getDate(a);
    const dateB = getDate(b);

    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }

    // 2. Extract delivery window start and end in minutes from midnight (00:00)
    // Orders with no window default to late in the day (18:00 / 1080 min) so explicitly scheduled morning orders come first.
    const parseTime = (timeStr?: string, defaultMin: number = 1080): number => {
      if (timeStr && timeStr.includes(':')) {
        const [h, m] = timeStr.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
      }
      return defaultMin;
    };

    const hasExplicitWindowA = Boolean(a.deliveryWindowStart);
    const hasExplicitWindowB = Boolean(b.deliveryWindowStart);

    const startA = parseTime(a.deliveryWindowStart, 1080);
    const endA = parseTime(a.deliveryWindowEnd, startA + 120);
    const windowSpanA = hasExplicitWindowA ? Math.max(15, endA - startA) : 360;

    const startB = parseTime(b.deliveryWindowStart, 1080);
    const endB = parseTime(b.deliveryWindowEnd, startB + 120);
    const windowSpanB = hasExplicitWindowB ? Math.max(15, endB - startB) : 360;

    const distA = typeof a.deliveryDistance === 'number' && !isNaN(a.deliveryDistance)
      ? a.deliveryDistance
      : calculateDist(a.location);
    const distB = typeof b.deliveryDistance === 'number' && !isNaN(b.deliveryDistance)
      ? b.deliveryDistance
      : calculateDist(b.location);

    // 3. Composite Urgency Index:
    // - Hora límite de entrega (endMinutes): peso principal
    // - Amplitud de la ventana (windowSpan): menor ventana tiene prioridad
    // - Distancia (distanceKm): menor distancia tiene prioridad
    const scoreA = endA + (windowSpanA * 0.35) + (distA * 2.5);
    const scoreB = endB + (windowSpanB * 0.35) + (distB * 2.5);

    if (Math.abs(scoreA - scoreB) > 0.5) {
      return scoreA - scoreB;
    }

    // Tie-breaker 1: Deadline más próximo
    if (endA !== endB) {
      return endA - endB;
    }

    // Tie-breaker 2: Menor ventana de entrega (más ajustada)
    if (windowSpanA !== windowSpanB) {
      return windowSpanA - windowSpanB;
    }

    // Tie-breaker 3: Menor distancia por recorrer
    if (Math.abs(distA - distB) > 0.05) {
      return distA - distB;
    }

    // Tie-breaker 4: Creación (antigüedad)
    const createdA = a.createdAt?.seconds || 0;
    const createdB = b.createdAt?.seconds || 0;
    return createdA - createdB;
  });
}

