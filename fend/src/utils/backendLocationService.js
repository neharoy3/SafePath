import { API_BASE_URL } from '../config/api'

/**
 * Update user location in PostgreSQL via backend
 */
export const updateUserLocationInDB = async (uid, location) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/update-location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: uid,
        latitude: location.lat,
        longitude: location.lng
      })
    })

    if (!response.ok) {
      let errorData = {}
      try {
        errorData = await response.json()
      } catch (parseError) {
        console.error('❌ Failed to parse error response:', parseError)
        throw new Error('Failed to update location')
      }
      throw new Error(errorData.detail || 'Failed to update location')
    }

    let data = {}
    try {
      data = await response.json()
    } catch (parseError) {
      console.error('❌ Failed to parse location update response:', parseError)
      throw new Error('Invalid server response')
    }
    console.log('✅ Location updated in PostgreSQL:', data)
    return data
  } catch (error) {
    console.error('❌ Error updating location in backend:', error)
    throw error
  }
}

/**
 * Get user's last known location from PostgreSQL
 */
export const getUserLocationFromDB = async (uid) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user-location/${uid}`)
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('📍 User location not found in database')
        return null
      }
      throw new Error('Failed to fetch user location')
    }

    let data = {}
    try {
      data = await response.json()
    } catch (parseError) {
      console.error('❌ Failed to parse user location response:', parseError)
      return null
    }
    if (data.success && data.location) {
      console.log('✅ Fetched user location from PostgreSQL:', data.location)
      return {
        lat: data.location.latitude,
        lng: data.location.longitude
      }
    }
    return null
  } catch (error) {
    console.error('❌ Error fetching user location from database:', error)
    return null
  }
}

/**
 * Get active users from PostgreSQL
 */
export const getActiveUsersFromDB = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/active-users`)
    
    if (!response.ok) {
      throw new Error('Failed to fetch active users')
    }

    let data = {}
    try {
      data = await response.json()
    } catch (parseError) {
      console.error('❌ Failed to parse active users response:', parseError)
      return []
    }
    console.log(`📍 Fetched ${data.count} active users from PostgreSQL`)
    return data.users
  } catch (error) {
    console.error('❌ Error fetching active users:', error)
    return []
  }
}