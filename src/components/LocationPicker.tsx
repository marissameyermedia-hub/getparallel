import { useState, useEffect, useRef } from "react";
import { MapPin, Navigation, Search, Loader2 } from "lucide-react";
import { EDGE_FUNCTION_URL } from "../utils/supabase/client";
import { publicAnonKey } from "../utils/supabase/info";

interface LocationPickerProps {
  value?: {
    latitude?: number;
    longitude?: number;
    city?: string;
    country?: string;
    locationDisplay?: string;
  } | null;
  onChange: (location: {
    latitude: number;
    longitude: number;
    city: string;
    country: string;
    locationDisplay: string;
  }) => void;
}

interface SearchResult {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  displayName: string;
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [mode, setMode] = useState<"button" | "search">("button");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  // Track mount state so we don't update after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
        const token = localStorage.getItem("parallel_access_token");
        const headers: HeadersInit = {
          "Content-Type": "application/json",
          apikey: publicAnonKey,
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(`${EDGE_FUNCTION_URL}/location/search?q=${encodeURIComponent(searchQuery)}`, {
          headers,
        });

        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error("Location search error:", err);
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
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError("Your browser does not support location services. Please search for your city instead.");
      setMode("search");
      return;
    }

    // Check HTTPS (geolocation requires secure context except on localhost)
    if (
      typeof window !== "undefined" &&
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost"
    ) {
      setLocationError("Location services require a secure connection. Please search for your city instead.");
      setMode("search");
      return;
    }

    setIsGettingLocation(true);

    // Hard timeout fallback — if neither callback fires within 12 seconds,
    // force the spinner off and show the search fallback. This guards against
    // the rare case where the browser silently stalls on a permission prompt.
    const fallbackTimeout = setTimeout(() => {
      if (!isMountedRef.current) return;
      setIsGettingLocation(false);
      setLocationError("Location is taking too long. Please search for your city instead.");
      setMode("search");
    }, 12000);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        clearTimeout(fallbackTimeout);
        if (!isMountedRef.current) return;
        const { latitude, longitude } = position.coords;

        try {
          const token = localStorage.getItem("parallel_access_token");
          const headers: HeadersInit = {
            "Content-Type": "application/json",
            apikey: publicAnonKey,
          };
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }

          const res = await fetch(`${EDGE_FUNCTION_URL}/location/reverse?lat=${latitude}&lng=${longitude}`, {
            headers,
          });

          if (res.ok) {
            const data = await res.json();
            if (!isMountedRef.current) return;
            onChange({
              latitude,
              longitude,
              city: data.city,
              country: data.country,
              locationDisplay: data.displayName,
            });
          } else {
            if (!isMountedRef.current) return;
            setLocationError("Could not look up your city. Please search manually.");
            setMode("search");
          }
        } catch (err) {
          console.error("Reverse geocoding error:", err);
          if (!isMountedRef.current) return;
          setLocationError("Network error looking up your city. Please search manually.");
          setMode("search");
        } finally {
          if (isMountedRef.current) setIsGettingLocation(false);
        }
      },
      (error) => {
        clearTimeout(fallbackTimeout);
        if (!isMountedRef.current) return;
        console.error("Geolocation error:", error?.code, error?.message);

        // PositionError codes: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        let message: string;
        if (error?.code === 1) {
          message =
            "Location permission was denied. Please enable location access in your browser, or search for your city below.";
        } else if (error?.code === 2) {
          message = "Could not determine your location. Please search for your city below.";
        } else if (error?.code === 3) {
          message = "Location lookup timed out. Please search for your city below.";
        } else {
          message = "Could not get your location. Please search for your city below.";
        }
        setLocationError(message);
        setMode("search");
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: false, // network-level fix is faster and more reliable
        timeout: 10000, // browser must respond within 10 seconds
        maximumAge: 60000, // accept a cached fix up to 1 minute old
      },
    );
  };

  const handleSelectResult = (result: SearchResult) => {
    onChange({
      latitude: result.latitude,
      longitude: result.longitude,
      city: result.city,
      country: result.country,
      locationDisplay: result.displayName,
    });
    setSearchQuery("");
    setShowDropdown(false);
    setMode("button");
    setLocationError(null);
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
            onClick={() => setMode(mode === "button" ? "search" : "button")}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Change
          </button>
        </div>
      )}

      {/* Error banner */}
      {locationError && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">{locationError}</div>
      )}

      {/* Action buttons when no location set */}
      {!value?.locationDisplay && mode === "button" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isGettingLocation}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-black text-primary rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
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
            onClick={() => setMode("search")}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-900 border-2 border-gray-300 rounded-xl hover:border-gray-400 transition-colors"
          >
            <Search className="w-5 h-5" />
            Search for a city
          </button>
        </div>
      )}

      {/* Search mode */}
      {mode === "search" && (
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
                setMode("button");
                setSearchQuery("");
                setShowDropdown(false);
                setLocationError(null);
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
