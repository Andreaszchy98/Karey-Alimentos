import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Base pin icons styled with SVG data URIs
const createCustomIcon = (color: string, label: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="28" height="36">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
    <circle cx="12" cy="11" r="5" fill="#ffffff"/>
    <text x="12" y="14" font-size="7" font-weight="bold" fill="${color}" text-anchor="middle">${label}</text>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: 'custom-leaflet-marker',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -32],
  });
};

const storeIcon = createCustomIcon('#16a34a', '🏠');
const customerIcon = createCustomIcon('#2563eb', '📍');

interface OSMMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  shopLocation?: { lat: number; lng: number; address?: string };
  customerLocation?: { lat: number; lng: number };
  routeCoordinates?: [number, number][];
  onMapClick?: (pos: { lat: number; lng: number }) => void;
  onMarkerDragEnd?: (pos: { lat: number; lng: number }) => void;
  isDraggable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const OSMMap: React.FC<OSMMapProps> = ({
  center,
  zoom = 15,
  shopLocation,
  customerLocation,
  routeCoordinates,
  onMapClick,
  onMarkerDragEnd,
  isDraggable = true,
  className = 'w-full h-full min-h-[220px]',
  style,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const shopMarkerRef = useRef<L.Marker | null>(null);
  const customerMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [center.lat, center.lng],
        zoom: zoom,
        zoomControl: true,
        attributionControl: false,
      });

      // Add high quality OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      mapInstanceRef.current = map;

      // Handle map click
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (onMapClick) {
          onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update map click handler
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.off('click');
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClick) {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });
  }, [onMapClick]);

  // Update center
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (!routeCoordinates || routeCoordinates.length === 0) {
      mapInstanceRef.current.setView([center.lat, center.lng], zoom);
    }
  }, [center.lat, center.lng, zoom]);

  // Update shop marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (shopLocation) {
      if (!shopMarkerRef.current) {
        shopMarkerRef.current = L.marker([shopLocation.lat, shopLocation.lng], {
          icon: storeIcon,
        }).addTo(map);
        if (shopLocation.address) {
          shopMarkerRef.current.bindPopup(`<b>Establecimiento</b><br>${shopLocation.address}`);
        }
      } else {
        shopMarkerRef.current.setLatLng([shopLocation.lat, shopLocation.lng]);
      }
    } else if (shopMarkerRef.current) {
      shopMarkerRef.current.remove();
      shopMarkerRef.current = null;
    }
  }, [shopLocation?.lat, shopLocation?.lng, shopLocation?.address]);

  // Update customer marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (customerLocation) {
      if (!customerMarkerRef.current) {
        const marker = L.marker([customerLocation.lat, customerLocation.lng], {
          icon: customerIcon,
          draggable: isDraggable,
        }).addTo(map);

        marker.on('dragend', (e: L.DragEndEvent) => {
          const newPos = e.target.getLatLng();
          if (onMarkerDragEnd) {
            onMarkerDragEnd({ lat: newPos.lat, lng: newPos.lng });
          }
        });

        customerMarkerRef.current = marker;
      } else {
        customerMarkerRef.current.setLatLng([customerLocation.lat, customerLocation.lng]);
        if (customerMarkerRef.current.dragging) {
          if (isDraggable) customerMarkerRef.current.dragging.enable();
          else customerMarkerRef.current.dragging.disable();
        }
      }
    } else if (customerMarkerRef.current) {
      customerMarkerRef.current.remove();
      customerMarkerRef.current = null;
    }
  }, [customerLocation?.lat, customerLocation?.lng, isDraggable, onMarkerDragEnd]);

  // Update route polyline & fit bounds
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeCoordinates && routeCoordinates.length > 1) {
      if (!routePolylineRef.current) {
        routePolylineRef.current = L.polyline(routeCoordinates, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.85,
          lineJoin: 'round',
        }).addTo(map);
      } else {
        routePolylineRef.current.setLatLngs(routeCoordinates);
      }

      try {
        const bounds = L.latLngBounds(routeCoordinates);
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
      } catch {
        // Safe fallback
      }
    } else if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }
  }, [routeCoordinates]);

  return (
    <div
      ref={mapContainerRef}
      className={className}
      style={{ zIndex: 1, ...style }}
    />
  );
};
