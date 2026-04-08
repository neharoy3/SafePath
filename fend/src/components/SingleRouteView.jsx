import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../utils/firebaseAuth'
import { sendSOSAlert } from '../utils/sosService'
import MapContainer from './MapContainer'
import { ROUTES } from '../utils/routes'

const SingleRouteView = () => {
  const { routeId } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [route, setRoute] = useState(null)
  const [userLocation, setUserLocation] = useState(null)

  useEffect(() => {
    const loadUser = async () => {
      const currentUser = await getCurrentUser()
      if (!currentUser) {
        navigate(ROUTES.ROOT)
        return
      }
      setUser(currentUser)

      // Get user's current location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            })
          },
          (error) => {
            console.error('Error getting location:', error)
          }
        )
      }

      // Get route from sessionStorage (stored by JourneyPlanner)
      const storedRoute = sessionStorage.getItem('selectedRoute')
      if (storedRoute) {
        try {
          const parsedRoute = JSON.parse(storedRoute)
          if (parsedRoute.id === routeId) {
            setRoute(parsedRoute)
          } else {
            navigate(ROUTES.JOURNEY_PLANNER)
          }
        } catch (error) {
          console.error('Error parsing route:', error)
          navigate(ROUTES.JOURNEY_PLANNER)
        }
      } else {
        navigate(ROUTES.JOURNEY_PLANNER)
      }
    }

    loadUser()
  }, [routeId, navigate])

  const handleSOS = async () => {
    if (!userLocation) {
      alert('Unable to get your location. Please enable location services.')
      return
    }

    try {
      const result = await sendSOSAlert(userLocation, route)
      
      if (result.success) {
        alert(`SOS Alert Sent!\n\n${result.message}\n\nAlert ID: ${result.alertId}`)
      } else {
        alert(`Failed to send SOS alert: ${result.message}\n\nPlease call emergency services directly.`)
      }
    } catch (error) {
      console.error('SOS error:', error)
      alert('Failed to send SOS alert. Please call emergency services directly.')
    }
  }

  if (!route) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-bg">
        <div className="text-white">Loading route...</div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-dark-bg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-dark-surface border-b border-gray-800 p-4 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => navigate(ROUTES.JOURNEY_PLANNER)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h1 className="text-white font-semibold text-lg">{route.name}</h1>
        <div className="w-6"></div>
      </div>

      {/* Map - Scrollable if needed */}
      <div className="flex-1 relative overflow-y-auto">
        <MapContainer
          userLocation={userLocation}
          routes={[route]}
          selectedRoute={route}
          destination={route.destination}
        />
      </div>

      {/* Bottom Info Bar with SOS - Scrollable on small screens */}
      <div className="bg-dark-surface border-t border-gray-800 p-4 flex-shrink-0 overflow-y-auto max-h-[30vh]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 w-full sm:w-auto">
            <div>
              <span className="text-gray-400 text-sm">Time</span>
              <p className="text-white font-semibold">{route.eta} min</p>
            </div>
            <div>
              <span className="text-gray-400 text-sm">Distance</span>
              <p className="text-white font-semibold">{route.distance} km</p>
            </div>
            <div>
              <span className="text-gray-400 text-sm">Safety Score</span>
              <p className={`font-semibold ${
                route.safety.color === 'green' ? 'text-green-400' :
                route.safety.color === 'yellow' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {route.safety.score}/10
              </p>
            </div>
          </div>
          <button
            onClick={handleSOS}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all duration-200 neon-glow-red flex items-center space-x-2 w-full sm:w-auto justify-center"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>SOS</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default SingleRouteView

