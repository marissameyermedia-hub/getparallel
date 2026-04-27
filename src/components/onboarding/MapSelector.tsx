import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Plus, Minus, X } from 'lucide-react';

interface MapSelectorProps {
  onLocationSelect: (location: { lat: number; lng: number; address: string }) => void;
  initialLocation?: { lat: number; lng: number };
}

export function MapSelector({ onLocationSelect, initialLocation }: MapSelectorProps) {
  const [selectedPin, setSelectedPin] = useState<{ lat: number; lng: number } | null>(
    initialLocation || null
  );
  const [zoom, setZoom] = useState(4);
  const [center, setCenter] = useState({ lat: 39.8283, lng: -98.5795 }); // Center of US
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  // Convert lat/lng to pixel coordinates
  const latLngToPixel = (lat: number, lng: number) => {
    const scale = Math.pow(2, zoom);
    const worldWidth = 256 * scale;
    const worldHeight = 256 * scale;

    const x = ((lng + 180) / 360) * worldWidth;
    const y =
      ((1 -
        Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) /
          Math.PI) /
        2) *
      worldHeight;

    return { x, y };
  };

  // Convert pixel coordinates to lat/lng
  const pixelToLatLng = (x: number, y: number) => {
    const scale = Math.pow(2, zoom);
    const worldWidth = 256 * scale;
    const worldHeight = 256 * scale;

    const lng = (x / worldWidth) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldHeight)));
    const lat = (latRad * 180) / Math.PI;

    return { lat, lng };
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapRef.current || isDragging) return;

    const rect = mapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Get center pixel position
    const centerPixel = latLngToPixel(center.lat, center.lng);
    
    // Calculate clicked position relative to center
    const clickedX = centerPixel.x + (x - rect.width / 2);
    const clickedY = centerPixel.y + (y - rect.height / 2);
    
    const location = pixelToLatLng(clickedX, clickedY);
    setSelectedPin(location);

    // Reverse geocode to get address
    reverseGeocode(location.lat, location.lng);
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      // Using Nominatim API for reverse geocoding (free, no API key needed)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
      );
      const data = await response.json();
      
      const address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      onLocationSelect({ lat, lng, address });
    } catch (error) {
      console.error('Geocoding error:', error);
      onLocationSelect({ 
        lat, 
        lng, 
        address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` 
      });
    }
  };

  const searchLocation = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      // Using Nominatim API for geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          searchQuery
        )}&format=json&limit=1&countrycodes=us`
      );
      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = data[0];
        const location = {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
        };
        
        setCenter(location);
        setSelectedPin(location);
        setZoom(13); // Zoom in to neighborhood level
        
        onLocationSelect({
          lat: location.lat,
          lng: location.lng,
          address: result.display_name,
        });
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleZoomIn = () => {
    setZoom(Math.min(18, zoom + 1));
  };

  const handleZoomOut = () => {
    setZoom(Math.max(3, zoom - 1));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    const scale = Math.pow(2, zoom);
    const worldWidth = 256 * scale;
    
    const dlng = -(dx / worldWidth) * 360;
    const dlat = (dy / worldWidth) * 360;

    setCenter({
      lat: Math.max(-85, Math.min(85, center.lat + dlat)),
      lng: ((center.lng + dlng + 180) % 360) - 180,
    });

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const clearPin = () => {
    setSelectedPin(null);
  };

  // Get zoom level description
  const getZoomDescription = () => {
    if (zoom <= 5) return 'Country view';
    if (zoom <= 8) return 'State view';
    if (zoom <= 11) return 'City view';
    if (zoom <= 14) return 'Neighborhood view';
    return 'Street view';
  };

  return (
    <div className="w-full space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              searchLocation();
            }
          }}
          placeholder="Enter zip code"
          className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-black focus:outline-none transition-colors"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-5 h-5 text-gray-400 hover:text-black transition-colors" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Map Container */}
      <div className="relative w-full h-96 rounded-2xl overflow-hidden border-2 border-gray-200">
        <div
          ref={mapRef}
          className={`w-full h-full bg-white ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
          onClick={handleMapClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            backgroundImage: `url('https://tile.openstreetmap.org/${zoom}/${Math.floor(
              ((center.lng + 180) / 360) * Math.pow(2, zoom)
            )}/${Math.floor(
              ((1 -
                Math.log(
                  Math.tan((center.lat * Math.PI) / 180) +
                    1 / Math.cos((center.lat * Math.PI) / 180)
                ) / Math.PI) /
                2) *
                Math.pow(2, zoom)
            )}.png')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'grayscale(100%) contrast(1.2)',
          }}
        >
          {/* Tile Grid - Using OpenStreetMap tiles with grayscale filter */}
          <div className="absolute inset-0 pointer-events-none">
            {/* This creates the map using CSS background */}
          </div>

          {/* Selected Pin */}
          {selectedPin && (
            <div
              className="absolute transform -translate-x-1/2 -translate-y-full pointer-events-none"
              style={{
                left: '50%',
                top: '50%',
              }}
            >
              <MapPin className="w-10 h-10 text-black fill-black drop-shadow-lg" />
            </div>
          )}

          {/* Crosshair at center when no pin selected */}
          {!selectedPin && (
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-8 h-8 border-2 border-black rounded-full opacity-30" />
            </div>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="absolute right-4 top-4 flex flex-col gap-2">
          <button
            onClick={handleZoomIn}
            aria-label="Zoom in"
            className="w-10 h-10 bg-white border-2 border-black rounded-lg flex items-center justify-center hover:bg-black hover:text-white transition-all shadow-lg"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            onClick={handleZoomOut}
            aria-label="Zoom out"
            className="w-10 h-10 bg-white border-2 border-black rounded-lg flex items-center justify-center hover:bg-black hover:text-white transition-all shadow-lg"
          >
            <Minus className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Zoom Level Indicator */}
        <div className="absolute left-4 bottom-4 px-3 py-2 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 text-xs font-medium">
          {getZoomDescription()}
        </div>

        {/* Clear Pin Button */}
        {selectedPin && (
          <button
            onClick={clearPin}
            className="absolute left-4 top-4 px-3 py-2 bg-white border-2 border-black rounded-lg text-sm font-medium hover:bg-black hover:text-white transition-all shadow-lg flex items-center gap-2"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            Clear Pin
          </button>
        )}
      </div>

      {/* Instructions */}
      <p className="text-sm text-gray-600 text-center">
        {selectedPin 
          ? 'Pin placed! Click anywhere else to move it, or continue below.'
          : 'Click anywhere on the map to place your location pin'}
      </p>
    </div>
  );
}