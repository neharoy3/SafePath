import { API_BASE_URL } from '../config/api'

// Report types with safety scores
export const REPORT_TYPES = {
  CRIME: 'crime',
  ACCIDENT: 'accident',
  ROAD_DAMAGE: 'road_damage',
  LIGHTING_PROBLEM: 'lighting_problem',
  OTHER: 'other'
}

/**
 * Submit a route report/incident
 * @param {Object} reportData - { type, description, latitude, longitude, username, userId }
 */
export const submitRouteReport = async (reportData) => {
  try {
    // Validate input
    if (!reportData.type) {
      return { success: false, error: 'Report type is required' }
    }
    
    if (!reportData.latitude || !reportData.longitude) {
      return { success: false, error: 'Location is required' }
    }

    console.log('📝 Submitting report to backend...', reportData)

    const response = await fetch(`${API_BASE_URL}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: reportData.type,
        description: reportData.description || `${reportData.type} reported`,
        latitude: reportData.latitude,
        longitude: reportData.longitude,
        username: reportData.username,
        user_id: reportData.userId
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
      console.error('❌ Report submission failed:', responseData)
      return { 
        success: false, 
        error: responseData.detail || responseData.message || 'Failed to submit report',
        data: responseData
      }
    }

    console.log('✅ Report submitted successfully:', responseData)
    return { success: true, data: responseData }
  } catch (error) {
    console.error('❌ Error submitting report:', error)
    return { 
      success: false, 
      error: error.message || 'Network error. Please check your connection and try again.' 
    }
  }
}

/**
 * Get reports for a segment
 * @param {number} segmentId - Segment ID
 */
export const getSegmentReports = async (segmentId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/segments/${segmentId}/reports`)
    
    if (!response.ok) {
      throw new Error('Failed to fetch segment reports')
    }

    let data = {}
    try {
      data = await response.json()
    } catch (parseError) {
      console.error('❌ Failed to parse segment reports response:', parseError)
      return { success: false, error: 'Invalid server response' }
    }
    return { success: true, data }
  } catch (error) {
    console.error('❌ Error fetching segment reports:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get segment information by location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 */
export const getSegmentByLocation = async (lat, lng) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/segments/by-location?lat=${lat}&lon=${lng}`)
    
    if (!response.ok) {
      throw new Error('Failed to fetch segment')
    }

    let data = {}
    try {
      data = await response.json()
    } catch (parseError) {
      console.error('❌ Failed to parse segment response:', parseError)
      return { success: false, error: 'Invalid server response' }
    }
    return { success: true, data }
  } catch (error) {
    console.error('❌ Error fetching segment:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Share navigation progress
 */
export const shareNavigationProgress = async (progressData) => {
  try {
    // Use Web Share API if available
    if (navigator.share) {
      await navigator.share({
        title: 'SafePath Navigation',
        text: `I'm navigating to my destination. ${progressData.distanceRemaining} km remaining. ETA: ${progressData.eta} minutes.`,
        url: window.location.href
      })
      return { success: true, method: 'native' }
    } else {
      // Fallback: Copy to clipboard
      const text = `SafePath Navigation\nDistance: ${progressData.distanceRemaining} km\nETA: ${progressData.eta} minutes\nLocation: ${progressData.currentLocation}`
      await navigator.clipboard.writeText(text)
      return { success: true, method: 'clipboard' }
    }
  } catch (error) {
    console.error('❌ Error sharing progress:', error)
    return { success: false, error: error.message }
  }
}

export default {
  submitRouteReport,
  shareNavigationProgress
}

