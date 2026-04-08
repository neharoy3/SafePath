import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { registerUser, loginUser } from '../utils/firebaseAuth'
import { ROUTES } from '../utils/routes'

const AuthPage = ({ setIsAuthenticated }) => {
  const [activeTab, setActiveTab] = useState('login')
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setShowSplash(false)
    }, 1500)
    return () => clearTimeout(splashTimer)
  }, [])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
    setError('')
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    try {
      const result = await registerUser(formData)
      
      if (result.success) {
        setIsAuthenticated(true)
        // Show success toast
        const toast = document.createElement('div')
        toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2'
        toast.innerHTML = '<span>✅</span> <span>Registration successful</span>'
        document.body.appendChild(toast)
        setTimeout(() => {
          toast.remove()
        }, 3000)
        navigate(ROUTES.PREFERENCES)
      } else {
        setError(result.message)
      }
    } catch (error) {
      setError('An error occurred during registration. Please try again.')
    }
    
    setLoading(false)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await loginUser(formData.email, formData.password)
      
      if (result.success) {
        setIsAuthenticated(true)
        // Show success toast
        const toast = document.createElement('div')
        toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2'
        toast.innerHTML = '<span>✅</span> <span>Login successful</span>'
        document.body.appendChild(toast)
        setTimeout(() => {
          toast.remove()
        }, 3000)
        navigate(ROUTES.PREFERENCES)
      } else {
        setError(result.message)
      }
    } catch (error) {
      setError('An error occurred during login. Please try again.')
    }
    
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{
      background: 'linear-gradient(135deg, #0a0a0a 0%, #121212 100%)',
      minHeight: '100vh',
      width: '100%'
    }}>
      {/* Full-screen map background image with animation */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat" 
        style={{ 
          backgroundImage: "url('https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/0,20,2.5,0,0/1200x800@2x?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw')",
          backgroundAttachment: 'fixed',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          animation: 'mapFloat 20s ease-in-out infinite'
        }} 
        aria-hidden="true" 
      />
      
      {/* Translucent dark overlay for readability - less opaque */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/50" aria-hidden="true" style={{
        animation: 'overlayPulse 8s ease-in-out infinite'
      }} />
      
      {/* Animated grid overlay for tech effect */}
      <div className="absolute inset-0 pointer-events-none opacity-10" aria-hidden="true" style={{
        backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(59, 130, 246, 0.3) 25%, rgba(59, 130, 246, 0.3) 26%, transparent 27%, transparent 74%, rgba(59, 130, 246, 0.3) 75%, rgba(59, 130, 246, 0.3) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(59, 130, 246, 0.3) 25%, rgba(59, 130, 246, 0.3) 26%, transparent 27%, transparent 74%, rgba(59, 130, 246, 0.3) 75%, rgba(59, 130, 246, 0.3) 76%, transparent 77%, transparent)',
        backgroundSize: '50px 50px',
        animation: 'gridMove 15s linear infinite'
      }} />

      {/* Splash Screen - SafePath */}
      {showSplash && (
        <div className="fixed inset-0 flex items-center justify-center z-50 animate-[fadeInUp_0.6s_ease-out_forwards]">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-white mb-4 animate-[fadeInUp_0.8s_ease-out_forwards]">SafePath</h1>
            {/* <p className="text-xl text-white/70 animate-[fadeInUp_1s_ease-out_forwards]">made by MINDIMMAXDEV</p> */}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-blue-900/70 animate-[fadeOut_0.6s_ease-out_forwards_1.3s] pointer-events-none" />
        </div>
      )}

      {/* Neon glow effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500 rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Scrollable form container */}
      <div className={`w-full max-w-lg sm:max-w-xl lg:max-w-2xl mx-auto rounded-2xl border border-white/20 bg-white/5 backdrop-blur-md p-8 md:p-10 shadow-2xl transition-all duration-500 relative z-10 max-h-[90vh] overflow-y-auto ${showSplash ? 'opacity-0' : 'opacity-100'} ${!showSplash && 'animate-[fadeInUp_0.6s_ease-out_forwards]'}`}
        style={{
          scrollBehavior: 'smooth'
        }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 mb-4 shadow-lg shadow-blue-500/50">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">SafePath</h1>
          <p className="text-white/70 text-sm">Your trusted companion for safe navigation</p>
        </div>

        {/* Tabs */}
        <div className="flex mb-6 bg-white/10 rounded-xl p-1 border border-white/10">
          <button
            onClick={() => {
              setActiveTab('login')
              setError('')
            }}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'login'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => {
              setActiveTab('register')
              setError('')
            }}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'register'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Register
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Forms */}
        <form onSubmit={activeTab === 'login' ? handleLogin : handleRegister} className="space-y-6">
          {activeTab === 'register' && (
            <div>
              <label className="block text-base text-white mb-2">
                Full Name
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" aria-hidden="true">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-white/20 bg-white/10 text-white px-4 py-3 placeholder-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:bg-white/15 pl-10"
                  placeholder="John Doe"
                  required={activeTab === 'register'}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-base text-white mb-2">
              Email
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" aria-hidden="true">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/20 bg-white/10 text-white px-4 py-3 placeholder-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:bg-white/15 pl-10"
                placeholder="john@example.com"
                required
              />
            </div>
          </div>

          {activeTab === 'register' && (
            <div>
              <label className="block text-base text-white mb-2">
                Phone Number
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" aria-hidden="true">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 00.948.684l1.498 7.492a1 1 0 00.502.984l-1.494 2.991a1 1 0 00.148 1.07A9.998 9.998 0 0021 9c0-4.971-4.029-9-9-9s-9 4.029-9 9z" />
                  </svg>
                </span>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-white/20 bg-white/10 text-white px-4 py-3 placeholder-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:bg-white/15 pl-10"
                  placeholder="+1 234 567 8900"
                  required={activeTab === 'register'}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-base text-white mb-2">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" aria-hidden="true">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/20 bg-white/10 text-white px-4 py-3 placeholder-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:bg-white/15 pl-10"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {activeTab === 'register' && (
            <div>
              <label className="block text-base text-white mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" aria-hidden="true">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-white/20 bg-white/10 text-white px-4 py-3 placeholder-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:bg-white/15 pl-10"
                  placeholder="••••••••"
                  required={activeTab === 'register'}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-base font-medium hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] transition shadow-lg shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : activeTab === 'login' ? 'Login' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default AuthPage

