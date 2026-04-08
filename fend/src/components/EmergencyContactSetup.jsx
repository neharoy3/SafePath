import { useState, useEffect } from 'react'
import { getAuth } from 'firebase/auth'
import { API_BASE_URL } from '../config/api'

const EmergencyContactSetup = ({ onClose, onSuccess }) => {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const auth = getAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const user = auth.currentUser
      if (!user) {
        setError('User not authenticated')
        setLoading(false)
        return
      }

      // Validate phone number
      const phone = phoneNumber.trim()
      if (!phone || phone.length < 10) {
        setError('Please enter a valid phone number (minimum 10 digits)')
        setLoading(false)
        return
      }

      // Call backend to update emergency contact
      const response = await fetch(`${API_BASE_URL}/api/update-emergency-contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: user.uid,
          emergency_contact_number: phone
        })
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess(true)
        
        setTimeout(() => {
          if (onSuccess) onSuccess(phone)
          if (onClose) onClose()
        }, 1500)
      } else {
        setError(data.detail || 'Failed to update emergency contact')
      }
    } catch (err) {
      setError(err.message || 'Error updating emergency contact')
      console.error('Emergency contact update error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-8 max-w-md w-full mx-4 border border-cyan-500/20 shadow-2xl">
        <h2 className="text-2xl font-bold text-cyan-400 mb-2">Emergency Contact</h2>
        <p className="text-slate-300 text-sm mb-6">
          Set your emergency contact number. SMS will be sent to this number when you click SOS.
        </p>

        {success ? (
          <div className="text-center">
            <div className="mb-4 text-5xl">✅</div>
            <p className="text-green-400 font-semibold">Emergency contact saved!</p>
            <p className="text-slate-300 text-sm mt-2">SMS will be sent to {phoneNumber} when you click SOS.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Enter emergency contact number"
                className="w-full px-4 py-3 bg-slate-800 border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                disabled={loading}
              />
              <p className="text-slate-400 text-xs mt-2">Include country code (e.g., +91 for India)</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium disabled:opacity-50 transition"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Saving...
                  </>
                ) : (
                  'Save Contact'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default EmergencyContactSetup
