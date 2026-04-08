import { ref, set, onValue, off, serverTimestamp } from 'firebase/database'
import { realtimeDb } from '../config/firebase'

/**
 * Share user's real-time location
 * @param {string} userId - User ID
 * @param {Object} location - { lat, lng } coordinates
 */
export const shareLocation = async (userId, location) => {
  try {
    const locationRef = ref(realtimeDb, `locations/${userId}`)
    
    await set(locationRef, {
      lat: location.lat,
      lng: location.lng,
      timestamp: serverTimestamp(),
      isActive: true
    })
    
    return { success: true }
  } catch (error) {
    console.error('Error sharing location:', error)
    return { success: false, message: error.message }
  }
}

/**
 * Stop sharing location
 * @param {string} userId - User ID
 */
export const stopSharingLocation = async (userId) => {
  try {
    const locationRef = ref(realtimeDb, `locations/${userId}`)
    
    await set(locationRef, {
      isActive: false,
      timestamp: serverTimestamp()
    })
    
    return { success: true }
  } catch (error) {
    console.error('Error stopping location share:', error)
    return { success: false, message: error.message }
  }
}

/**
 * Subscribe to real-time location updates
 * @param {Function} callback - Callback function that receives active locations
 * @returns {Function} Unsubscribe function
 */
export const subscribeToActiveLocations = (callback) => {
  const locationsRef = ref(realtimeDb, 'locations')
  
  const unsubscribe = onValue(locationsRef, (snapshot) => {
    const locations = []
    const data = snapshot.val()
    
    if (data) {
      Object.keys(data).forEach(userId => {
        const location = data[userId]
        // Only include active locations from the last 5 minutes
        if (location.isActive && location.lat && location.lng) {
          locations.push({
            userId,
            lat: location.lat,
            lng: location.lng,
            timestamp: location.timestamp
          })
        }
      })
    }
    
    callback(locations)
  })
  
  return () => off(locationsRef)
}

/**
 * Get active user locations within a radius
 * @param {Object} center - { lat, lng } center point
 * @param {number} radiusKm - Radius in kilometers
 * @param {Function} callback - Callback function
 * @returns {Function} Unsubscribe function
 */
export const subscribeToNearbyLocations = (center, radiusKm, callback) => {
  return subscribeToActiveLocations((locations) => {
    const nearbyLocations = locations.filter(loc => {
      const distance = calculateDistance(
        center.lat,
        center.lng,
        loc.lat,
        loc.lng
      )
      return distance <= radiusKm
    })
    callback(nearbyLocations)
  })
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c
  
  return distance
}

