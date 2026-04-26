import { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, ChevronDown, Loader2 } from 'lucide-react';
import { EDGE_FUNCTION_URL, ONBOARDING_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';

interface LocationPickerProps {
  value?: {
    latitude?: number;
    longitude?: number;
    city?: string;
    state?: string;
    country?: string;
    locationDisplay?: string;
  } | null;
  onChange: (location: {
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
    locationDisplay: string;
  }) => void;
}

interface SearchResult {
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  country: string;
  displayName: string;
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [mode, setMode] = useState<'button' | 'search'>('button');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const token = await getAccessToken();
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
          'apikey': publicAnonKey
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(
          `${ONBOARDING_FUNCTION_URL}/location/search?q=${encodeURIComponent(searchQuery)}`,
          { headers }
        );
        
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Location search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          const token = await getAccessToken();
          const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'apikey': publicAnonKey
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const res = await fetch(
            `${ONBOARDING_FUNCTION_URL}/location/reverse?lat=${latitude}&lng=${longitude}`,
            { headers }
          );

          if (res.ok) {
            const data = await res.json();
            onChange({
              // Backend now returns snapped lat/lng (~1–2 mile grid). If the
              // backend response includes them, use those; otherwise fall back
              // to the raw GPS values (older backends).
              latitude: typeof data.latitude === 'number' ? data.latitude : latitude,
              longitude: typeof data.longitude === 'number' ? data.longitude : longitude,
              city: data.city || '',
              state: data.state || '',
              country: data.country || '',
              locationDisplay: data.displayName || ''
            });
          } else {
            console.warn('Reverse geocoding unavailable, falling back to search');
            setMode('search');
            alert("We couldn't look up your address automatically. Please search for your city instead.");
          }
        } catch (err) {
          console.error('Reverse geocoding error:', err);
          setMode('search');
          alert("We couldn't look up your address automatically. Please search for your city instead.");
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        // Only log geolocation error if there's actual error information
        if (error && (error.code || error.message)) {
          console.error('Geolocation error:', error);
        }
        alert('Unable to retrieve your location. Please try searching for your city instead.');
        setIsGettingLocation(false);
      }
    );
  };

  const handleSelectResult = (result: SearchResult) => {
    onChange({
      latitude: result.latitude,
      longitude: result.longitude,
      city: result.city,
      state: result.state || '',
      country: result.country,
      locationDisplay: result.displayName
    });
    setSearchQuery('');
    setShowDropdown(false);
    setMode('button');
  };

  return (
    <div className="space-y-3">

      {/* Current location display */}
      {value?.locationDisplay && (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-gray-600" />
            <span className="text-base text-gray-900">{value.locationDisplay}</span>
          </div>
          <button
            onClick={() => setMode(mode === 'button' ? 'search' : 'button')}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Change
          </button>
        </div>
      )}

      {/* Action buttons when no location set */}
      {!value?.locationDisplay && mode === 'button' && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isGettingLocation}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {isGettingLocation ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Getting your location...
              </>
            ) : (
              <>
                <Navigation className="w-5 h-5" />
                Use my current location
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={() => setMode('search')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-900 border-2 border-gray-300 rounded-xl hover:border-gray-400 transition-colors"
          >
            <Search className="w-5 h-5" />
            Search for a city
          </button>
        </div>
      )}

      {/* Search mode */}
      {mode === 'search' && (
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for your city..."
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:border-black focus:outline-none"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
            )}
          </div>

          {/* Search results dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
              {searchResults.slice(0, 5).map((result, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelectResult(result)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-900">{result.displayName}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Back to buttons */}
          {!value?.locationDisplay && (
            <button
              type="button"
              onClick={() => {
                setMode('button');
                setSearchQuery('');
                setShowDropdown(false);
              }}
              className="mt-2 text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back to options
            </button>
          )}
        </div>
      )}
    </div>
  );
}