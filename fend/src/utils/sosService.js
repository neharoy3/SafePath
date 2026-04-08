import { API_BASE_URL } from '../config/api'

/**
 * Send SOS emergency alert
 * @param {Object} location - { lat, lng } current location
 * @param {string} userId - User ID
 * @param {string} message - Optional message
 * @returns {Promise<Object>} Success status and alert ID
 */
export const sendSOSAlert = async (location, userId, message = null) => {
  try {
    if (!userId) {
      return { success: false, message: 'User ID is required' }
    }

    if (!location || !location.lat || !location.lng) {
      return { success: false, message: 'Location is required' }
    }

    console.log('🆘 Sending SOS alert to backend...', { userId, location, message })

    const response = await fetch(`${API_BASE_URL}/api/sos/alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        latitude: location.lat,
        longitude: location.lng,
        message: message || 'Emergency! I need help!'
      })
    })

    let responseData = {}
    try {
      responseData = await response.json()
    } catch (parseError) {
      console.error('❌ Failed to parse response as JSON:', parseError)
      responseData = { detail: 'Invalid server response' }
    }

    if (!response.ok) {
      console.error('❌ SOS alert failed:', responseData)
      return {
        success: false,
        message: responseData.detail || responseData.message || 'Failed to send SOS alert'
      }
    }

    console.log('✅ SOS alert sent successfully:', responseData)
    
    return {
      success: true,
      alertId: responseData.alert_id,
      message: responseData.message,
      nearbyUsersCount: responseData.nearby_users_count || 0,
      nearbyUsers: responseData.nearby_users || [],
      policeAlertScheduled: responseData.police_alert_scheduled
    }
  } catch (error) {
    console.error('❌ Error sending SOS alert:', error)
    return {
      success: false,
      message: error.message || 'Network error. Please check your connection and call emergency services directly.'
    }
  }
}

/**
 * Respond to SOS alert as a helper
 * @param {string} alertId - SOS alert ID
 * @param {string} helperId - Helper user ID
 * @param {Object} helperLocation - { lat, lng } helper location
 * @returns {Promise<Object>} Response with route information
 */
export const respondToSOS = async (alertId, helperId, helperLocation) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sos/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert_id: alertId,
        helper_id: helperId,
        helper_latitude: helperLocation.lat,
        helper_longitude: helperLocation.lng
      })
    })

    if (!response.ok) {
      throw new Error('Failed to respond to SOS')
    }

    let data = {}
    try {
      data = await response.json()
    } catch (parseError) {
      console.error('❌ Failed to parse respond SOS response:', parseError)
      return { success: false, message: 'Invalid server response' }
    }
    return data
  } catch (error) {
    console.error('Error responding to SOS:', error)
    return { success: false, message: error.message }
  }
}

/**
 * Resolve SOS alert when helper reaches user
 * @param {string} alertId - SOS alert ID
 * @param {string} helperId - Helper user ID
 * @param {Object} helperLocation - { lat, lng } helper location
 * @param {number} creditPoints - Credit points to award (default 100)
 * @returns {Promise<Object>} Resolution status
 */
export const resolveSOS = async (alertId, helperId, helperLocation, creditPoints = 100) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sos/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert_id: alertId,
        helper_id: helperId,
        helper_latitude: helperLocation.lat,
        helper_longitude: helperLocation.lng,
        credit_points: creditPoints
      })
    })

    if (!response.ok) {
      throw new Error('Failed to resolve SOS')
    }

    let data = {}
    try {
      data = await response.json()
    } catch (parseError) {
      console.error('❌ Failed to parse resolve SOS response:', parseError)
      return { success: false, message: 'Invalid server response' }
    }
    return data
  } catch (error) {
    console.error('Error resolving SOS:', error)
    return { success: false, message: error.message }
  }
}

/**
 * Get active SOS alerts
 * @returns {Promise<Object>} List of active SOS alerts
 */
export const getActiveSOSAlerts = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sos/active`)
    
    if (!response.ok) {
      throw new Error('Failed to fetch active SOS alerts')
    }

    let data = {}
    try {
      data = await response.json()
    } catch (parseError) {
      console.error('❌ Failed to parse active SOS alerts response:', parseError)
      return { count: 0, alerts: [] }
    }
    return data
  } catch (error) {
    console.error('Error fetching active SOS alerts:', error)
    return { count: 0, alerts: [] }
  }
}

export default {
  sendSOSAlert,
  respondToSOS,
  resolveSOS,
  getActiveSOSAlerts
}

