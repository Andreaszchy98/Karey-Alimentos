import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Loader2, Locate, Navigation, CheckCircle2, X } from 'lucide-react';
import { Input } from '../../components/ui';
import { OSMMap } from '../../components/OSMMap';
import { 
  OSMPlace, 
  RouteResult, 
  getOSRMRoute, 
  reverseOSMDetails, 
  searchOSMPlaces, 
  geocodeOSMAddress, 
  isCoordinateString 
} from '../../lib/osm';

export function AddressPicker({ onSelect, currentAddress, currentCoords, shopLocation }: { 
  onSelect: (addr: string, coords?: { lat: number, lng: number }) => void, 
  currentAddress: string,
  currentCoords?: { lat: number, lng: number },
  shopLocation: { lat: number, lng: number, address: string }
}) {
  const [inputValue, setInputValue] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [colonia, setColonia] = useState('');
  const [interiorOrRef, setInteriorOrRef] = useState('');
  const [suggestions, setSuggestions] = useState<OSMPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [markerPosition, setMarkerPosition] = useState<{ lat: number, lng: number } | undefined>(currentCoords);
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoGeocodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Parse initial address if exists
  useEffect(() => {
    if (currentAddress && !inputValue) {
      let remaining = currentAddress;
      let refPart = '';
      let colPart = '';
      let numPart = '';
      let streetPart = '';

      // Match (Int/Ref: ...)
      const refMatch = remaining.match(/\(Int\/Ref:\s*([^)]+)\)/i);
      if (refMatch) {
        refPart = refMatch[1].trim();
        remaining = remaining.replace(/\(Int\/Ref:\s*[^)]+\)/i, '').trim();
      }

      // Match Col. ...
      const colMatch = remaining.match(/,?\s*Col\.\s*([^,]+)/i);
      if (colMatch) {
        colPart = colMatch[1].trim();
        remaining = remaining.replace(/,?\s*Col\.\s*[^,]+/i, '').trim();
      }

      // Match #number
      const numMatch = remaining.match(/#([0-9a-zA-Z\s-]+)/);
      if (numMatch) {
        numPart = numMatch[1].trim();
        remaining = remaining.replace(/#[0-9a-zA-Z\s-]+/, '').trim();
      }

      streetPart = remaining.replace(/^[,\s]+|[,\s]+$/g, '').trim();

      // Ensure streetPart does not contain raw coordinates
      if (streetPart && !isCoordinateString(streetPart)) {
        setInputValue(streetPart);
      }
      if (numPart) setHouseNumber(numPart);
      if (colPart) setColonia(colPart);
      if (refPart) setInteriorOrRef(refPart);
    }
  }, [currentAddress]);

  const updateRoute = async (dest: { lat: number, lng: number }) => {
    try {
      const res = await getOSRMRoute({ lat: shopLocation.lat, lng: shopLocation.lng }, dest);
      setRouteInfo(res);
    } catch (err) {
      console.warn('Error fetching OSRM route:', err);
    }
  };

  useEffect(() => {
    if (currentCoords) {
      updateRoute(currentCoords);
    }
  }, []);

  const buildFullAddress = (street: string, num: string, col: string, ref: string) => {
    const cleanStreet = (street || '').trim();
    const finalStreet = isCoordinateString(cleanStreet) ? '' : cleanStreet;
    
    let result = finalStreet;
    if (num && num.trim()) {
      result += result ? ` #${num.trim()}` : `#${num.trim()}`;
    }
    if (col && col.trim()) {
      result += result ? `, Col. ${col.trim()}` : `Col. ${col.trim()}`;
    }
    if (ref && ref.trim()) {
      result += result ? ` (Int/Ref: ${ref.trim()})` : `(Int/Ref: ${ref.trim()})`;
    }
    return result.trim();
  };

  // Background auto-geocode when user finishes typing a street or colonia
  const triggerAutoGeocode = (streetText: string, colText: string) => {
    if (autoGeocodeTimeoutRef.current) clearTimeout(autoGeocodeTimeoutRef.current);
    const query = `${streetText} ${colText}`.trim();
    if (!query || query.length < 3) return;

    autoGeocodeTimeoutRef.current = setTimeout(async () => {
      const found = await geocodeOSMAddress(query);
      if (found) {
        const pos = { lat: found.lat, lng: found.lng };
        setMarkerPosition(pos);
        updateRoute(pos);
        const full = buildFullAddress(streetText, houseNumber, colText, interiorOrRef);
        onSelect(full, pos);
      }
    }, 700);
  };

  const handleInputChange = (text: string) => {
    setInputValue(text);
    const full = buildFullAddress(text, houseNumber, colonia, interiorOrRef);
    onSelect(full, markerPosition);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!text || text.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchOSMPlaces(text);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setIsSearching(false);
    }, 300);

    triggerAutoGeocode(text, colonia);
  };

  const handleHouseNumberChange = (num: string) => {
    setHouseNumber(num);
    const full = buildFullAddress(inputValue, num, colonia, interiorOrRef);
    onSelect(full, markerPosition);
  };

  const handleColoniaChange = (col: string) => {
    setColonia(col);
    const full = buildFullAddress(inputValue, houseNumber, col, interiorOrRef);
    onSelect(full, markerPosition);
    triggerAutoGeocode(inputValue, col);
  };

  const handleInteriorOrRefChange = (ref: string) => {
    setInteriorOrRef(ref);
    const full = buildFullAddress(inputValue, houseNumber, colonia, ref);
    onSelect(full, markerPosition);
  };

  const handleSelectPlace = (place: OSMPlace) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    const pos = { lat, lng };

    // Extract pure street name without coordinates
    let streetName = place.address?.road || place.address?.street || place.display_name.split(',')[0].trim();
    if (isCoordinateString(streetName)) {
      streetName = '';
    }
    const detectedNumber = place.address?.house_number || '';
    const detectedColonia = place.address?.neighbourhood || place.address?.suburb || place.address?.quarter || place.address?.residential || '';

    if (streetName) {
      setInputValue(streetName);
    }
    if (detectedNumber && !houseNumber) {
      setHouseNumber(detectedNumber);
    }
    
    // Automatically update colonia to match newly selected location
    const activeColonia = detectedColonia || colonia;
    if (detectedColonia) {
      setColonia(detectedColonia);
    }

    setSuggestions([]);
    setShowSuggestions(false);
    setMarkerPosition(pos);
    updateRoute(pos);

    const full = buildFullAddress(streetName || inputValue, detectedNumber || houseNumber, activeColonia, interiorOrRef);
    onSelect(full, pos);
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("La geolocalización no es compatible con este dispositivo.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        const pos = { lat, lng };
        setMarkerPosition(pos);
        updateRoute(pos);

        const details = await reverseOSMDetails(lat, lng);
        if (details.street && !isCoordinateString(details.street)) {
          setInputValue(details.street);
        }
        if (details.houseNumber && !houseNumber) {
          setHouseNumber(details.houseNumber);
        }
        const activeColonia = details.colonia || colonia;
        if (details.colonia) {
          setColonia(details.colonia);
        }

        const streetToUse = (details.street && !isCoordinateString(details.street)) ? details.street : inputValue;
        const full = buildFullAddress(streetToUse, houseNumber || details.houseNumber, activeColonia, interiorOrRef);
        onSelect(full, pos);
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        console.warn("Could not get current position:", error?.message || error);
        alert("No se pudo obtener tu ubicación actual. Puedes seleccionarla tocando el mapa.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleMapLocationChange = async (pos: { lat: number, lng: number }) => {
    setMarkerPosition(pos);
    updateRoute(pos);
    const details = await reverseOSMDetails(pos.lat, pos.lng);
    
    // Only update inputValue if details.street has a valid readable street name (NEVER a coordinate)
    if (details.street && !isCoordinateString(details.street)) {
      setInputValue(details.street);
    }
    if (details.houseNumber && !houseNumber) {
      setHouseNumber(details.houseNumber);
    }
    
    // Always update colonia to the new location's colonia when moving pin
    const activeColonia = details.colonia || colonia;
    if (details.colonia) {
      setColonia(details.colonia);
    }

    const streetToUse = (details.street && !isCoordinateString(details.street)) 
      ? details.street 
      : (inputValue || (details.colonia ? `Calle en Col. ${details.colonia}` : 'Ubicación señalada en mapa'));
      
    const full = buildFullAddress(streetToUse, houseNumber || details.houseNumber, activeColonia, interiorOrRef);
    onSelect(full, pos);
  };

  const handleBlur = async () => {
    setTimeout(() => setShowSuggestions(false), 250);
    // If user typed an address but no coordinate is set yet, geocode immediately
    if (!markerPosition && (inputValue.trim().length >= 3 || colonia.trim().length >= 3)) {
      const query = `${inputValue} ${colonia}`.trim();
      const found = await geocodeOSMAddress(query);
      if (found) {
        const pos = { lat: found.lat, lng: found.lng };
        setMarkerPosition(pos);
        updateRoute(pos);
        const full = buildFullAddress(inputValue, houseNumber, colonia, interiorOrRef);
        onSelect(full, pos);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-gray-700">Calle o Avenida <span className="text-blue-600 font-bold">*</span></label>
            {markerPosition && (
              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Punto fijado en mapa
              </span>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input 
              disabled={isLocating}
              placeholder="Ej: Av. del Mar, Calle Sonora, Melchor Ocampo..." 
              className="pl-9 pr-10 text-sm h-11 bg-white border-gray-200 shadow-sm rounded-xl"
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onBlur={handleBlur}
            />
            {inputValue && !isSearching && !isLocating && (
              <button
                type="button"
                onClick={() => handleInputChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors"
                title="Limpiar calle"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {(isSearching || isLocating) && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-900 opacity-50" />
              </div>
            )}
          </div>

          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -5 }}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xl absolute z-[100] left-0 right-0 mt-1 max-h-64 overflow-y-auto divide-y divide-gray-100"
              >
                {suggestions.map((place) => {
                  const streetDisplay = place.address?.road || place.address?.street || place.display_name.split(',')[0].trim();
                  const hintColonia = place.address?.neighbourhood || place.address?.suburb || place.address?.quarter || '';
                  return (
                    <button
                      key={place.place_id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent input blur from hiding suggestions before click completes
                        handleSelectPlace(place);
                      }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50 transition-colors flex items-start gap-3"
                    >
                      <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-blue-600">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="flex-1 py-0.5">
                        <p className="font-bold text-gray-900 text-xs line-clamp-1">
                          {streetDisplay}
                          {place.address?.house_number ? ` #${place.address.house_number}` : ''}
                        </p>
                        <p className="text-[10px] text-gray-500 line-clamp-1">
                          {hintColonia ? `Col. ${hintColonia} • ` : ''}{place.display_name}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Number & Neighborhood Fields for exact location */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">
              No. Exterior <span className="text-blue-600 font-bold">*</span>
            </label>
            <Input 
              placeholder="Ej: 1234, 45-B" 
              className="text-sm h-11 bg-white border-gray-200 shadow-sm rounded-xl font-medium"
              value={houseNumber}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleHouseNumberChange(e.target.value)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-gray-700 block">Colonia / Fracc. <span className="text-blue-600 font-bold">*</span></label>
              {colonia && (
                <button
                  type="button"
                  onClick={() => handleColoniaChange('')}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="relative">
              <Input 
                placeholder="Ej: Juárez, Centro, Marina..." 
                className="text-sm h-11 pr-8 bg-white border-gray-200 shadow-sm rounded-xl font-medium"
                value={colonia}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleColoniaChange(e.target.value)}
                onBlur={handleBlur}
              />
              {colonia && (
                <button
                  type="button"
                  onClick={() => handleColoniaChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors"
                  title="Borrar colonia para escribirla manualmente"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">No. Interior / Depto / Referencia (Opcional)</label>
          <Input 
            placeholder="Ej: Depto 3B, Portón negro, Junto a la tienda" 
            className="text-sm h-11 bg-white border-gray-200 shadow-sm rounded-xl font-medium"
            value={interiorOrRef}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInteriorOrRefChange(e.target.value)}
          />
        </div>
        
        <button 
          type="button"
          onClick={handleCurrentLocation}
          disabled={isLocating}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-50 hover:bg-gray-100 text-blue-900 text-xs font-bold rounded-xl transition-all border border-gray-200 disabled:opacity-50 shadow-sm active:scale-[0.99]"
        >
          {isLocating ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-900" />
          ) : (
            <Locate className="w-4 h-4 text-blue-600" />
          )}
          Autocompletar con mi ubicación GPS actual
        </button>
      </div>

      <div className="w-full rounded-2xl overflow-hidden border border-gray-200 relative shadow-inner bg-gray-100 h-56">
        <OSMMap
          center={markerPosition || { lat: shopLocation.lat, lng: shopLocation.lng }}
          zoom={markerPosition ? 15 : 13}
          shopLocation={shopLocation}
          customerLocation={markerPosition}
          routeCoordinates={routeInfo?.coordinates}
          onMapClick={handleMapLocationChange}
          onMarkerDragEnd={handleMapLocationChange}
          className="w-full h-full"
        />

        {/* Distance & ETA Badge */}
        {routeInfo && markerPosition && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-600/95 backdrop-blur-sm text-white px-3.5 py-1.5 rounded-full shadow-lg text-[11px] font-bold border border-white/30 flex items-center gap-1.5 z-10 whitespace-nowrap">
            <Navigation className="w-3.5 h-3.5 text-blue-200 animate-pulse" />
            <span>Ruta: {routeInfo.distanceKm} km (~{routeInfo.durationMin} min)</span>
          </div>
        )}

        <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-700 shadow-md border border-gray-100 pointer-events-none z-10 flex items-center gap-1">
          <MapPin className="w-3 h-3 text-blue-600" />
          <span>Toca o arrastra el pin para ajustar la ubicación exacta</span>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-[10px] text-gray-400 font-medium">
        <span>© OpenStreetMap & OSRM</span>
        <span className="text-emerald-600 font-bold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
          Geolocalización precisa y sin costos
        </span>
      </div>
    </div>
  );
}
