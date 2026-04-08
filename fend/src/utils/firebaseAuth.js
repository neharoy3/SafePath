import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth'
import { auth } from '../config/firebase'
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { API_BASE_URL } from '../config/api'

const syncUserToBackend = async (userPayload) => {
  try {
    await fetch(`${API_BASE_URL}/users/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userPayload)
    })
  } catch (error) {
    console.error('Error syncing to backend:', error)
  }
}

const fetchUserFromBackend = async (uid) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/${uid}`)
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error('Error fetching user from backend:', error)
    return null
  }
}

/**
 * Register a new user with Firebase Auth and create user document in Firestore
 * Also syncs the user to Supabase via backend
 */
export const registerUser = async (userData) => {
  const { fullName, email, phone, password } = userData
  const normalizedEmail = (email || '').trim().toLowerCase()
  const normalizedName = (fullName || '').trim()
  const normalizedPhone = (phone || '').trim()

  try {
    // Validate inputs
    if (!normalizedName || !normalizedEmail || !normalizedPhone || !password) {
      return { success: false, message: 'All fields are required' }
    }

    if (password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters' }
    }

    // Firebase Auth registration
    const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password)
    const user = userCredential.user

    // Update display name in Firebase
    await updateProfile(user, { displayName: normalizedName })

    // Generate custom user ID
    const userId = `SJ${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`

    const userDoc = {
      id: userId,
      fullName: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      credits: 250000,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    }
    let firestoreSaved = false
    try {
      await setDoc(doc(db, 'users', user.uid), userDoc)
      firestoreSaved = true
    } catch (firestoreError) {
      console.warn('Firestore profile save failed, continuing with backend sync:', firestoreError)
    }

    // Sync user to backend regardless of Firestore outcome
    await syncUserToBackend({
      uid: user.uid,
      email: user.email,
      display_name: normalizedName,
      phone: normalizedPhone,
      photo_url: user.photoURL
    })

    if (!firestoreSaved) {
      console.warn('User registered without Firestore profile; backend fallback will be used when needed.')
    }

    return { success: true, user: { uid: user.uid, ...userDoc } }

  } catch (error) {
    console.error('registerUser error:', error?.code, error?.message)
    let errorMessage = 'Registration failed. Please try again.'

    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'User with this email already exists'
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email address'
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password is too weak'
    } else if (error.code === 'auth/operation-not-allowed') {
      errorMessage = 'Email/password sign-up is not enabled in Firebase'
    } else if (error.code === 'auth/network-request-failed') {
      errorMessage = 'Network error. Please check your connection and try again.'
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many attempts. Please try again later.'
    }

    return { success: false, message: errorMessage }
  }
}

/**
 * Login user with Firebase Auth
 * Also updates lastActiveAt and syncs to Supabase backend
 */
export const loginUser = async (email, password) => {
  try {
    const normalizedEmail = (email || '').trim().toLowerCase()
    const normalizedPassword = (password || '').trim()

    if (!normalizedEmail || !normalizedPassword) {
      return { success: false, message: 'Email and password are required' }
    }

    const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword)
    const user = userCredential.user

    const userDocRef = doc(db, 'users', user.uid)
    const userDocSnap = await getDoc(userDocRef)

    if (userDocSnap.exists()) {
      try {
        await updateDoc(userDocRef, { lastActiveAt: new Date().toISOString() })
      } catch (firestoreError) {
        console.warn('Could not update Firestore lastActiveAt:', firestoreError)
      }

      await syncUserToBackend({
        uid: user.uid,
        email: user.email,
        display_name: user.displayName,
        phone: userDocSnap.data().phone,
        photo_url: user.photoURL
      })

      return { success: true, user: { uid: user.uid, ...userDocSnap.data() } }
    }

    const backendUser = await fetchUserFromBackend(user.uid)
    if (backendUser) {
      await syncUserToBackend({
        uid: user.uid,
        email: backendUser.email || user.email,
        display_name: backendUser.display_name || user.displayName,
        phone: backendUser.phone || null,
        photo_url: user.photoURL,
        latitude: backendUser.latitude ?? null,
        longitude: backendUser.longitude ?? null
      })

      return {
        success: true,
        user: {
          uid: backendUser.uid,
          fullName: backendUser.display_name || user.displayName,
          email: backendUser.email || user.email,
          phone: backendUser.phone || null,
          credits: backendUser.credits ?? 250000
        }
      }
    }

    // If neither Firestore nor backend has a profile, create a minimal one in backend
    await syncUserToBackend({
      uid: user.uid,
      email: user.email,
      display_name: user.displayName,
      phone: null,
      photo_url: user.photoURL
    })

    return {
      success: true,
      user: {
        uid: user.uid,
        fullName: user.displayName || email,
        email: user.email,
        phone: null,
        credits: 250000
      }
    }

  } catch (error) {
    console.error('loginUser error:', error?.code, error?.message)
    let errorMessage = 'Invalid email or password'

    if (error.code === 'auth/user-not-found') errorMessage = 'No account found with this email'
    else if (error.code === 'auth/wrong-password') errorMessage = 'Incorrect password'
    else if (error.code === 'auth/invalid-email') errorMessage = 'Invalid email address'
    else if (error.code === 'auth/invalid-credential') errorMessage = 'Incorrect email or password'
    else if (error.code === 'auth/user-disabled') errorMessage = 'This account has been disabled'
    else if (error.code === 'auth/network-request-failed') errorMessage = 'Network error. Please try again.'

    return { success: false, message: errorMessage }
  }
}

/**
 * Logout user
 */
export const logoutUser = async () => {
  try {
    await signOut(auth)
    return { success: true }
  } catch (error) {
    return { success: false, message: error.message }
  }
}

/**
 * Get current authenticated user
 */
export const getCurrentUser = async () => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribe()

      if (!firebaseUser) {
        resolve(null)
        return
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
        if (userDoc.exists()) {
          resolve({ uid: firebaseUser.uid, ...userDoc.data() })
        } else {
          const backendUser = await fetchUserFromBackend(firebaseUser.uid)
          if (backendUser) {
            resolve({
              uid: backendUser.uid,
              fullName: backendUser.display_name || firebaseUser.displayName || '',
              email: backendUser.email || firebaseUser.email || '',
              phone: backendUser.phone || null,
              credits: backendUser.credits ?? 250000,
              latitude: backendUser.latitude ?? null,
              longitude: backendUser.longitude ?? null,
              emergency_contact_number: backendUser.emergency_contact_number || null
            })
            return
          }

          resolve(null)
        }
      } catch (error) {
        console.error('Error fetching user data from Firestore:', error)
        const backendUser = await fetchUserFromBackend(firebaseUser.uid)
        if (backendUser) {
          resolve({
            uid: backendUser.uid,
            fullName: backendUser.display_name || firebaseUser.displayName || '',
            email: backendUser.email || firebaseUser.email || '',
            phone: backendUser.phone || null,
            credits: backendUser.credits ?? 250000,
            latitude: backendUser.latitude ?? null,
            longitude: backendUser.longitude ?? null,
            emergency_contact_number: backendUser.emergency_contact_number || null
          })
          return
        }

        resolve(null)
      }
    })
  })
}

/**
 * Update user credits in Firestore
 */
export const updateUserCredits = async (userId, newCredits) => {
  try {
    await updateDoc(doc(db, 'users', userId), { credits: newCredits })
    return { success: true }
  } catch (error) {
    console.error('Error updating credits:', error)
    return { success: false, message: error.message }
  }
}
