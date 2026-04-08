import { API_BASE_URL } from '../config/api'

/**
 * Get routes with safety scores from backend
 */
export const getRoutesFromDirectionsAPI = async (origin, destination) => {
  try {
    console.log('🔍 Fetching routes from backend:', origin, 'to:', destination)

    let originCoords = origin
    let destCoords = destination

    if (typeof destination === 'string') {
      destCoords = await geocodeAddress(destination)
    }

    console.log('📍 Origin:', originCoords)
    console.log('📍 Destination:', destCoords)

    // Call backend
    const response = await fetch(`${API_BASE_URL}/api/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin_lat: originCoords.lat,
        origin_lng: originCoords.lng,
        dest_lat: destCoords.lat,
        dest_lng: destCoords.lng
      })
    })

    if (!response.ok) {
      let errorData = {}
      try {
        errorData = await response.json()
      } catch (parseError) {
        console.error('❌ Failed to parse error response:', parseError)
        throw new Error('API error occurred')
      }
      throw new Error(`API error: ${errorData.detail || 'Unknown error'}`)
    }

    let data = {}
    try {
      data = await response.json()
    } catch (parseError) {
      console.error('❌ Failed to parse routes response:', parseError)
      throw new Error('Failed to parse server response')
    }
    console.log('✅ Received routes:', data)

    const routes = data.routes.map((route, index) => ({
      id: route.id,
      name: route.name,
      source: `${originCoords.lat}, ${originCoords.lng}`,
      destination: typeof destination === 'object' 
        ? `${destCoords.lat}, ${destCoords.lng}` 
        : destination,
      distance: parseFloat(route.distance.toFixed(2)),
      eta: Math.round(route.duration),
      path: route.path,
      overviewPolyline: route.geometry,
      steps: route.steps || [], // Include navigation steps
      safety: {
        score: route.safety.safety_score,
        color: route.safety.color,
        rating: route.safety.rating,
        tag: route.safety.rating || route.safety.color, // Use rating as tag
        segmentsMatched: route.safety.segments_matched
      }
    }))

    console.log(`✅ Processed ${routes.length} routes with safety scores`)
    return routes

  } catch (error) {
    console.error('❌ Error fetching routes:', error)
    throw error
  }
}

// Search places using Nominatim via backend
export const searchPlaces = async (query, limit = 5) => {
  try {
    if (!query || query.length < 2) {
      return []
    }

    const response = await fetch(`${API_BASE_URL}/api/search?query=${encodeURIComponent(query)}&limit=${limit}`)
    
    if (!response.ok) {
      throw new Error('Search failed')
    }

    let data = {}
    try {
      data = await response.json()
    } catch (parseError) {
      console.error('❌ Failed to parse search response:', parseError)
      return []
    }
    return data.results || []
  } catch (error) {
    console.error('❌ Error searching places:', error)
    return []
  }
}

// Geocode function using backend search
export const geocodeAddress = async (input) => {
  // Check if input is coordinates
  const coordMatch = input.trim().match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/)
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1])
    const lng = parseFloat(coordMatch[2])
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng, formattedAddress: `${lat}, ${lng}` }
    }
  }

  // Search for place using backend
  try {
    const results = await searchPlaces(input, 1)
    if (results.length > 0) {
      const result = results[0]
      return {
        lat: result.lat,
        lng: result.lng,
        formattedAddress: result.display_name
      }
    }
  } catch (error) {
    console.error('❌ Geocoding error:', error)
  }

  // Fallback to default cities
  return getFallbackLocation(input)
}

function getFallbackLocation(input) {
  const cities = {
    'hyderabad': { lat: 17.3850, lng: 78.4867, formattedAddress: 'Hyderabad, Telangana, India' },
    'mumbai': { lat: 19.0760, lng: 72.8777, formattedAddress: 'Mumbai, Maharashtra, India' },
    'bangalore': { lat: 12.9716, lng: 77.5946, formattedAddress: 'Bangalore, Karnataka, India' },
    'delhi': { lat: 28.7041, lng: 77.1025, formattedAddress: 'Delhi, India' },
    'chennai': { lat: 13.0827, lng: 80.2707, formattedAddress: 'Chennai, Tamil Nadu, India' },
    'kolkata': { lat: 22.5726, lng: 88.3639, formattedAddress: 'Kolkata, West Bengal, India' },
    'pune': { lat: 18.5204, lng: 73.8567, formattedAddress: 'Pune, Maharashtra, India' }
  }
  const key = input.toLowerCase().trim()
  return cities[key] || cities['hyderabad']
}