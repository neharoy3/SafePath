/**
 * Universal Device Location Service
 * Works with all devices: Mobile, Desktop, Tablet
 * Uses best available location source: GPS, WiFi, IP
 */

/**
 * Detect device type and capabilities
 */
export const detectDevice = () => {
  const ua = navigator.userAgent || navigator.vendor || window.opera
  
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua.toLowerCase())
  const isTablet = /ipad|android(?!.*mobile)|tablet/i.test(ua.toLowerCase())
  const isDesktop = !isMobile && !isTablet
  
  const hasGPS = 'geolocation' in navigator
  const hasHighAccuracy = hasGPS && 'watchPosition' in navigator.geolocation
  
  return {
    isMobile,
    isTablet,
    isDesktop,
    hasGPS,
    hasHighAccuracy,
    userAgent: ua
  }
}

/**
 * Get location from device using best available method
 * Falls back through: GPS -> WiFi -> IP-based
 */
export const getDeviceLocation = (options = {}) => {
  return new Promise((resolve, reject) => {
    const device = detectDevice()
    
    // Default options optimized for device type
    const defaultOptions = {
      enableHighAccuracy: device.isMobile || device.isTablet, // Mobile devices have better GPS
      timeout: device.isMobile ? 8000 : 5000, // Reduced timeout for faster fallback
      maximumAge: 0, // Always get fresh location
      ...options
    }
    
    if (!navigator.geolocation) {
      // Fallback to IP-based location if geolocation not available
      console.warn('⚠️ Geolocation not available, trying IP-based location...')
      getIPBasedLocation()
        .then(resolve)
        .catch(() => reject(new Error('Location services not available')))
      return
    }
    
    console.log(`📍 Getting location from ${device.isMobile ? 'Mobile' : device.isDesktop ? 'Desktop' : 'Tablet'} device...`)
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp,
          source: getLocationSource(position.coords.accuracy, device)
        }
        
        console.log(`✅ Location obtained from ${location.source}:`, {
          lat: location.lat.toFixed(6),
          lng: location.lng.toFixed(6),
          accuracy: `${Math.round(location.accuracy)}m`,
          device: device.isMobile ? 'Mobile' : device.isDesktop ? 'Desktop' : 'Tablet'
        })
        
        resolve(location)
      },
      (error) => {
        console.error('❌ Geolocation error:', error)
        
        // Try IP-based fallback
        if (error.code === 1 || error.code === 2) {
          console.log('🔄 Trying IP-based location as fallback...')
          getIPBasedLocation()
            .then(resolve)
            .catch(() => reject(error))
        } else {
          reject(error)
        }
      },
      defaultOptions
    )
  })
}

/**
 * Watch device location continuously
 */
export const watchDeviceLocation = (callback, errorCallback, options = {}) => {
  const device = detectDevice()
  
  const defaultOptions = {
    enableHighAccuracy: device.isMobile || device.isTablet,
    timeout: device.isMobile ? 8000 : 5000, // Reduced for faster fallback
    maximumAge: 0,
    ...options
  }
  
  if (!navigator.geolocation) {
    console.error('❌ Geolocation not available')
    if (errorCallback) {
      errorCallback(new Error('Geolocation not available'))
    }
    return null
  }
  
  return navigator.geolocation.watchPosition(
    (position) => {
      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: position.timestamp,
        source: getLocationSource(position.coords.accuracy, device)
      }
      
      callback(location)
    },
    errorCallback,
    defaultOptions
  )
}

/**
 * Determine location source based on accuracy
 */
const getLocationSource = (accuracy, device) => {
  if (accuracy < 20) {
    return 'GPS' // High accuracy = GPS
  } else if (accuracy < 100) {
    return device.isMobile ? 'GPS/WiFi' : 'WiFi'
  } else if (accuracy < 1000) {
    return 'WiFi/Cell Tower'
  } else {
    return 'IP-based'
  }
}

/**
 * Fallback: Get location from IP address (less accurate)
 */
const getIPBasedLocation = () => {
  return new Promise((resolve, reject) => {
    // Use a free IP geolocation service
    fetch('https://ipapi.co/json/')
      .then(response => response.json())
      .then(data => {
        if (data.latitude && data.longitude) {
          console.log('✅ IP-based location obtained:', {
            lat: data.latitude,
            lng: data.longitude,
            city: data.city,
            country: data.country_name
          })
          
          resolve({
            lat: data.latitude,
            lng: data.longitude,
            accuracy: 10000, // IP-based is very inaccurate
            source: 'IP-based',
            city: data.city,
            country: data.country_name
          })
        } else {
          reject(new Error('IP location not available'))
        }
      })
      .catch(error => {
        console.error('❌ IP location service error:', error)
        reject(error)
      })
  })
}

/**
 * Get optimal update interval based on device and movement
 */
export const getOptimalUpdateInterval = (device, isMoving = false) => {
  if (device.isMobile) {
    return isMoving ? 2000 : 5000 // More frequent updates when moving on mobile
  } else if (device.isTablet) {
    return isMoving ? 3000 : 6000
  } else {
    return isMoving ? 5000 : 10000 // Desktop updates less frequently
  }
}

export default {
  detectDevice,
  getDeviceLocation,
  watchDeviceLocation,
  getOptimalUpdateInterval
}

