import { useEffect } from 'react'
import { submitRouteReport, shareNavigationProgress, REPORT_TYPES } from '../utils/reportService'
import { sendSOSAlert } from '../utils/sosService'
import { getCurrentUser } from '../utils/firebaseAuth'

const NavigationPanel = ({ 
  route, 
  userLocation, 
  isNavigating, 
  onStartNavigation, 
  onStopNavigation,
  currentStepIndex,
  nextStep 
}) => { 

  // Parse route steps for navigation
  const getNavigationSteps = () => {
    if (!route || !route.steps || !Array.isArray(route.steps) || route.steps.length === 0) {
      // If no steps, create a simple instruction
      return [{
        index: 0,
        instruction: 'Navigate to destination',
        distance: route?.distance?.toFixed(1) || '0',
        duration: route?.eta || 0,
        type: 'straight',
        modifier: '',
        location: null
      }]
    }
    
    // Process OSRM steps into navigation instructions
    return route.steps.map((step, index) => {
      const maneuver = step.maneuver || {}
      const instruction = getInstruction(maneuver, step)
      const distanceKm = step.distance ? (step.distance / 1000).toFixed(1) : '0'
      const durationMin = step.duration ? Math.round(step.duration / 60) : 0
      
      return {
        index,
        instruction,
        distance: distanceKm,
        duration: durationMin,
        type: maneuver.type || 'straight',
        modifier: maneuver.modifier || '',
        location: step.intersections?.[0]?.location || step.geometry?.coordinates?.[0] || null,
        name: step.name || 'Road'
      }
    })
  }

  // Get human-readable instruction
  const getInstruction = (maneuver, step) => {
    const type = (maneuver.type || 'straight').toLowerCase()
    const modifier = (maneuver.modifier || '').toLowerCase()
    const stepName = step.name || 'road'
    
    const modifierText = {
      'left': 'left',
      'right': 'right',
      'slight left': 'slightly left',
      'slight right': 'slightly right',
      'sharp left': 'sharp left',
      'sharp right': 'sharp right',
      'straight': 'straight',
      'uturn': 'U-turn'
    }[modifier] || modifier

    const instructions = {
      'turn': `Turn ${modifierText || 'left'}`,
      'new name': `Continue on ${stepName}`,
      'depart': 'Start navigation',
      'arrive': 'Arrive at destination',
      'merge': `Merge ${modifierText ? modifierText + ' onto' : ''} ${stepName}`,
      'ramp': `Take ramp ${modifierText ? 'to the ' + modifierText : ''}`,
      'on ramp': `Take on-ramp`,
      'off ramp': `Take off-ramp`,
      'fork': `Take fork ${modifierText ? 'to the ' + modifierText : ''}`,
      'end of road': `Continue to end of road`,
      'continue': `Continue straight on ${stepName}`,
      'roundabout': `Enter roundabout`,
      'rotary': `Enter rotary`,
      'roundabout turn': `Exit roundabout ${modifierText ? 'to the ' + modifierText : ''}`,
      'notification': `Continue on ${stepName}`,
      'exit roundabout': `Exit roundabout ${modifierText ? 'to the ' + modifierText : ''}`,
      'exit rotary': `Exit rotary`,
      'use lane': `Continue on ${stepName}`,
      'straight': `Continue straight on ${stepName}`,
      'ramp right': 'Take ramp to the right',
      'ramp left': 'Take ramp to the left'
    }

    return instructions[type] || `Continue on ${stepName}`
  }

  const steps = getNavigationSteps()
  const currentStep = steps[currentStepIndex] || steps[0]
  const remainingDistance = route?.distance || 0
  const remainingTime = route?.eta || 0

  if (!route) return null

  // Show both pre-navigation and active states
  // Pre-navigation state - Route selected, ready to navigate
  if (!isNavigating) {
    return (
      <div className="fixed bottom-0 right-0 z-40 m-6 max-w-sm">
        <div className="bg-white rounded-lg shadow-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Route Ready</h3>
              <p className="text-sm text-gray-500">{route.distance} km • {route.eta} min</p>
            </div>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              route.safety?.color === 'green' ? 'bg-green-100' :
              route.safety?.color === 'yellow' ? 'bg-yellow-100' :
              'bg-red-100'
            }`}>
              <span className={`text-lg font-bold ${
                route.safety?.color === 'green' ? 'text-green-600' :
                route.safety?.color === 'yellow' ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {route.safety?.score || 'N/A'}/10
              </span>
            </div>
          </div>

          {/* Start Navigation Button */}
          <button
            onClick={() => {
              onStartNavigation()
            }}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Start Navigation</span>
          </button>
        </div>
      </div>
    )
  }

  // Active navigation state - Show at bottom without blocking sidebar
  return (
    <div className="fixed bottom-0 right-0 left-auto z-40 max-w-2xl bg-white shadow-2xl rounded-t-2xl">
      {/* Navigation Header */}
      <div className="px-6 pt-4 pb-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1">
            <div className="text-2xl font-bold text-gray-900">
              {remainingDistance.toFixed(1)} km
            </div>
            <div className="text-sm text-gray-500">
              {remainingTime} min • {route.safety?.rating || 'Safe'} route
            </div>
          </div>
          <button
            onClick={() => {
              onStopNavigation()
            }}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Current Step */}
      {currentStep && (
        <div className="px-6 py-4 bg-blue-50">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0 mt-1">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                {currentStepIndex + 1}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold text-gray-900">
                {currentStep.instruction}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {currentStep.distance} km • {currentStep.duration} min
              </div>
            </div>
            <div className="flex-shrink-0">
              <div className="text-2xl">
                {getManeuverIcon(currentStep.type, currentStep.modifier)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Next Step Preview */}
      {steps[currentStepIndex + 1] && (
        <div className="px-6 py-3 border-t border-gray-200">
          <div className="flex items-center space-x-3 text-sm text-gray-600">
            <span className="font-medium">Then:</span>
            <span>{steps[currentStepIndex + 1].instruction}</span>
            <span className="text-gray-400">•</span>
            <span>{steps[currentStepIndex + 1].distance} km</span>
          </div>
        </div>
      )}

      {/* SOS Button - Always Visible */}
      <div className="px-6 py-2 border-t border-gray-200">
        <button
          onClick={async () => {
            if (!userLocation) {
              alert('Location not available. Please wait for GPS signal.')
              return
            }

            if (!confirm('🚨 Send SOS Emergency Alert?\n\nThis will notify nearby users and emergency services.')) {
              return
            }

            try {
              const user = await getCurrentUser()
              if (!user || !user.uid) {
                alert('⚠️ Please log in to send SOS alert.')
                return
              }

              if (!userLocation || !userLocation.lat || !userLocation.lng) {
                alert('⚠️ Location not available. Please wait for GPS signal.')
                return
              }

              console.log('🆘 Sending SOS alert...', { uid: user.uid, location: userLocation })
              
              const result = await sendSOSAlert(userLocation, user.uid, 'Emergency! I need help!')
              
              if (result.success) {
                alert(`🆘 SOS Alert Sent!\n\n${result.nearbyUsersCount} nearby users have been notified.\nPolice will be alerted if no one responds within 2 minutes.`)
              } else {
                alert(`❌ Failed to send SOS alert:\n${result.message || 'Unknown error'}\n\nPlease call emergency services directly.`)
              }
            } catch (error) {
              console.error('❌ Error sending SOS:', error)
              alert(`❌ Failed to send SOS alert:\n${error.message || 'Network error'}\n\nPlease call emergency services directly.`)
            }
          }}
          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 text-lg"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>SOS Emergency</span>
        </button>
      </div>

      {/* Action Buttons */}
      <div className="px-6 py-3 border-t border-gray-200 grid grid-cols-2 gap-3">
        <button
          onClick={async () => {
            try {
              const user = await getCurrentUser()
              const result = await shareNavigationProgress({
                distanceRemaining: remainingDistance.toFixed(1),
                eta: remainingTime,
                currentLocation: userLocation ? `${userLocation.lat}, ${userLocation.lng}` : 'Unknown'
              })
              
              if (result.success) {
                if (result.method === 'clipboard') {
                  alert('Progress copied to clipboard!')
                }
              } else {
                alert('Failed to share progress. Please try again.')
              }
            } catch (error) {
              console.error('Error sharing progress:', error)
              alert('Failed to share progress. Please try again.')
            }
          }}
          className="py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span>Share Progress</span>
        </button>
        <button
          onClick={async () => {
            if (!userLocation) {
              alert('Location not available. Please wait for GPS signal.')
              return
            }

            const reportModal = document.createElement('div')
            reportModal.className = 'fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center'
            reportModal.innerHTML = `
              <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <h3 class="text-lg font-semibold mb-4 text-gray-900">📝 Add Report</h3>
                <div class="space-y-2">
                  <button data-type="${REPORT_TYPES.CRIME}" class="w-full py-3 px-4 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-left transition-colors">
                    🚨 Crime
                  </button>
                  <button data-type="${REPORT_TYPES.ACCIDENT}" class="w-full py-3 px-4 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-left transition-colors">
                    ⚠️ Accident
                  </button>
                  <button data-type="${REPORT_TYPES.ROAD_DAMAGE}" class="w-full py-3 px-4 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg text-left transition-colors">
                    🚧 Road Damage
                  </button>
                  <button data-type="${REPORT_TYPES.LIGHTING_PROBLEM}" class="w-full py-3 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-left transition-colors">
                    💡 Lighting Problem
                  </button>
                  <button data-type="${REPORT_TYPES.OTHER}" class="w-full py-3 px-4 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-left transition-colors">
                    ⚡ Other
                  </button>
                </div>
                <div class="mt-4 flex space-x-3">
                  <button data-cancel class="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            `
            document.body.appendChild(reportModal)

            // Handle report submission
            reportModal.querySelectorAll('button[data-type]').forEach(btn => {
              btn.addEventListener('click', async () => {
                const reportType = btn.getAttribute('data-type')
                const reportText = btn.textContent.trim()
                
                try {
                  if (!userLocation || !userLocation.lat || !userLocation.lng) {
                    alert('⚠️ Location not available. Please wait for GPS signal.')
                    reportModal.remove()
                    return
                  }

                  const user = await getCurrentUser()
                  
                  console.log('📝 Submitting report...', {
                    type: reportType,
                    location: userLocation,
                    userId: user?.uid
                  })
                  
                  const result = await submitRouteReport({
                    type: reportType,
                    description: reportText,
                    latitude: userLocation.lat,
                    longitude: userLocation.lng,
                    username: user?.displayName || user?.email || user?.fullName,
                    userId: user?.uid
                  })
                  
                  if (result.success) {
                    alert(`✅ Report submitted successfully!\n\nType: ${reportText}\nSafety score updated for this segment.`)
                  } else {
                    const errorMsg = result.error || result.data?.detail || 'Unknown error'
                    alert(`❌ Failed to submit report:\n${errorMsg}\n\nPlease try again.`)
                  }
                } catch (error) {
                  console.error('❌ Error submitting report:', error)
                  alert(`❌ Failed to submit report:\n${error.message || 'Network error'}\n\nPlease try again.`)
                }
                
                reportModal.remove()
              })
            })

            // Handle cancel
            reportModal.querySelector('button[data-cancel]').addEventListener('click', () => {
              reportModal.remove()
            })
          }}
          className="py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span>Add Report</span>
        </button>
      </div>
    </div>
  )
}

// Get maneuver icon
const getManeuverIcon = (type, modifier) => {
  const icons = {
    'turn': modifier === 'left' ? '↶' : modifier === 'right' ? '↷' : '→',
    'straight': '↑',
    'continue': '→',
    'merge': '⇄',
    'roundabout': '↻',
    'fork': '⇶',
    'ramp': '↗',
    'arrive': '✓',
    'depart': '→'
  }
  return icons[type] || '→'
}

export default NavigationPanel

