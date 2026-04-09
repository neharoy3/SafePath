import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth'
import { auth } from './../config/firebase'
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from './../config/firebase'
import { API_BASE_URL } from './../config/api'

// ─── Sync user to backend (best-effort, never blocks auth) ───────────────────
const syncUserToBackend = async (userPayload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userPayload)
    })

    return response.ok
  } catch (error) {
    // Backend sync is best-effort — don't crash auth if backend is down
    console.warn('Backend sync failed (non-fatal):', error)
    return false
  }
}

const fetchUserFromBackend = async (uid) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/${uid}`)
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.warn('Error fetching user from backend:', error)
    return null
  }
}

/**
 * Register a new user.
 * If Firebase says email already exists, we return a clear message
 * instead of leaving the user stuck.
 */
export const registerUser = async (userData) => {
  const { fullName, email, phone, password } = userData

  const normalizedEmail = (email || '').trim().toLowerCase()
  const normalizedName = (fullName || '').trim()
  const normalizedPhone = (phone || '').trim()

  // Basic validation
  if (!normalizedName || !normalizedEmail || !normalizedPhone || !password) {
    return { success: false, message: 'All fields are required' }
  }
  if (password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters' }
  }

  try {
    // Firebase Auth registration
    const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password)
    const user = userCredential.user

    // Update Firebase display name
    await updateProfile(user, { displayName: normalizedName })

    // Generate a simple user ID
    const userId = `${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}_${user.uid}`

    // Save to Firestore
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
      console.warn('Firestore profile save failed, continuing with backend fallback:', firestoreError)
    }

    // Sync to backend (best-effort — never blocks)
    const backendSaved = await syncUserToBackend({
      uid: user.uid,
      email: normalizedEmail,
      display_name: normalizedName,
      phone: normalizedPhone,
      photo_url: user.photoURL
    })

    if (!firestoreSaved && !backendSaved) {
      try {
        await deleteDoc(doc(db, 'users', user.uid))
      } catch (cleanupError) {
        console.warn('Could not remove partial Firestore profile after failed registration:', cleanupError)
      }

      try {
        await deleteUser(user)
      } catch (cleanupError) {
        console.warn('Could not remove Firebase Auth user after failed registration:', cleanupError)
      }

      return {
        success: false,
        message: 'Registration failed. Could not save the account profile.'
      }
    }

    return {
      success: true,
      user: {
        uid: user.uid,
        fullName: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        credits: 250000
      }
    }

  } catch (error) {
    console.error('registerUser error:', error?.code, error?.message)

    let errorMessage = 'Registration failed. Please try again.'

    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'An account with this email already exists. Please log in instead.'
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
 * Login user.
 * Backend sync is best-effort — login succeeds even if backend is unreachable.
 */
export const loginUser = async (email, password) => {
  try {
    const normalizedEmail = (email || '').trim().toLowerCase()
    const normalizedPassword = (password || '').trim()

    if (!normalizedEmail || !normalizedPassword) {
      return { success: false, message: 'Email and password are required' }
    }

    // Firebase Auth sign in
    const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword)
    const user = userCredential.user

    // Try to get profile from Firestore first
    const userDocRef = doc(db, 'users', user.uid)
    const userDocSnap = await getDoc(userDocRef)

    let userData = null

    if (userDocSnap.exists()) {
      // Update last active timestamp (non-blocking)
      try {
        await updateDoc(userDocRef, { lastActiveAt: new Date().toISOString() })
      } catch (e) {
        console.warn('Could not update lastActiveAt:', e)
      }

      // Sync to backend (best-effort)
      await syncUserToBackend({
        uid: user.uid,
        email: user.email,
        display_name: userDocSnap.data().fullName,
        phone: userDocSnap.data().phone,
        photo_url: user.photoURL
      })

      userData = {
        uid: user.uid,
        fullName: userDocSnap.data().fullName,
        email: userDocSnap.data().email,
        phone: userDocSnap.data().phone,
        credits: userDocSnap.data().credits ?? 250000,
        latitude: userDocSnap.data().latitude ?? null,
        longitude: userDocSnap.data().longitude ?? null,
        emergencyContactNumber: userDocSnap.data().emergencyContactNumber ?? null
      }
    } else {
      // No Firestore profile — try backend
      const backendUser = await fetchUserFromBackend(user.uid)

      if (backendUser) {
        // Sync to backend to ensure it's fresh
        await syncUserToBackend({
          uid: user.uid,
          email: user.email,
          display_name: backendUser.display_name,
          phone: backendUser.phone,
          photo_url: user.photoURL
        })

        userData = {
          uid: user.uid,
          fullName: backendUser.display_name || user.displayName || user.email,
          email: backendUser.email || user.email,
          phone: backendUser.phone || null,
          credits: backendUser.credits ?? 250000,
          latitude: backendUser.latitude ?? null,
          longitude: backendUser.longitude ?? null,
          emergencyContactNumber: backendUser.emergencyContactNumber ?? null
        }
      } else {
        try {
          await signOut(auth)
        } catch (signOutError) {
          console.warn('Could not sign out unregistered user after failed login:', signOutError)
        }

        return { success: false, message: 'Account not registered. Please register first.' }
      }
    }

    return { success: true, user: userData }

  } catch (error) {
    console.error('loginUser error:', error?.code, error?.message)

    let errorMessage = 'Invalid email or password'

    if (error.code === 'auth/user-not-found') {
      errorMessage = 'No account found with this email'
    } else if (error.code === 'auth/wrong-password') {
      errorMessage = 'Incorrect password'
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email address'
    } else if (error.code === 'auth/invalid-credential') {
      errorMessage = 'Incorrect email or password'
    } else if (error.code === 'auth/user-disabled') {
      errorMessage = 'This account has been disabled'
    } else if (error.code === 'auth/network-request-failed') {
      errorMessage = 'Network error. Please check your connection and try again.'
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many failed attempts. Please try again later.'
    }

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
 * Get current authenticated user with full profile
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
        const userDocSnap = await getDoc(doc(db, 'users', firebaseUser.uid))

        if (userDocSnap.exists()) {
          resolve({
            uid: firebaseUser.uid,
            fullName: userDocSnap.data().fullName,
            email: userDocSnap.data().email,
            phone: userDocSnap.data().phone,
            credits: userDocSnap.data().credits ?? 250000,
            latitude: userDocSnap.data().latitude ?? null,
            longitude: userDocSnap.data().longitude ?? null,
            emergencyContactNumber: userDocSnap.data().emergencyContactNumber ?? null
          })
        } else {
          // Firestore profile missing — try backend
          const backendUser = await fetchUserFromBackend(firebaseUser.uid)
          if (backendUser) {
            resolve({
              uid: firebaseUser.uid,
              fullName: backendUser.display_name || firebaseUser.displayName || firebaseUser.email,
              email: backendUser.email || firebaseUser.email,
              phone: backendUser.phone || null,
              credits: backendUser.credits ?? 250000,
              latitude: backendUser.latitude ?? null,
              longitude: backendUser.longitude ?? null,
              emergencyContactNumber: backendUser.emergencyContactNumber ?? null
            })
          } else {
              resolve(null)
          }
        }
      } catch (error) {
        console.error('Error fetching user data from Firestore:', error)
          // Fallback to backend only
        const backendUser = await fetchUserFromBackend(firebaseUser.uid)
        if (backendUser) {
          resolve({
            uid: firebaseUser.uid,
            fullName: backendUser.display_name || firebaseUser.displayName || firebaseUser.email,
            email: backendUser.email || firebaseUser.email,
            phone: backendUser.phone || null,
            credits: backendUser.credits ?? 250000,
            latitude: backendUser.latitude ?? null,
            longitude: backendUser.longitude ?? null,
            emergencyContactNumber: backendUser.emergencyContactNumber ?? null
          })
        } else {
          resolve(null)
        }
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