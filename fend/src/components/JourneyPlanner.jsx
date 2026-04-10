import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../utils/firebaseAuth";
import {
  getRoutesFromDirectionsAPI,
  geocodeAddress,
  searchPlaces,
} from "../utils/directionsService";
import { calculateSafetyScore } from "../utils/safetyScore";
import { shareLocation } from "../utils/locationService";
import {
  updateUserLocationInDB,
  getUserLocationFromDB,
} from "../utils/backendLocationService";
import {
  detectDevice,
  getDeviceLocation,
  watchDeviceLocation,
  getOptimalUpdateInterval,
} from "../utils/deviceLocationService";
import MapContainer from "./MapContainer";
import RouteCard from "./RouteCard";
import NavigationPanel from "./NavigationPanel";
import { ROUTES } from "../utils/routes";

const JourneyPlanner = () => {
  const [user, setUser] = useState(null);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const navigate = useNavigate();

  // Load user and get current location
  useEffect(() => {
    const loadUser = async () => {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate(ROUTES.LOGIN);
        return;
      }
      setUser(currentUser);
      console.log("✅ User loaded:", currentUser.fullName);

      // Request location permission and get current location
      setLocationLoading(true);

      // Show permission request message
      const permissionToast = document.createElement("div");
      permissionToast.className =
        "fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
      permissionToast.innerHTML =
        "<span>📍</span> <span>Please allow location access...</span>";
      document.body.appendChild(permissionToast);

      // Detect device and get location using universal service
      const device = detectDevice();
      console.log(
        `📍 Requesting location from ${device.isMobile ? "Mobile" : device.isDesktop ? "Desktop" : "Tablet"} device...`,
      );

      getDeviceLocation({
        enableHighAccuracy: device.isMobile || device.isTablet,
        timeout: device.isMobile ? 15000 : 10000,
        maximumAge: 0,
      })
        .then(async (location) => {
          // Remove permission toast
          permissionToast.remove();

          console.log("✅ Device location obtained:", {
            lat: location.lat.toFixed(6),
            lng: location.lng.toFixed(6),
            accuracy: `${Math.round(location.accuracy)}m`,
            source: location.source,
            device: device.isMobile
              ? "Mobile"
              : device.isDesktop
                ? "Desktop"
                : "Tablet",
          });

          // Update UI immediately
          setUserLocation({ lat: location.lat, lng: location.lng });
          setSource("Current Location");
          setLocationLoading(false);

          // Immediately save device location to PostgreSQL database
          try {
            const dbResult = await updateUserLocationInDB(currentUser.uid, {
              lat: location.lat,
              lng: location.lng,
            });
            console.log("✅ Initial device location saved to database:", {
              lat: location.lat.toFixed(6),
              lng: location.lng.toFixed(6),
              accuracy: `${Math.round(location.accuracy)}m`,
              source: location.source,
              segment: dbResult.segment,
            });
          } catch (error) {
            console.error("❌ Failed to save location to database:", error);
          }

          // Share location in Firebase Realtime Database
          if (currentUser.uid) {
            try {
              await shareLocation(currentUser.uid, {
                lat: location.lat,
                lng: location.lng,
              });
              console.log("📍 Initial location shared to Firebase");
            } catch (error) {
              console.error("❌ Failed to share location to Firebase:", error);
            }
          }

          // Show success toast
          const toast = document.createElement("div");
          toast.className =
            "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
          toast.innerHTML = `<span>✅</span> <span>Location from ${location.source} saved and map updated</span>`;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 3000);
        })
        .catch(async (error) => {
          // Remove permission toast
          permissionToast.remove();

          console.error("❌ Error getting location:", error);

          setLocationLoading(false);

          let errorMessage =
            "Location access denied. Please enable location services.";
          if (error.code === 1) {
            errorMessage =
              "Location permission denied. Please allow location access in browser settings and refresh the page.";
          } else if (error.code === 2) {
            errorMessage =
              "Location unavailable. Please check your device settings.";
          } else if (error.code === 3) {
            errorMessage = "Location request timed out. Please try again.";
          }

          // Try to get last known location from PostgreSQL database as fallback
          console.log(
            "🔄 Attempting to fetch last known location from database...",
          );
          try {
            const dbLocation = await getUserLocationFromDB(currentUser.uid);
            if (dbLocation) {
              console.log(
                "✅ Using last known location from database:",
                dbLocation,
              );
              setUserLocation(dbLocation);
              setSource("Last Known Location (Database)");

              const toast = document.createElement("div");
              toast.className =
                "fixed top-4 right-4 bg-yellow-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
              toast.innerHTML =
                "<span>📍</span> <span>Using last known location from database</span>";
              document.body.appendChild(toast);
              setTimeout(() => toast.remove(), 3000);
              return;
            }
          } catch (dbError) {
            console.error(
              "❌ Failed to fetch location from database:",
              dbError,
            );
          }

          const toast = document.createElement("div");
          toast.className =
            "fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
          toast.innerHTML = `<span>⚠️</span> <span>${errorMessage}</span>`;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 5000);
        });
    };

    loadUser();
  }, [navigate]);

  // Update current step index based on user location during navigation
  useEffect(() => {
    if (
      !isNavigating ||
      !selectedRoute ||
      !userLocation ||
      !selectedRoute.steps ||
      selectedRoute.steps.length === 0
    ) {
      return;
    }

    // Find the current step based on user's position
    // This is a simplified version - in a real app, you'd calculate which step the user is closest to
    const checkStepProgress = () => {
      // For now, we'll just increment based on time/distance
      // In a real implementation, you'd calculate the nearest step based on route geometry
    };

    const interval = setInterval(checkStepProgress, 5000);
    return () => clearInterval(interval);
  }, [isNavigating, selectedRoute, userLocation]);

  // Universal real-time location tracking - Works on ALL devices (Mobile, Desktop, Tablet)
  // IMPROVED: More reliable location updates with retry mechanism
  useEffect(() => {
    if (!user?.uid) return;

    // Detect device type
    const device = detectDevice();
    console.log(
      `🔄 Starting RELIABLE location tracking on ${device.isMobile ? "Mobile" : device.isDesktop ? "Desktop" : "Tablet"} device...`,
    );
    console.log(
      `   Device capabilities: GPS=${device.hasGPS}, HighAccuracy=${device.hasHighAccuracy}`,
    );

    let watchId = null;
    let lastSavedLocation = null;
    let updateInterval = null;
    let backupInterval = null;
    let isMoving = false;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    // Get optimal update interval for this device
    const updateIntervalMs = getOptimalUpdateInterval(device, isMoving);

    // Function to update location in database
    const updateLocationInDB = async (location, source = "device") => {
      try {
        const dbResult = await updateUserLocationInDB(user.uid, {
          lat: location.lat,
          lng: location.lng,
        });
        consecutiveErrors = 0; // Reset error counter on success
        console.log(`✅ Location updated in database (${source}):`, {
          lat: location.lat.toFixed(6),
          lng: location.lng.toFixed(6),
          accuracy: location.accuracy
            ? `${Math.round(location.accuracy)}m`
            : "unknown",
          source: location.source || source,
          device: device.isMobile
            ? "Mobile"
            : device.isDesktop
              ? "Desktop"
              : "Tablet",
          segment: dbResult.segment,
        });
        return true;
      } catch (error) {
        consecutiveErrors++;
        console.error(
          `❌ Failed to update location in database (${source}):`,
          error,
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.warn(
            "⚠️ Too many consecutive errors, will retry with longer interval",
          );
        }
        return false;
      }
    };

    // Use universal device location service
    watchId = watchDeviceLocation(
      async (location) => {
        // Calculate distance moved (in meters) using Haversine formula
        let distanceMoved = 0;
        if (lastSavedLocation) {
          const R = 6371000; // Earth radius in meters
          const dLat = ((location.lat - lastSavedLocation.lat) * Math.PI) / 180;
          const dLng = ((location.lng - lastSavedLocation.lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lastSavedLocation.lat * Math.PI) / 180) *
              Math.cos((location.lat * Math.PI) / 180) *
              Math.sin(dLng / 2) *
              Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distanceMoved = R * c;
        }

        // Detect if user is moving (speed > 1 m/s or significant movement)
        isMoving = (location.speed && location.speed > 1) || distanceMoved > 10;

        const locationInfo = {
          lat: location.lat.toFixed(6),
          lng: location.lng.toFixed(6),
          accuracy: Math.round(location.accuracy || 0),
          source: location.source,
          distance: Math.round(distanceMoved),
          device: device.isMobile
            ? "Mobile"
            : device.isDesktop
              ? "Desktop"
              : "Tablet",
          moving: isMoving,
        };

        console.log("📍 Device location update:", locationInfo);

        // ALWAYS update UI immediately (no throttling) - This ensures map always shows current location
        setUserLocation({ lat: location.lat, lng: location.lng });

        // Update database based on device type and movement:
        // - Mobile: Update every 2-3 seconds or when moved > 5m
        // - Desktop: Update every 5-10 seconds or when moved > 10m
        const now = Date.now();
        const movementThreshold = device.isMobile ? 5 : 10; // meters
        const timeThreshold = updateIntervalMs * (consecutiveErrors + 1); // Increase interval if errors

        const shouldUpdateDB =
          distanceMoved > movementThreshold ||
          !lastSavedLocation ||
          !window.lastDBUpdate ||
          now - window.lastDBUpdate > timeThreshold;

        if (shouldUpdateDB) {
          window.lastDBUpdate = now;
          lastSavedLocation = { lat: location.lat, lng: location.lng };

          // Update database
          await updateLocationInDB(location, "watchPosition");

          // Also update Firebase (throttle based on device)
          const firebaseInterval = device.isMobile ? 3000 : 5000;
          if (
            !window.lastFirebaseUpdate ||
            now - window.lastFirebaseUpdate > firebaseInterval
          ) {
            window.lastFirebaseUpdate = now;
            try {
              await shareLocation(user.uid, {
                lat: location.lat,
                lng: location.lng,
              });
              console.log("✅ Location updated in Firebase");
            } catch (error) {
              console.error("❌ Firebase update failed:", error);
            }
          }
        }
      },
      (error) => {
        console.error("❌ Error in device location tracking:", error);
        consecutiveErrors++;

        let errorMessage = "Location access error";
        if (error.code === 1) {
          errorMessage =
            "Location permission denied. Please enable location access.";
        } else if (error.code === 2) {
          errorMessage = "Location unavailable. Please check your GPS/WiFi.";
        } else if (error.code === 3) {
          errorMessage = "Location request timeout. Please try again.";
        }

        // Show error toast only if too many errors
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const errorToast = document.createElement("div");
          errorToast.className =
            "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm";
          errorToast.textContent = `❌ ${errorMessage}`;
          document.body.appendChild(errorToast);
          setTimeout(() => errorToast.remove(), 5000);
        }
      },
      {
        enableHighAccuracy: device.isMobile || device.isTablet,
        timeout: device.isMobile ? 15000 : 10000,
        maximumAge: 0,
      },
    );

    // Backup periodic update (device-optimized interval) - Ensures location is always updated
    backupInterval = setInterval(async () => {
      try {
        const location = await getDeviceLocation({
          enableHighAccuracy: device.isMobile || device.isTablet,
          timeout: device.isMobile ? 8000 : 5000, // Reduced for faster fallback
          maximumAge: 5000, // Allow 5 second old cache for backup
        });

        // Update UI
        setUserLocation({ lat: location.lat, lng: location.lng });

        // Update database (only if significant time passed or location changed)
        const now = Date.now();
        if (
          !window.lastBackupUpdate ||
          now - window.lastBackupUpdate > updateIntervalMs * 3
        ) {
          window.lastBackupUpdate = now;
          await updateLocationInDB(location, "backup");
        }
      } catch (error) {
        console.error("❌ Backup location update failed:", error);
      }
    }, updateIntervalMs * 3); // Backup runs at 3x the normal interval

    return () => {
      if (watchId !== null) {
        console.log("⏹️ Stopping device location tracking");
        if (navigator.geolocation) {
          navigator.geolocation.clearWatch(watchId);
        }
      }
      if (backupInterval) {
        clearInterval(backupInterval);
      }
    };
  }, [user?.uid]); // Only depend on user ID

  // Handle route finding
  const handleFindRoutes = async () => {
    if (!destination || !destination.trim()) {
      const toast = document.createElement("div");
      toast.className =
        "fixed top-4 right-4 bg-yellow-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
      toast.innerHTML =
        "<span>⚠️</span> <span>Please enter a destination</span>";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
      return;
    }

    if (!userLocation) {
      const toast = document.createElement("div");
      toast.className =
        "fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
      toast.innerHTML =
        "<span>⚠️</span> <span>Please allow location access first</span>";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
      return;
    }

    setLoadingRoutes(true);
    setRoutes([]);
    setSelectedRoute(null);

    try {
      console.log("🔍 Finding routes from", userLocation, "to", destination);

      // Geocode destination first
      const destCoords = await geocodeAddress(destination);
      setDestinationCoords(destCoords);

      const fetchedRoutes = await getRoutesFromDirectionsAPI(
        userLocation,
        destCoords,
        user?.preferences || {},
      );

      console.log("✅ Routes fetched:", fetchedRoutes.length);

      if (fetchedRoutes && fetchedRoutes.length > 0) {
        setRoutes(fetchedRoutes);
        setSelectedRoute(fetchedRoutes[0]);

        const toast = document.createElement("div");
        toast.className =
          "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
        toast.innerHTML = `<span>✅</span> <span>Found ${fetchedRoutes.length} route${fetchedRoutes.length > 1 ? "s" : ""}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      } else {
        throw new Error("No routes found");
      }
    } catch (error) {
      console.error("❌ Error finding routes:", error);

      const toast = document.createElement("div");
      toast.className =
        "fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
      toast.innerHTML = `<span>❌</span> <span>Failed to find routes: ${error.message}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 5000);
    } finally {
      setLoadingRoutes(false);
    }
  };

  // Handle route selection
  const handleRouteSelect = (route) => {
    console.log("🗺️ Route selected:", route.name);
    setSelectedRoute(route);
    setDrawerExpanded(true);
  };

  // Show loading screen while getting location
  if (locationLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white text-lg font-semibold mb-2">
            Getting your location...
          </p>
          <p className="text-gray-400 text-sm">
            Please allow location access when prompted
          </p>
          <div className="mt-4 flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <div
              className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
              style={{ animationDelay: "0.2s" }}
            ></div>
            <div
              className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
              style={{ animationDelay: "0.4s" }}
            ></div>
          </div>
          <p className="text-gray-500 text-xs mt-4">Syncing with database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-dark-bg lg:flex-row">
      {/* Top Section - Sidebar and Map */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left Sidebar */}
        <div className="flex max-h-[42vh] w-full flex-col overflow-hidden border-b border-gray-800 bg-dark-surface lg:max-h-none lg:w-96 lg:border-b-0 lg:border-r">
          {/* Static User Info Card */}
          <div className="shrink-0 border-b border-gray-800 bg-dark-surface p-6">
            <div className="mb-4 flex items-center space-x-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-xl font-bold text-white shadow-lg">
                {user ? getInitials(user.fullName) : "U"}
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.ACCOUNT)}
                  className="block text-left"
                >
                  <h3 className="text-lg font-semibold text-white transition hover:text-cyan-300">
                    {user?.fullName || "User"}
                  </h3>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate(ROUTES.ACCOUNT)}
              className="mb-4 inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
            >
              Account settings
            </button>

            {/* Logout Button */}
            <button
              onClick={async () => {
                try {
                  console.log("👋 Logging out...");
                  const { logoutUser } = await import("../utils/firebaseAuth");
                  await logoutUser();
                  localStorage.clear();
                  sessionStorage.clear();

                  const toast = document.createElement("div");
                  toast.className =
                    "fixed top-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
                  toast.innerHTML =
                    "<span>👋</span> <span>Logged out successfully</span>";
                  document.body.appendChild(toast);
                  setTimeout(() => toast.remove(), 2000);

                  setTimeout(() => {
                    navigate(ROUTES.LOGIN);
                    window.location.reload();
                  }, 500);
                } catch (error) {
                  console.error("❌ Logout error:", error);
                }
              }}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Logout
            </button>

            {/* Location Status */}
            <div className="mt-3 flex items-center space-x-2 rounded-lg border border-green-500/20 bg-green-500/10 p-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-sm font-medium text-green-400">
                {userLocation
                  ? "✅ Location Active"
                  : "⚠️ Location Unavailable"}
              </span>
            </div>
          </div>

          {/* Scrollable Journey Content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:min-h-0">
            <div className="mb-3 rounded-lg border border-gray-700 bg-dark-bg p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center text-xs text-gray-400">
                  <span className="mr-2">🆘</span> Emergency contact
                </p>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.ACCOUNT)}
                  className="text-xs font-medium text-cyan-300 hover:text-cyan-200"
                >
                  Update
                </button>
              </div>
              <p className="text-sm text-gray-200">
                {user?.emergencyContactNumber || "Not set yet"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Keep this current so SOS alerts reach the right number.
              </p>
            </div>

            {/* Live Location Display */}
            {userLocation && (
              <div className="mb-3 rounded-lg border border-gray-700 bg-dark-bg p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center text-xs text-gray-400">
                    <span className="mr-2">📍</span> Live Location
                  </p>
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Latitude:</span>
                    <span className="font-mono text-xs text-gray-300">
                      {userLocation.lat.toFixed(6)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Longitude:</span>
                    <span className="font-mono text-xs text-gray-300">
                      {userLocation.lng.toFixed(6)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Journey Planner Form */}
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <span className="mr-3">🗺️</span>
              Plan Your Journey
            </h2>

            {/* Source Input (Read-only) */}
            <div className="mb-4">
              <label className="block text-gray-400 text-sm font-medium mb-2 flex items-center">
                <span className="mr-2">📍</span>
                From (Current Location)
              </label>
              <input
                type="text"
                value={source}
                readOnly
                className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-lg text-white cursor-not-allowed opacity-75"
                placeholder="Fetching location..."
              />
            </div>

            {/* Destination Input with Autocomplete */}
            <div className="mb-6 relative">
              <label className="block text-gray-400 text-sm font-medium mb-2 flex items-center">
                <span className="mr-2">🎯</span>
                To (Destination)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={destination}
                  onChange={async (e) => {
                    const value = e.target.value;
                    setDestination(value);

                    // Search for places using backend when user types
                    if (value.length > 2) {
                      try {
                        const results = await searchPlaces(value, 5);
                        if (results && results.length > 0) {
                          setDestinationSuggestions(
                            results.map((r) => ({
                              name: r.display_name,
                              lat: r.lat,
                              lng: r.lng,
                            })),
                          );
                          setShowSuggestions(true);
                        } else {
                          setShowSuggestions(false);
                          setDestinationSuggestions([]);
                        }
                      } catch (error) {
                        console.error("Search error:", error);
                        setShowSuggestions(false);
                      }
                    } else {
                      setShowSuggestions(false);
                      setDestinationSuggestions([]);
                    }
                  }}
                  onFocus={() => {
                    if (destinationSuggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      setShowSuggestions(false);
                      handleFindRoutes();
                    }
                  }}
                  className="w-full px-4 py-3 bg-dark-bg border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                  placeholder="Enter destination (e.g., Mumbai, Bangalore)"
                />

                {/* Dropdown Suggestions */}
                {showSuggestions && destinationSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-dark-surface border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {destinationSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          setDestination(suggestion.name);
                          setDestinationCoords({
                            lat: suggestion.lat,
                            lng: suggestion.lng,
                          });
                          setShowSuggestions(false);
                          setDestinationSuggestions([]);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-dark-bg text-white transition-colors flex items-start space-x-2 border-b border-gray-700 last:border-b-0"
                      >
                        <span className="mt-1">📍</span>
                        <div className="flex-1">
                          <div className="font-medium">
                            {suggestion.name.split(",")[0]}
                          </div>
                          <div className="text-xs text-gray-400">
                            {suggestion.name
                              .split(",")
                              .slice(1)
                              .join(",")
                              .trim()}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-gray-500 text-xs mt-1">
                Search for any place worldwide using OpenStreetMap
              </p>
            </div>

            {/* Find Routes Button */}
            <button
              onClick={handleFindRoutes}
              disabled={loadingRoutes || !userLocation}
              className={`w-full py-3 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center space-x-2 ${
                loadingRoutes || !userLocation
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-500 to-blue-700 text-white hover:from-blue-600 hover:to-blue-800 shadow-lg hover:shadow-xl"
              }`}
            >
              {loadingRoutes ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Finding Safe Routes...</span>
                </>
              ) : (
                <>
                  <span>🔍</span>
                  <span>Find Safe Routes</span>
                </>
              )}
            </button>

            {/* Routes List */}
            {routes.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <span className="mr-2">🛣️</span>
                  Available Routes ({routes.length})
                </h3>
                <div className="space-y-3">
                  {routes.map((route) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      isSelected={selectedRoute?.id === route.id}
                      onClick={() => handleRouteSelect(route)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Map Section */}
        <div className="flex-1 relative">
          <MapContainer
            userLocation={userLocation}
            routes={routes}
            selectedRoute={selectedRoute}
            destination={destinationCoords || destination}
            isNavigating={isNavigating}
          />

          {/* Route Legend - Only show when not navigating */}
          {routes.length > 0 && !isNavigating && (
            <div className="absolute top-4 left-4 bg-dark-surface/95 backdrop-blur-sm p-4 rounded-lg shadow-xl border border-gray-800 z-10">
              <h4 className="text-white font-semibold mb-3 text-sm flex items-center">
                <span className="mr-2">🎨</span>
                Route Safety Legend
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-1 bg-green-500 rounded"></div>
                  <span className="text-gray-300">Safe (7-10)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-1 bg-yellow-500 rounded"></div>
                  <span className="text-gray-300">Moderate (4-7)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-1 bg-red-500 rounded"></div>
                  <span className="text-gray-300">Dangerous (0-4)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Panel - Shows both route preview and active navigation */}
        {selectedRoute && (
          <NavigationPanel
            route={selectedRoute}
            userLocation={userLocation}
            isNavigating={isNavigating}
            onStartNavigation={() => setIsNavigating(true)}
            onStopNavigation={() => {
              setIsNavigating(false);
              setCurrentStepIndex(0);
            }}
            currentStepIndex={currentStepIndex}
            nextStep={selectedRoute.steps?.[currentStepIndex + 1]}
          />
        )}
      </div>
    </div>
  );
};

// Helper function to get user initials
function getInitials(name) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default JourneyPlanner;
