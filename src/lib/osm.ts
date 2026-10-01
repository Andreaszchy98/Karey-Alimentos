// OpenStreetMap, Nominatim & OSRM Services (100% Free & Open Source)

export interface OSMAddressDetails {
  road?: string;
  street?: string;
  avenue?: string;
  boulevard?: string;
  highway?: string;
  pedestrian?: string;
  footway?: string;
  path?: string;
  cycleway?: string;
  living_street?: string;
  service?: string;
  square?: string;
  plaza?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  residential?: string;
  district?: string;
  city_district?: string;
  city?: string;
  town?: string;
  municipality?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export interface ReverseGeocodeResult {
  street: string;
  houseNumber: string;
  colonia: string;
  city: string;
  formattedAddress: string;
}

export interface OSMPlace {
  place_id: number | string;
  osm_id: number | string;
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  address?: OSMAddressDetails;
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  coordinates: [number, number][]; // [lat, lng] array for polyline
}

export function isCoordinateString(str?: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  // Matches coordinate patterns like "23.2422, -106.4024", "(23.24, -106.40)", "-106.4024", "23.2422"
  if (/^(?:ubicaci[oó]n\s*)?\(?-?\d{1,3}(?:\.\d+)?(?:[\s,]+-?\d{1,3}(?:\.\d+)?)*\)?$/i.test(trimmed)) return true;
  if (/^-?\d+\.\d+$/.test(trimmed)) return true;
  if (/^\d{5}$/.test(trimmed)) return true; // postal code alone
  return false;
}

function cleanStreetName(name: string): string {
  if (!name || isCoordinateString(name)) return '';
  // Remove trailing postal code or coordinates if any
  return name.replace(/,\s*\d{5}.*$/, '').trim();
}

function extractStreetFromAddress(addr?: OSMAddressDetails, displayName?: string): string {
  if (addr) {
    const candidates = [
      addr.road,
      addr.street,
      addr.avenue,
      addr.boulevard,
      addr.highway,
      addr.pedestrian,
      addr.footway,
      addr.path,
      addr.cycleway,
      addr.living_street,
      addr.service,
      addr.square,
      addr.plaza,
    ];
    for (const c of candidates) {
      if (c && typeof c === 'string' && c.trim().length > 0 && !isCoordinateString(c)) {
        return cleanStreetName(c);
      }
    }
  }

  if (displayName) {
    const first = displayName.split(',')[0]?.trim();
    if (first && !isCoordinateString(first) && !/^\d+$/.test(first) && !/^\d{5}$/.test(first)) {
      return cleanStreetName(first);
    }
  }
  return '';
}

function extractColoniaFromAddress(addr?: OSMAddressDetails): string {
  if (!addr) return '';
  return (
    addr.neighbourhood ||
    addr.suburb ||
    addr.quarter ||
    addr.residential ||
    addr.district ||
    addr.city_district ||
    ''
  ).trim();
}

// Extensive curated catalog of Mazatlán colonias, fraccionamientos, and major avenues for instant zero-latency suggestions and offline fallback
const LOCAL_MAZATLAN_PLACES: { street: string; colonia: string; lat: number; lng: number }[] = [
  { street: 'Av. del Mar', colonia: 'Palos Prietos', lat: 23.2325, lng: -106.4250 },
  { street: 'Av. Rafael Buelna', colonia: 'Lomas de Mazatlán', lat: 23.2501, lng: -106.4385 },
  { street: 'Av. Ejército Mexicano', colonia: 'Palos Prietos', lat: 23.2340, lng: -106.4150 },
  { street: 'Av. Insurgentes', colonia: 'Juárez', lat: 23.2395, lng: -106.4190 },
  { street: 'Av. Manuel J. Clouthier', colonia: 'Flores Magón', lat: 23.2580, lng: -106.3980 },
  { street: 'Av. Camarón Sábalo', colonia: 'Zona Dorada', lat: 23.2450, lng: -106.4490 },
  { street: 'Av. Gabriel Leyva', colonia: 'Centro / Montuosa', lat: 23.2180, lng: -106.4120 },
  { street: 'Av. Juan Carrasco', colonia: 'Centro', lat: 23.2105, lng: -106.4215 },
  { street: 'Calle Melchor Ocampo', colonia: 'Centro', lat: 23.2085, lng: -106.4230 },
  { street: 'Calle Benito Juárez', colonia: 'Centro', lat: 23.2045, lng: -106.4210 },
  { street: 'Av. Zaragoza', colonia: 'Centro', lat: 23.2070, lng: -106.4190 },
  { street: 'Calle Aquiles Serdán', colonia: 'Centro', lat: 23.2055, lng: -106.4225 },
  { street: 'Av. Playa Gaviotas', colonia: 'Zona Dorada', lat: 23.2430, lng: -106.4470 },
  { street: 'Av. Paseo Claussen', colonia: 'Olas Altas', lat: 23.2030, lng: -106.4280 },
  { street: 'Av. Olas Altas', colonia: 'Centro Histórico', lat: 23.1970, lng: -106.4270 },
  { street: 'Av. Bicentenario Juárez', colonia: 'Francisco Villa', lat: 23.2620, lng: -106.4020 },
  { street: 'Calle Toma de Torreón', colonia: 'Francisco Villa', lat: 23.2422, lng: -106.4024 },
  { street: 'Av. Santa Rosa', colonia: 'Jaripillo', lat: 23.2680, lng: -106.4120 },
  { street: 'Av. La Marina', colonia: 'Marina Mazatlán', lat: 23.2750, lng: -106.4560 },
  { street: 'Av. Ernesto Coppel Campaña', colonia: 'Nuevo Mazatlán', lat: 23.3100, lng: -106.4850 },
  { street: 'Av. Paseo Lomas', colonia: 'Lomas de Mazatlán', lat: 23.2480, lng: -106.4410 },
  { street: 'Av. Internacional México 15', colonia: 'Urías', lat: 23.2100, lng: -106.3750 },
  { street: 'Av. De las Torres', colonia: 'Flores Magón', lat: 23.2540, lng: -106.3950 },
  { street: 'Av. Real del Valle', colonia: 'Real del Valle', lat: 23.2820, lng: -106.4290 },
  { street: 'Av. Prados del Sol', colonia: 'Prados del Sol', lat: 23.2690, lng: -106.4050 },
  { street: 'Av. Delfín', colonia: 'Chulavista', lat: 23.2840, lng: -106.4480 },
  { street: 'Calle Sonora', colonia: 'Benito Juárez', lat: 23.2260, lng: -106.4090 },
  { street: 'Calle 13 de Abril', colonia: 'Benito Juárez', lat: 23.2275, lng: -106.4060 },
  { street: 'Calle 20 de Noviembre', colonia: 'Benito Juárez', lat: 23.2250, lng: -106.4070 },
  { street: 'Calle Gutiérrez Nájera', colonia: 'Reforma', lat: 23.2150, lng: -106.4220 },
  { street: 'Av. Pino Suárez', colonia: 'Montuosa', lat: 23.2190, lng: -106.4180 },
  { street: 'Av. Atlántico', colonia: 'Real Pacífico', lat: 23.2870, lng: -106.4350 },
  { street: 'Av. Paseo del Atlántico', colonia: 'La Marina', lat: 23.2810, lng: -106.4480 },
  { street: 'Av. Munich', colonia: 'Jaripillo', lat: 23.2710, lng: -106.4080 },
  { street: 'Calle Río Piaxtla', colonia: 'Palos Prietos', lat: 23.2310, lng: -106.4210 },
  { street: 'Calle Río Baluarte', colonia: 'Palos Prietos', lat: 23.2330, lng: -106.4230 },
  { street: 'Av. Cruz Lizárraga', colonia: 'Palos Prietos', lat: 23.2350, lng: -106.4260 },
  { street: 'Av. Revolución', colonia: 'Sánchez Celis', lat: 23.2420, lng: -106.4290 },
  { street: 'Calle Sinaloa', colonia: 'Alameda', lat: 23.2400, lng: -106.4270 },
  { street: 'Av. Jabalíes', colonia: 'Jabalíes', lat: 23.2610, lng: -106.4100 },
  { street: 'Calle Venustiano Carranza', colonia: 'Centro', lat: 23.2010, lng: -106.4240 },
  { street: 'Calle Carnaval', colonia: 'Centro Histórico', lat: 23.1990, lng: -106.4250 },
  { street: 'Calle Sixto Osuna', colonia: 'Centro Histórico', lat: 23.1980, lng: -106.4260 },
  { street: 'Av. Gabriel Leyva Solano', colonia: 'Obrero Mundial', lat: 23.2120, lng: -106.4050 },
  { street: 'Av. Libramiento 2', colonia: 'Villa Verde', lat: 23.2740, lng: -106.3950 },
  { street: 'Av. Luis Donaldo Colosio', colonia: 'Rincón de Urías', lat: 23.2200, lng: -106.3800 },
  { street: 'Av. Manuel Gómez Morín', colonia: 'Montebello', lat: 23.2650, lng: -106.4200 },
  { street: 'Calle Francisco Solís', colonia: 'Francisco Villa', lat: 23.2450, lng: -106.4050 },
  { street: 'Calle Batalla del Roble', colonia: 'Francisco Villa', lat: 23.2435, lng: -106.4015 }
];

/**
 * Searches places via Nominatim OpenStreetMap API + Photon + Local Catalog Fallback
 */
export async function searchOSMPlaces(query: string, cityBias: string = 'Mazatlán'): Promise<OSMPlace[]> {
  if (!query || query.trim().length < 2) return [];
  const rawQuery = query.trim();

  // Strip house numbers or prefix noise for broader match
  const cleanQuery = rawQuery
    .replace(/[#№]/g, '')
    .replace(/\b(?:int|interior|depto|piso|casa|edif|edificio|ref|referencia)\b.*$/i, '')
    .trim();

  const results: OSMPlace[] = [];
  const seenPlaceIds = new Set<string>();

  const addResult = (p: OSMPlace) => {
    const key = `${p.lat}_${p.lon}_${p.display_name.slice(0, 30)}`;
    if (!seenPlaceIds.has(key)) {
      seenPlaceIds.add(key);
      results.push(p);
    }
  };

  // 1. Nominatim search with query + city bias
  try {
    const searchTerms = [
      cityBias && !cleanQuery.toLowerCase().includes(cityBias.toLowerCase()) ? `${cleanQuery}, ${cityBias}` : cleanQuery,
      cleanQuery
    ];

    for (const term of searchTerms) {
      if (results.length >= 6) break;
      const params = new URLSearchParams({
        q: term,
        format: 'json',
        addressdetails: '1',
        limit: '6',
        countrycodes: 'mx',
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { 'Accept-Language': 'es' },
      });
      if (res.ok) {
        const data: OSMPlace[] = await res.json();
        if (Array.isArray(data)) {
          data.forEach(addResult);
        }
      }
    }
  } catch (err) {
    console.warn('Nominatim search notice:', err);
  }

  // 2. Photon geocoder fallback (OpenStreetMap data, typo-tolerant)
  if (results.length < 3) {
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&lat=23.24&lon=-106.41&limit=6&lang=es`;
      const pRes = await fetch(photonUrl);
      if (pRes.ok) {
        const pData = await pRes.json();
        if (pData && Array.isArray(pData.features)) {
          pData.features.forEach((feat: any, idx: number) => {
            const props = feat.properties || {};
            const street = props.street || props.name || cleanQuery;
            const houseNum = props.housenumber || '';
            const col = props.district || props.suburb || props.neighbourhood || '';
            const city = props.city || cityBias;
            const state = props.state || 'Sinaloa';
            const disp = [street, houseNum, col ? `Col. ${col}` : '', city, state].filter(Boolean).join(', ');

            addResult({
              place_id: `photon-${idx}-${props.osm_id || Math.random()}`,
              osm_id: props.osm_id || idx,
              lat: feat.geometry.coordinates[1].toString(),
              lon: feat.geometry.coordinates[0].toString(),
              display_name: disp,
              type: props.osm_value || 'road',
              address: {
                road: street,
                house_number: houseNum,
                suburb: col,
                neighbourhood: col,
                city,
                state,
              }
            });
          });
        }
      }
    } catch (err) {
      console.warn('Photon search notice:', err);
    }
  }

  // 3. Local catalog fallback (matching street or colonia names)
  const queryLower = cleanQuery.toLowerCase();
  const matchedLocal = LOCAL_MAZATLAN_PLACES.filter(
    item => item.street.toLowerCase().includes(queryLower) || item.colonia.toLowerCase().includes(queryLower)
  );

  matchedLocal.slice(0, 5).forEach((item, idx) => {
    addResult({
      place_id: `local-${idx}-${item.street}`,
      osm_id: 1000 + idx,
      lat: item.lat.toString(),
      lon: item.lng.toString(),
      display_name: `${item.street}, Col. ${item.colonia}, ${cityBias}, Sinaloa`,
      type: 'road',
      address: {
        road: item.street,
        neighbourhood: item.colonia,
        suburb: item.colonia,
        city: cityBias,
        state: 'Sinaloa',
      }
    });
  });

  // 4. Always provide an explicit option to use the exact typed address with default city coordinates so km is never 0
  if (cleanQuery.length >= 3) {
    const defaultLat = matchedLocal.length > 0 ? matchedLocal[0].lat : 23.2425;
    const defaultLng = matchedLocal.length > 0 ? matchedLocal[0].lng : -106.4150;
    
    addResult({
      place_id: `custom-entry-${cleanQuery}`,
      osm_id: 99999,
      lat: defaultLat.toString(),
      lon: defaultLng.toString(),
      display_name: `${cleanQuery}, ${cityBias}, Sinaloa (Usar esta dirección)`,
      type: 'user_input',
      address: {
        road: cleanQuery,
        city: cityBias,
        state: 'Sinaloa'
      }
    });
  }

  return results;
}

/**
 * Direct geocoding for a full or partial address string
 */
export async function geocodeOSMAddress(
  query: string,
  cityBias: string = 'Mazatlán'
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  if (!query || query.trim().length < 2) return null;
  const places = await searchOSMPlaces(query, cityBias);
  if (places && places.length > 0) {
    const first = places[0];
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    if (!isNaN(lat) && !isNaN(lng)) {
      return {
        lat,
        lng,
        formattedAddress: first.display_name,
      };
    }
  }
  return null;
}

/**
 * Reverse geocodes coordinates to street address
 */
export async function reverseOSMGeocode(lat: number, lng: number): Promise<string> {
  const details = await reverseOSMDetails(lat, lng);
  if (details.street) {
    let formatted = details.street;
    if (details.houseNumber) formatted += ` #${details.houseNumber}`;
    if (details.colonia) formatted += `, Col. ${details.colonia}`;
    if (details.city) formatted += `, ${details.city}`;
    return formatted;
  }
  return details.formattedAddress || `Mazatlán, Sinaloa`;
}

/**
 * Reverse geocodes coordinates to structured address parts with smart fallback
 */
export async function reverseOSMDetails(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  try {
    // Zoom 18 for building/house level
    const params18 = new URLSearchParams({
      lat: lat.toString(),
      lon: lng.toString(),
      format: 'json',
      addressdetails: '1',
      zoom: '18',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params18.toString()}`, {
      headers: { 'Accept-Language': 'es' },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const addr: OSMAddressDetails = data.address;
        let street = extractStreetFromAddress(addr, data.display_name);
        const houseNumber = addr.house_number || '';
        const colonia = extractColoniaFromAddress(addr);
        const city = addr.city || addr.town || addr.municipality || 'Mazatlán';

        // If zoom 18 didn't find street, snap to street with zoom 16
        if (!street) {
          try {
            const params16 = new URLSearchParams({
              lat: lat.toString(),
              lon: lng.toString(),
              format: 'json',
              addressdetails: '1',
              zoom: '16',
            });
            const res16 = await fetch(`https://nominatim.openstreetmap.org/reverse?${params16.toString()}`, {
              headers: { 'Accept-Language': 'es' },
            });
            if (res16.ok) {
              const data16 = await res16.json();
              if (data16 && data16.address) {
                street = extractStreetFromAddress(data16.address, data16.display_name);
              }
            }
          } catch {
            // ignore
          }
        }

        return {
          street: cleanStreetName(street),
          houseNumber,
          colonia,
          city,
          formattedAddress: data.display_name && !isCoordinateString(data.display_name) 
            ? data.display_name 
            : `${street || 'Ubicación'}${colonia ? `, Col. ${colonia}` : ''}, ${city}`,
        };
      }
    }
  } catch (err) {
    console.warn('OSM reverse geocode fallback:', err);
  }

  // Safe fallback without raw coordinate strings in street
  return {
    street: '',
    houseNumber: '',
    colonia: '',
    city: 'Mazatlán',
    formattedAddress: 'Ubicación seleccionada en mapa',
  };
}

/**
 * Calculates straight line distance (Haversine formula) in km
 */
export function calculateStraightDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Fetches accurate driving route from Open Source Routing Machine (OSRM)
 */
export async function getOSRMRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResult> {
  const straightDist = calculateStraightDistance(origin.lat, origin.lng, destination.lat, destination.lng);
  const estRoadKm = Math.max(0.5, Number((straightDist * 1.35).toFixed(1)));
  const estDurationMin = Math.max(1, Math.round(estRoadKm * 2.2));

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distKm = Number((route.distance / 1000).toFixed(1));
        const durMin = Math.max(1, Math.round(route.duration / 60));
        const coords: [number, number][] = route.geometry.coordinates.map(
          ([lon, lat]: [number, number]) => [lat, lon]
        );
        return {
          distanceKm: distKm,
          durationMin: durMin,
          coordinates: coords,
        };
      }
    }
  } catch (err) {
    console.warn('OSRM routing fallback used:', err);
  }

  // Fallback to straight-line interpolation
  return {
    distanceKm: estRoadKm,
    durationMin: estDurationMin,
    coordinates: [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ],
  };
}

