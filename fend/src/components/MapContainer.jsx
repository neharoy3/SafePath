import { useEffect, useRef, useState } from 'react'
import { MapContainer as LeafletMap, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default marker icons in Leaflet with Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom icons for user and destination
const createUserIcon = () => {
  return L.divIcon({
    className: 'user-location-marker',
    html: `
      <div style="
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #4285F4;
        border: 3px solid white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
        "></div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  })
}

const createDestinationIcon = () => {
  return L.divIcon({
    className: 'destination-marker',
    html: `
      <div style="
        width: 40px;
        height: 40px;
        border-radius: 50% 50% 50% 0;
        background: #FF4C4C;
        border: 3px solid white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          transform: rotate(45deg);
        "></div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  })
}

// Component to handle map center updates during navigation - REAL-TIME
function MapUpdater({ userLocation, selectedRoute, isNavigating }) {
  const map = useMap()
  
  useEffect(() => {
    if (userLocation && userLocation.lat && userLocation.lng) {
      if (isNavigating) {
        // During navigation, always center on EXACT user location with high zoom
        map.setView([userLocation.lat, userLocation.lng], 18, {
          animate: true,
          duration: 0.5
        })
      } else {
        // When not navigating, show overview but still centered on user
        map.setView([userLocation.lat, userLocation.lng], 15, {
          animate: true,
          duration: 0.5
        })
      }
      console.log('🗺️ Map updated to EXACT location:', {
        lat: userLocation.lat.toFixed(6),
        lng: userLocation.lng.toFixed(6)
      })
    }
  }, [userLocation, isNavigating, map])

  useEffect(() => {
    if (selectedRoute && selectedRoute.path && selectedRoute.path.length > 0 && !isNavigating) {
      // Fit bounds when route is selected but not navigating
      const bounds = L.latLngBounds(selectedRoute.path.map(p => [p.lat, p.lng]))
        if (userLocation) {
        bounds.extend([userLocation.lat, userLocation.lng])
      }
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [selectedRoute, userLocation, isNavigating, map])

  return null
}

// Main MapContainer component
const MapContainer = ({ userLocation, routes, selectedRoute, destination, isNavigating = false, onRouteUpdate }) => {
  const [currentRoute, setCurrentRoute] = useState(selectedRoute)

  useEffect(() => {
    setCurrentRoute(selectedRoute)
  }, [selectedRoute])

  // Get route color based on safety score
  const getRouteColor = (route) => {
    if (!route || !route.safety) return '#00a8ff'
    const safetyColor = route.safety.color
            const colors = {
      green: '#00ff99',
      yellow: '#ffd633',
      red: '#ff4c4c',
      blue: '#00a8ff'
    }
    return colors[safetyColor] || colors.blue
  }

  // Get destination coordinates
  const getDestinationCoords = () => {
    if (destination && typeof destination === 'object' && destination.lat && destination.lng) {
      return [destination.lat, destination.lng]
    }
    if (currentRoute && currentRoute.path && currentRoute.path.length > 0) {
      const lastPoint = currentRoute.path[currentRoute.path.length - 1]
      return [lastPoint.lat, lastPoint.lng]
    }
    return null
  }

  const destinationCoords = getDestinationCoords()

  // Default center (India)
  const defaultCenter = userLocation 
    ? [userLocation.lat, userLocation.lng]
    : [20.5937, 78.9629]

  if (!userLocation) {
    return (
      <div className="w-full h-full relative flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg font-semibold">Loading Map...</p>
          <p className="text-gray-400 text-sm">Waiting for location...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      {/* Live Location Display Overlay */}
      {userLocation && (
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg p-3 border border-gray-300 shadow-lg z-[1000] max-w-xs">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-gray-800 text-sm font-semibold">📍 Live Location</span>
          </div>
          <div className="text-xs text-gray-600 space-y-1">
            <div className="flex justify-between">
              <span>Lat:</span>
              <span className="font-mono">{userLocation.lat.toFixed(6)}</span>
            </div>
            <div className="flex justify-between">
              <span>Lng:</span>
              <span className="font-mono">{userLocation.lng.toFixed(6)}</span>
            </div>
          </div>
        </div>
      )}

      <LeafletMap
        center={defaultCenter}
        zoom={isNavigating ? 17 : (userLocation ? 14 : 5)}
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        zoomControl={!isNavigating}
      >
        {/* OpenStreetMap Tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Map Updater */}
        <MapUpdater userLocation={userLocation} selectedRoute={currentRoute} isNavigating={isNavigating} />

        {/* User Location Marker */}
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={createUserIcon()}
            zIndexOffset={1000}
          >
          </Marker>
        )}

        {/* Destination Marker */}
        {destinationCoords && (
          <Marker
            position={destinationCoords}
            icon={createDestinationIcon()}
            zIndexOffset={999}
          >
          </Marker>
        )}

        {/* Draw selected route */}
        {currentRoute && currentRoute.path && currentRoute.path.length > 0 && (
          <Polyline
            positions={currentRoute.path.map(p => [p.lat, p.lng])}
            pathOptions={{
              color: getRouteColor(currentRoute),
              weight: isNavigating ? 8 : 6,
              opacity: isNavigating ? 1.0 : 0.8,
              smoothFactor: 1
            }}
          />
        )}

        {/* Draw all routes if no route is selected */}
        {!currentRoute && routes && routes.length > 0 && routes.map((route, idx) => (
          route.path && route.path.length > 0 && (
            <Polyline
              key={route.id || idx}
              positions={route.path.map(p => [p.lat, p.lng])}
              pathOptions={{
                color: getRouteColor(route),
                weight: 4,
                opacity: 0.6,
                smoothFactor: 1
              }}
            />
          )
        ))}
      </LeafletMap>
    </div>
  )
}

export default MapContainer
