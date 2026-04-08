import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'

// Firebase configuration
// TODO: Replace with your actual Firebase config
// Get this from: Firebase Console > Project Settings > General > Your apps
const firebaseConfig = {
  apiKey: "AIzaSyAmhl9Fu10VPYj-lbQ0TJizwv_gyrLSgss",
  authDomain: "safejourney-mindmaxdev.firebaseapp.com",
  projectId: "safejourney-mindmaxdev",
  storageBucket: "safejourney-mindmaxdev.appspot.com",
  messagingSenderId: "224239392541",
  appId: "1:224239392541:web:d2c181f06c206c894a33f4",
  databaseURL: "https://safejourney-mindmaxdev-default-rtdb.firebaseio.com"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firebase services
export const auth = getAuth(app)
export const db = getFirestore(app)
export const realtimeDb = getDatabase(app)

export default app

