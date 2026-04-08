import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import { ROUTES } from '../utils/routes'
import { API_BASE_URL } from '../config/api'

const PreferencesPage = ({ onComplete }) => {
  const navigate = useNavigate()
  const [preferences, setPreferences] = useState({
    gender: '',
    age: '',
    transport: '',
    emergencyContact: '',
    transportTimes: {
      morning: false,
      afternoon: false,
      evening: false,
      night: false
    }
  })
  const [error, setError] = useState('')

  const handleGenderChange = (value) => {
    setPreferences(prev => ({ ...prev, gender: value }))
  }

  const handleAgeChange = (value) => {
    setPreferences(prev => ({ ...prev, age: value }))
  }

  const handleTransportChange = (value) => {
    setPreferences(prev => ({ ...prev, transport: value }))
  }

  const handleTimeToggle = (time) => {
    setPreferences(prev => ({
      ...prev,
      transportTimes: {
        ...prev.transportTimes,
        [time]: !prev.transportTimes[time]
      }
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    // Validate all fields are filled
    if (!preferences.gender || !preferences.age || !preferences.transport) {
      setError('Please fill in all fields')
      return
    }

    // Validate emergency contact
    if (!preferences.emergencyContact || !preferences.emergencyContact.trim()) {
      setError('Please provide an emergency contact phone number')
      return
    }

    // Basic phone number validation (must have at least 10 digits)
    const phoneDigits = preferences.emergencyContact.replace(/\D/g, '')
    if (phoneDigits.length < 10) {
      setError('Please enter a valid phone number (minimum 10 digits)')
      return
    }

    // Check if at least one time is selected
    const hasTimeSelected = Object.values(preferences.transportTimes).some(v => v === true)
    if (!hasTimeSelected) {
      setError('Please select at least one time period for your transport')
      return
    }

    console.log('Preferences set:', preferences)
    
    // Save emergency contact to backend
    saveEmergencyContact()
    
    // Mark preferences as completed in session storage
    sessionStorage.setItem('preferencesCompleted', 'true')
    
    // Navigate to journey planner page
    navigate(ROUTES.JOURNEY_PLANNER, { replace: true })
  }

  const saveEmergencyContact = async () => {
    try {
      const auth = getAuth()
      const user = auth.currentUser
      
      if (!user) {
        console.warn('⚠️ Not authenticated, skipping emergency contact save')
        return
      }

      const idToken = await user.getIdToken()

      const response = await fetch(`${API_BASE_URL}/api/update-emergency-contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          uid: user.uid,
          emergency_contact_number: preferences.emergencyContact
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.warn('⚠️ Failed to save emergency contact:', errorData.detail || 'Unknown error')
      } else {
        const data = await response.json()
        console.log('✅ Emergency contact saved:', data)
      }
    } catch (error) {
      console.error('❌ Error saving emergency contact:', error)
    }
  }

  const handleSkip = () => {
    // Mark preferences as completed in session storage
    sessionStorage.setItem('preferencesCompleted', 'true')
    
    // Skip preferences and go to journey planner
    navigate(ROUTES.JOURNEY_PLANNER, { replace: true })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent mb-2">
            Tell Us About You
          </h1>
          <p className="text-slate-400">Help us personalize your safety journey</p>
        </div>

        {/* Form Card */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 border border-cyan-500/20 shadow-2xl">
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Gender Selection */}
            <div className="mb-8">
              <label className="block text-lg font-semibold text-cyan-400 mb-4">
                Gender
              </label>
              <div className="grid grid-cols-3 gap-3">
                {['Male', 'Female', 'Other'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleGenderChange(option)}
                    className={`py-3 px-4 rounded-lg font-medium transition ${
                      preferences.gender === option
                        ? 'bg-cyan-500 text-white border-2 border-cyan-400'
                        : 'bg-slate-700 text-slate-300 border-2 border-slate-600 hover:border-cyan-400'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Age Selection */}
            <div className="mb-8">
              <label className="block text-lg font-semibold text-cyan-400 mb-4">
                Age Group
              </label>
              <select
                value={preferences.age}
                onChange={(e) => handleAgeChange(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border-2 border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              >
                <option value="">Select your age group</option>
                <option value="13-17">13 - 17</option>
                <option value="18-25">18 - 25</option>
                <option value="26-35">26 - 35</option>
                <option value="36-45">36 - 45</option>
                <option value="46-55">46 - 55</option>
                <option value="56+">56+</option>
              </select>
            </div>

            {/* Transport Mode */}
            <div className="mb-8">
              <label className="block text-lg font-semibold text-cyan-400 mb-4">
                Means of Transport
              </label>
              <div className="grid grid-cols-2 gap-3">
                {['Walking', 'Transport'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleTransportChange(option)}
                    className={`py-3 px-4 rounded-lg font-medium transition ${
                      preferences.transport === option
                        ? 'bg-cyan-500 text-white border-2 border-cyan-400'
                        : 'bg-slate-700 text-slate-300 border-2 border-slate-600 hover:border-cyan-400'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="mb-8">
              <label className="block text-lg font-semibold text-cyan-400 mb-4">
                🆘 Emergency Contact Phone
              </label>
              <input
                type="tel"
                placeholder="Enter phone number (with country code, e.g., +91 6303369449)"
                value={preferences.emergencyContact}
                onChange={(e) => setPreferences(prev => ({ ...prev, emergencyContact: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-700 border-2 border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              />
              <p className="text-slate-400 text-xs mt-2">This number will receive emergency alerts if you use the SOS button</p>
            </div>

            {/* Time Preferences for Transport */}
            {preferences.transport && (
              <div className="mb-8">
                <label className="block text-lg font-semibold text-cyan-400 mb-4">
                  When do you use {preferences.transport.toLowerCase()}?
                </label>
                <p className="text-slate-400 text-sm mb-4">Select all that apply</p>
                <div className="space-y-3">
                  {[
                    { id: 'morning', label: '🌅 Morning (6 AM - 12 PM)' },
                    { id: 'afternoon', label: '☀️ Afternoon (12 PM - 6 PM)' },
                    { id: 'evening', label: '🌆 Evening (6 PM - 9 PM)' },
                    { id: 'night', label: '🌙 Night (9 PM - 6 AM)' }
                  ].map((time) => (
                    <label key={time.id} className="flex items-center cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={preferences.transportTimes[time.id]}
                        onChange={() => handleTimeToggle(time.id)}
                        className="w-5 h-5 rounded border-2 border-slate-600 bg-slate-700 checked:bg-cyan-500 checked:border-cyan-400 cursor-pointer accent-cyan-500"
                      />
                      <span className="ml-3 text-slate-300 group-hover:text-cyan-400 transition">
                        {time.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-4 mt-8">
              <button
                type="button"
                onClick={handleSkip}
                className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold rounded-lg transition"
              >
                Skip
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold rounded-lg transition shadow-lg hover:shadow-cyan-500/50"
              >
                Continue
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 text-sm mt-6">
          These preferences help us provide better safety insights
        </p>
      </div>
    </div>
  )
}

export default PreferencesPage
