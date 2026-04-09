import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  deleteUser,
  linkWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { auth } from "./../config/firebase";
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "./../config/firebase";
import { API_BASE_URL } from "./../config/api";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const PENDING_GOOGLE_LINK_KEY = "pendingGoogleLinkCredential";

const savePendingGoogleCredential = (credential) => {
  if (!credential) return;

  const pendingCredential = {
    providerId: credential.providerId || "google.com",
    signInMethod: credential.signInMethod || "google.com",
    accessToken: credential.accessToken || null,
    idToken: credential.idToken || null,
  };

  sessionStorage.setItem(
    PENDING_GOOGLE_LINK_KEY,
    JSON.stringify(pendingCredential),
  );
};

const getPendingGoogleCredential = () => {
  try {
    const stored = sessionStorage.getItem(PENDING_GOOGLE_LINK_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    if (!parsed?.accessToken && !parsed?.idToken) return null;

    return GoogleAuthProvider.credential(
      parsed.idToken || null,
      parsed.accessToken || null,
    );
  } catch (error) {
    console.warn("Could not read pending Google credential:", error);
    return null;
  }
};

const clearPendingGoogleCredential = () => {
  sessionStorage.removeItem(PENDING_GOOGLE_LINK_KEY);
};

// ─── Sync user to backend (best-effort, never blocks auth) ───────────────────
const syncUserToBackend = async (userPayload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userPayload),
    });

    return response.ok;
  } catch (error) {
    // Backend sync is best-effort — don't crash auth if backend is down
    console.warn("Backend sync failed (non-fatal):", error);
    return false;
  }
};

const fetchUserFromBackend = async (uid) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/${uid}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("Error fetching user from backend:", error);
    return null;
  }
};

const buildUserProfileData = (firebaseUser, profileData = {}) => ({
  uid: firebaseUser.uid,
  fullName:
    profileData.fullName ||
    profileData.display_name ||
    firebaseUser.displayName ||
    firebaseUser.email?.split("@")[0] ||
    "User",
  email: profileData.email || firebaseUser.email || "",
  phone: profileData.phone ?? null,
  credits: profileData.credits ?? 250000,
  latitude: profileData.latitude ?? null,
  longitude: profileData.longitude ?? null,
  emergencyContactNumber: profileData.emergencyContactNumber ?? null,
});

const syncFirebaseUserProfile = async (firebaseUser, overrides = {}) => {
  const userDocRef = doc(db, "users", firebaseUser.uid);
  const userDocSnap = await getDoc(userDocRef);

  if (userDocSnap.exists()) {
    try {
      await updateDoc(userDocRef, { lastActiveAt: new Date().toISOString() });
    } catch (error) {
      console.warn("Could not update lastActiveAt:", error);
    }

    const firestoreData = userDocSnap.data();

    await syncUserToBackend({
      uid: firebaseUser.uid,
      email: firestoreData.email || firebaseUser.email,
      display_name: firestoreData.fullName || firebaseUser.displayName,
      phone: firestoreData.phone || null,
      photo_url: firebaseUser.photoURL || null,
    });

    return buildUserProfileData(firebaseUser, firestoreData);
  }

  const backendUser = await fetchUserFromBackend(firebaseUser.uid);

  if (backendUser) {
    await syncUserToBackend({
      uid: firebaseUser.uid,
      email: backendUser.email || firebaseUser.email,
      display_name: backendUser.display_name || firebaseUser.displayName,
      phone: backendUser.phone || null,
      photo_url: firebaseUser.photoURL || null,
    });

    return buildUserProfileData(firebaseUser, backendUser);
  }

  const profile = {
    id: `${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}_${firebaseUser.uid}`,
    fullName:
      overrides.fullName ||
      firebaseUser.displayName ||
      firebaseUser.email?.split("@")[0] ||
      "User",
    email: overrides.email || firebaseUser.email || "",
    phone: overrides.phone ?? null,
    credits: 250000,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    latitude: null,
    longitude: null,
    emergencyContactNumber: null,
  };

  await setDoc(userDocRef, profile);

  const backendSaved = await syncUserToBackend({
    uid: firebaseUser.uid,
    email: profile.email,
    display_name: profile.fullName,
    phone: profile.phone,
    photo_url: firebaseUser.photoURL || null,
  });

  if (!backendSaved) {
    try {
      await deleteDoc(userDocRef);
    } catch (cleanupError) {
      console.warn(
        "Could not remove Firestore profile after backend sync failure:",
        cleanupError,
      );
    }
    throw new Error("Could not save the account profile.");
  }

  return buildUserProfileData(firebaseUser, profile);
};

/**
 * Register a new user.
 * If Firebase says email already exists, we return a clear message
 * instead of leaving the user stuck.
 */
export const registerUser = async (userData) => {
  const { fullName, email, phone, password } = userData;

  const normalizedEmail = (email || "").trim().toLowerCase();
  const normalizedName = (fullName || "").trim();
  const normalizedPhone = (phone || "").trim();

  // Basic validation
  if (!normalizedName || !normalizedEmail || !normalizedPhone || !password) {
    return { success: false, message: "All fields are required" };
  }
  if (password.length < 6) {
    return {
      success: false,
      message: "Password must be at least 6 characters",
    };
  }

  try {
    // Firebase Auth registration
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      normalizedEmail,
      password,
    );
    const user = userCredential.user;

    // Update Firebase display name
    await updateProfile(user, { displayName: normalizedName });

    // Generate a simple user ID
    const userId = `${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}_${user.uid}`;

    // Save to Firestore
    const userDoc = {
      id: userId,
      fullName: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      credits: 250000,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    let firestoreSaved = false;
    try {
      await setDoc(doc(db, "users", user.uid), userDoc);
      firestoreSaved = true;
    } catch (firestoreError) {
      console.warn(
        "Firestore profile save failed, continuing with backend fallback:",
        firestoreError,
      );
    }

    // Sync to backend (best-effort — never blocks)
    const backendSaved = await syncUserToBackend({
      uid: user.uid,
      email: normalizedEmail,
      display_name: normalizedName,
      phone: normalizedPhone,
      photo_url: user.photoURL,
    });

    if (!firestoreSaved && !backendSaved) {
      try {
        await deleteDoc(doc(db, "users", user.uid));
      } catch (cleanupError) {
        console.warn(
          "Could not remove partial Firestore profile after failed registration:",
          cleanupError,
        );
      }

      try {
        await deleteUser(user);
      } catch (cleanupError) {
        console.warn(
          "Could not remove Firebase Auth user after failed registration:",
          cleanupError,
        );
      }

      return {
        success: false,
        message: "Registration failed. Could not save the account profile.",
      };
    }

    return {
      success: true,
      user: {
        uid: user.uid,
        fullName: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        credits: 250000,
      },
    };
  } catch (error) {
    console.error("registerUser error:", error?.code, error?.message);

    let errorMessage = "Registration failed. Please try again.";

    if (error.code === "auth/email-already-in-use") {
      errorMessage =
        "An account with this email already exists. Please log in instead.";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Invalid email address";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Password is too weak";
    } else if (error.code === "auth/operation-not-allowed") {
      errorMessage = "Email/password sign-up is not enabled in Firebase";
    } else if (error.code === "auth/network-request-failed") {
      errorMessage =
        "Network error. Please check your connection and try again.";
    } else if (error.code === "auth/too-many-requests") {
      errorMessage = "Too many attempts. Please try again later.";
    }

    return { success: false, message: errorMessage };
  }
};

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    const userData = await syncFirebaseUserProfile(user, {
      fullName: user.displayName,
      email: user.email,
    });

    clearPendingGoogleCredential();

    return { success: true, user: userData };
  } catch (error) {
    console.error("signInWithGoogle error:", error?.code, error?.message);

    if (error.code === "auth/account-exists-with-different-credential") {
      savePendingGoogleCredential(error.credential);
      return {
        success: false,
        message:
          "This email already uses another sign-in method. Log in with your password first, then Google will be linked.",
        needsLinking: true,
        email: error.customData?.email || error.email || null,
      };
    }

    if (error.code === "auth/popup-closed-by-user") {
      return { success: false, message: "Google sign-in was canceled." };
    }

    if (error.code === "auth/operation-not-allowed") {
      return {
        success: false,
        message: "Google sign-in is not enabled in your Firebase project.",
      };
    }

    try {
      await signOut(auth);
    } catch (signOutError) {
      console.warn(
        "Could not sign out after failed Google sign-in:",
        signOutError,
      );
    }

    return {
      success: false,
      message: error.message || "Google sign-in failed.",
    };
  }
};

/**
 * Login user.
 * Backend sync is best-effort — login succeeds even if backend is unreachable.
 */
export const loginUser = async (email, password) => {
  try {
    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedPassword = (password || "").trim();

    if (!normalizedEmail || !normalizedPassword) {
      return { success: false, message: "Email and password are required" };
    }

    const userCredential = await signInWithEmailAndPassword(
      auth,
      normalizedEmail,
      normalizedPassword,
    );
    const user = userCredential.user;

    const pendingGoogleCredential = getPendingGoogleCredential();
    if (pendingGoogleCredential) {
      try {
        await linkWithCredential(user, pendingGoogleCredential);
      } catch (linkError) {
        console.warn("Could not link Google account:", linkError);
      }
      clearPendingGoogleCredential();
    }

    const userData = await syncFirebaseUserProfile(user);
    return { success: true, user: userData };
  } catch (error) {
    console.error("loginUser error:", error?.code, error?.message);

    let errorMessage = "Invalid email or password";

    if (error.code === "auth/user-not-found") {
      errorMessage = "No account found with this email";
    } else if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Invalid email address";
    } else if (error.code === "auth/invalid-credential") {
      errorMessage = "Incorrect email or password";
    } else if (error.code === "auth/user-disabled") {
      errorMessage = "This account has been disabled";
    } else if (error.code === "auth/network-request-failed") {
      errorMessage =
        "Network error. Please check your connection and try again.";
    } else if (error.code === "auth/too-many-requests") {
      errorMessage = "Too many failed attempts. Please try again later.";
    }

    return { success: false, message: errorMessage };
  }
};

/**
 * Logout user
 */
export const logoutUser = async () => {
  try {
    clearPendingGoogleCredential();
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

/**
 * Get current authenticated user with full profile
 */
export const getCurrentUser = async () => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribe();

      if (!firebaseUser) {
        resolve(null);
        return;
      }

      try {
        const userData = await syncFirebaseUserProfile(firebaseUser);
        resolve(userData);
      } catch (error) {
        console.error("Error fetching user data from Firestore:", error);
        resolve(null);
      }
    });
  });
};

/**
 * Update user credits in Firestore
 */
export const updateUserCredits = async (userId, newCredits) => {
  try {
    await updateDoc(doc(db, "users", userId), { credits: newCredits });
    return { success: true };
  } catch (error) {
    console.error("Error updating credits:", error);
    return { success: false, message: error.message };
  }
};
