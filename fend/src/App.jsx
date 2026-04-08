import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './config/firebase'
import { getCurrentUser } from './utils/firebaseAuth'
import { ROUTES } from './utils/routes'
import AuthPage from './components/AuthPage'
import PreferencesPage from './components/PreferencesPage'
import JourneyPlanner from './components/JourneyPlanner'
import SingleRouteView from './components/SingleRouteView'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [preferencesCompleted, setPreferencesCompleted] = useState(false)

  useEffect(() => {
    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Verify user data exists in Firestore
        const user = await getCurrentUser()
        setIsAuthenticated(!!user)
        // Check if preferences were completed in this session
        const prefs = sessionStorage.getItem('preferencesCompleted')
        setPreferencesCompleted(!!prefs)
      } else {
        setIsAuthenticated(false)
        setPreferencesCompleted(false)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-bg">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <Router>
      <Routes>
        <Route 
          path={ROUTES.ROOT} 
          element={
            isAuthenticated ? <Navigate to={preferencesCompleted ? ROUTES.JOURNEY_PLANNER : ROUTES.PREFERENCES} /> : <Navigate to={ROUTES.LOGIN} />
          } 
        />
        <Route 
          path={ROUTES.LOGIN} 
          element={
            isAuthenticated ? <Navigate to={preferencesCompleted ? ROUTES.JOURNEY_PLANNER : ROUTES.PREFERENCES} /> : <AuthPage setIsAuthenticated={setIsAuthenticated} />
          } 
        />
        <Route 
          path={ROUTES.PREFERENCES} 
          element={
            isAuthenticated ? (
              <PreferencesPage onComplete={() => {
                sessionStorage.setItem('preferencesCompleted', 'true')
                setPreferencesCompleted(true)
              }} />
            ) : <Navigate to={ROUTES.LOGIN} />
          } 
        />
        <Route 
          path={ROUTES.JOURNEY_PLANNER} 
          element={
            isAuthenticated ? <JourneyPlanner /> : <Navigate to={ROUTES.LOGIN} />
          } 
        />
        <Route 
          path={ROUTES.JOURNEY_ALIAS} 
          element={
            isAuthenticated ? <JourneyPlanner /> : <Navigate to={ROUTES.LOGIN} />
          } 
        />
        <Route 
          path={ROUTES.ROUTE_DETAILS} 
          element={
            isAuthenticated ? <SingleRouteView /> : <Navigate to={ROUTES.LOGIN} />
          } 
        />
        <Route
          path="*"
          element={<Navigate to={ROUTES.ROOT} replace />}
        />
      </Routes>
    </Router>
  )
}

export default App

