import {
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  linkWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "./../config/firebase";
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "./../config/firebase";
import { API_BASE_URL } from "./../config/api";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const PENDING_GOOGLE_LINK_KEY = "pendingGoogleLinkCredential";
const AUTH_SESSION_KEY = "safePathAuthSession";
const DEFAULT_TRANSPORT_TIMES = {
  morning: false,
  afternoon: false,
  evening: false,
  night: false,
};

const DEFAULT_AVOID_FACTORS = {
  poorLighting: false,
  heavyTraffic: false,
  crowdedAreas: false,
  lowPolicePresence: false,
  longRoutes: false,
  accidentProne: false,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{6,10}$/;

const normalizePreferences = (preferences = {}) => ({
  gender: preferences.gender || "",
  ageGroup: preferences.ageGroup || preferences.age || "",
  transportMode: preferences.transportMode || preferences.transport || "",
  transportTimes: {
    ...DEFAULT_TRANSPORT_TIMES,
    ...(preferences.transportTimes || {}),
  },
  avoidFactors: (() => {
    const avoidFactors = preferences.avoidFactors || {};
    const { lateNightTravel, ...rest } = avoidFactors;

    return {
      ...DEFAULT_AVOID_FACTORS,
      ...rest,
      accidentProne: rest.accidentProne ?? lateNightTravel ?? false,
    };
  })(),
});

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

const saveAuthSession = (sessionData) => {
  try {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(sessionData));
  } catch (error) {
    console.warn("Could not save auth session:", error);
  }
};

const readAuthSession = () => {
  try {
    const stored = localStorage.getItem(AUTH_SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn("Could not read auth session:", error);
    return null;
  }
};

const clearAuthSession = () => {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch (error) {
    console.warn("Could not clear auth session:", error);
  }
};

const isValidEmail = (email) => EMAIL_REGEX.test((email || "").trim());

const normalizePhone = (phone) => (phone || "").trim().replace(/\s+/g, "");

const isValidPhone = (phone) => E164_PHONE_REGEX.test(normalizePhone(phone));

const isStrongPassword = (password) => PASSWORD_REGEX.test(password || "");

const phoneToSyntheticEmailFromDigits = (digits) => {
  const cleanedDigits = (digits || "").replace(/\D/g, "");
  return `phone_${cleanedDigits}@safepath.local`;
};

const phoneToSyntheticEmail = (phone) => {
  const digits = normalizePhone(phone)
    .replace(/[^\d+]/g, "")
    .replace(/^\+/, "");
  return `phone_${digits}@safepath.local`;
};

const phoneToSyntheticEmailNational = (phone) => {
  const digits = normalizePhone(phone).replace(/\D/g, "");
  const nationalDigits = digits.slice(-10);
  return phoneToSyntheticEmailFromDigits(nationalDigits);
};

const extractPhoneFromSyntheticEmail = (email) => {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const match = normalizedEmail.match(/^phone_(\d+)@safepath\.local$/);
  if (!match) return null;

  const digits = match[1];
  if (!digits) return null;

  return `+${digits}`;
};

const buildBackendUserProfileData = (backendUser = {}) => ({
  uid: backendUser.uid,
  fullName:
    backendUser.display_name ||
    backendUser.full_name ||
    backendUser.email?.split("@")[0] ||
    "User",
  email: backendUser.email || "",
  phone: backendUser.phone || null,
  credits: backendUser.credits ?? 250000,
  latitude: backendUser.latitude ?? null,
  longitude: backendUser.longitude ?? null,
  emergencyContactNumber:
    backendUser.emergencyContactNumber ??
    backendUser.emergency_contact_number ??
    null,
  emergencyContacts: Array.isArray(backendUser.emergencyContacts)
    ? backendUser.emergencyContacts
    : backendUser.emergency_contact_number
      ? [backendUser.emergency_contact_number]
      : [],
  preferences: normalizePreferences(backendUser.preferences || {}),
});

export const getUserDisplayIdentifier = (user = {}) => {
  const phone = normalizePhone(user.phone || "");
  if (phone) {
    return phone;
  }

  const email = (user.email || "").trim();
  if (email && !/^phone_\d+@safepath\.local$/i.test(email)) {
    return email;
  }

  const syntheticPhone = extractPhoneFromSyntheticEmail(email);
  if (syntheticPhone) {
    return syntheticPhone;
  }

  return "N/A";
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

export const sendVerificationOtp = async ({ uid, channel, email, phone }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, channel, email, phone }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.detail || "Could not send OTP" };
    }

    return { success: true, ...data };
  } catch (error) {
    return { success: false, message: "Could not send OTP. Please try again." };
  }
};

export const verifyRegistrationOtp = async ({ uid, channel, otp }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, channel, otp }),
    });

    const rawBody = await response.text();
    let data = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { detail: rawBody || "Unknown server response" };
    }

    if (!response.ok) {
      const detail = data.detail || data.message || "Invalid OTP";
      return {
        success: false,
        message: typeof detail === "string" ? detail : JSON.stringify(detail),
        status: response.status,
      };
    }

    return { success: true, ...data };
  } catch (error) {
    return {
      success: false,
      message: error?.message || "Could not verify OTP. Please try again.",
    };
  }
};

export const getVerificationStatus = async (uid) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/auth/verification-status/${uid}`,
    );
    if (!response.ok) {
      return {
        success: false,
        is_verified: false,
        is_legacy_user: false,
        message: `Verification status check failed (${response.status}).`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      ...data,
      // Fail closed if backend payload is missing or malformed.
      is_verified: Boolean(data?.is_verified),
      is_legacy_user: Boolean(data?.is_legacy_user),
    };
  } catch (error) {
    return {
      success: false,
      is_verified: false,
      is_legacy_user: false,
      message:
        error?.message || "Could not verify account status. Please try again.",
    };
  }
};

export const transferVerificationStatus = async ({ sourceUid, targetUid }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/verification/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_uid: sourceUid, target_uid: targetUid }),
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        message: data.detail || "Could not transfer verification",
      };
    }

    return { success: true, ...data };
  } catch (error) {
    return {
      success: false,
      message: "Could not transfer verification status. Please try again.",
    };
  }
};

export const checkRegistrationIdentifiers = async ({ email, phone }) => {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone || "");

  try {
    if (normalizedEmail && isValidEmail(normalizedEmail)) {
      const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      if (methods.length > 0) {
        return {
          exists: true,
          message: "An account with this email already exists. Please login.",
        };
      }
    }

    if (normalizedPhone && isValidPhone(normalizedPhone)) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/auth/resolve-identifier`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: normalizedPhone }),
          },
        );

        if (response.ok) {
          return {
            exists: true,
            message:
              "An account with this phone number already exists. Please login.",
          };
        }

        // Handle 409 Conflict: multiple legacy accounts match this phone
        if (response.status === 409) {
          const data = await response.json().catch(() => ({}));
          return {
            exists: true,
            message:
              data.detail ||
              "This phone number matches multiple accounts. Please login with email instead.",
          };
        }
      } catch (error) {
        // Ignore backend check failure and continue Firebase checks.
      }

      const phoneCandidates = [
        phoneToSyntheticEmail(normalizedPhone),
        phoneToSyntheticEmailNational(normalizedPhone),
      ];

      for (const candidate of [...new Set(phoneCandidates)]) {
        const methods = await fetchSignInMethodsForEmail(auth, candidate);
        if (methods.length > 0) {
          return {
            exists: true,
            message:
              "An account with this phone number already exists. Please login.",
          };
        }
      }
    }

    return { exists: false };
  } catch (error) {
    // Non-blocking check failure should not prevent registration.
    return { exists: false };
  }
};

const resolveIdentifierForLogin = async (identifier) => {
  const normalizedIdentifier = (identifier || "").trim();

  if (!normalizedIdentifier) {
    return {
      success: false,
      message: "Email or phone and password are required",
    };
  }

  if (isValidEmail(normalizedIdentifier)) {
    return { success: true, email: normalizedIdentifier.toLowerCase() };
  }

  const normalizedPhone = normalizePhone(normalizedIdentifier);
  if (!isValidPhone(normalizedPhone)) {
    return { success: false, message: "Enter a valid email or phone number" };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/resolve-identifier`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: normalizedPhone }),
    });

    const data = await response.json();
    if (!response.ok) {
      const detail = data.detail || "No account found";

      if (response.status === 404 || response.status >= 500) {
        // Fallback for phone-first accounts when backend profile sync is missing.
        return { success: true, email: phoneToSyntheticEmail(normalizedPhone) };
      }

      return { success: false, message: detail };
    }

    return { success: true, email: (data.email || "").toLowerCase() };
  } catch (error) {
    // Fail-soft fallback for temporary backend outages.
    return { success: true, email: phoneToSyntheticEmail(normalizedPhone) };
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
  phone:
    profileData.phone ??
    extractPhoneFromSyntheticEmail(profileData.email || firebaseUser.email) ??
    null,
  credits: profileData.credits ?? 250000,
  latitude: profileData.latitude ?? null,
  longitude: profileData.longitude ?? null,
  emergencyContactNumber: profileData.emergencyContactNumber ?? null,
  emergencyContacts: Array.isArray(profileData.emergencyContacts)
    ? profileData.emergencyContacts
    : profileData.emergencyContactNumber
      ? [profileData.emergencyContactNumber]
      : [],
  preferences: normalizePreferences(profileData.preferences),
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
    const inferredPhone =
      firestoreData.phone ||
      extractPhoneFromSyntheticEmail(firestoreData.email || firebaseUser.email);

    await syncUserToBackend({
      uid: firebaseUser.uid,
      email: firestoreData.email || firebaseUser.email,
      display_name: firestoreData.fullName || firebaseUser.displayName,
      phone: inferredPhone || null,
      photo_url: firebaseUser.photoURL || null,
    });

    return buildUserProfileData(firebaseUser, firestoreData);
  }

  const backendUser = await fetchUserFromBackend(firebaseUser.uid);

  if (backendUser) {
    const inferredPhone =
      backendUser.phone ||
      extractPhoneFromSyntheticEmail(backendUser.email || firebaseUser.email);

    await syncUserToBackend({
      uid: firebaseUser.uid,
      email: backendUser.email || firebaseUser.email,
      display_name: backendUser.display_name || firebaseUser.displayName,
      phone: inferredPhone || null,
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
    phone:
      overrides.phone ??
      extractPhoneFromSyntheticEmail(firebaseUser.email) ??
      null,
    credits: 250000,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    latitude: null,
    longitude: null,
    emergencyContactNumber: null,
    emergencyContacts: [],
    preferences: normalizePreferences(),
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
  const {
    fullName,
    email,
    phone,
    password,
    otpChannel = "email",
    skipOtp = false,
    verificationSourceUid = null,
  } = userData;

  const normalizedEmail = (email || "").trim().toLowerCase();
  const normalizedName = (fullName || "").trim();
  const normalizedPhone = normalizePhone(phone);
  const hasEmail = Boolean(normalizedEmail);
  const hasPhone = Boolean(normalizedPhone);

  // Basic validation
  if (!normalizedName || !password) {
    return { success: false, message: "Full name and password are required" };
  }
  if (!hasEmail && !hasPhone) {
    return {
      success: false,
      message: "Provide at least email or phone number",
    };
  }
  if (hasEmail && !isValidEmail(normalizedEmail)) {
    return { success: false, message: "Enter a valid email address" };
  }
  if (hasPhone && !isValidPhone(normalizedPhone)) {
    return {
      success: false,
      message: "Phone must be in international format like +14155552671",
    };
  }
  if (!isStrongPassword(password)) {
    return {
      success: false,
      message:
        "Password must be 6-10 chars and include upper, lower, number, and special character",
    };
  }

  const firebaseEmail = hasEmail
    ? normalizedEmail
    : phoneToSyntheticEmail(normalizedPhone);
  const verificationChannel =
    otpChannel === "phone" && hasPhone ? "phone" : "email";

  if (verificationChannel === "email" && !hasEmail) {
    return {
      success: false,
      message: "Email is required when OTP channel is email",
    };
  }

  try {
    if (!skipOtp) {
      const uid =
        verificationSourceUid ||
        `pending_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const otpSendResult = await sendVerificationOtp({
        uid,
        channel: verificationChannel,
        email: hasEmail ? normalizedEmail : null,
        phone: hasPhone ? normalizedPhone : null,
      });

      if (!otpSendResult.success) {
        return {
          success: false,
          message:
            otpSendResult.message ||
            "Account created but OTP could not be sent",
        };
      }

      return {
        success: true,
        requiresVerification: true,
        verification: {
          uid,
          channel: otpSendResult.channel,
          destination: otpSendResult.destination,
        },
        user: {
          uid,
          fullName: normalizedName,
          email: hasEmail ? normalizedEmail : null,
          phone: hasPhone ? normalizedPhone : null,
          credits: 250000,
        },
      };
    }

    const uid =
      verificationSourceUid ||
      userData.uid ||
      `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const backendEmail = hasEmail ? normalizedEmail : firebaseEmail;

    const response = await fetch(`${API_BASE_URL}/users/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid,
        email: backendEmail,
        display_name: normalizedName,
        phone: hasPhone ? normalizedPhone : null,
        photo_url: null,
      }),
    });

    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        message:
          responseData.detail ||
          "Registration failed. Could not save the account profile.",
      };
    }

    const createdUser = responseData.user || responseData;
    const storedUser = buildBackendUserProfileData({
      ...createdUser,
      uid,
      email: backendEmail,
      display_name: normalizedName,
      phone: hasPhone ? normalizedPhone : null,
      credits: 250000,
    });

    saveAuthSession({ uid, authType: "otp" });

    try {
      await setDoc(
        doc(db, "users", uid),
        {
          id:
            createdUser.id ||
            `${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}_${uid}`,
          fullName: normalizedName,
          email: backendEmail,
          phone: hasPhone ? normalizedPhone : null,
          credits: 250000,
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (firestoreError) {
      console.warn(
        "Could not mirror OTP registration to Firestore:",
        firestoreError,
      );
    }

    return {
      success: true,
      requiresVerification: false,
      user: storedUser,
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
export const loginUser = async (identifier, password) => {
  try {
    const normalizedIdentifier = (identifier || "").trim();
    const normalizedPassword = (password || "").trim();

    if (!normalizedIdentifier || !normalizedPassword) {
      return {
        success: false,
        message: "Email or phone and password are required",
      };
    }

    const emailCandidates = [];

    if (isValidEmail(normalizedIdentifier)) {
      emailCandidates.push(normalizedIdentifier.toLowerCase());
    } else {
      const normalizedPhone = normalizePhone(normalizedIdentifier);
      if (!isValidPhone(normalizedPhone)) {
        return {
          success: false,
          message: "Enter a valid email or phone number",
        };
      }

      const resolved = await resolveIdentifierForLogin(normalizedPhone);
      if (resolved.success && resolved.email) {
        emailCandidates.push((resolved.email || "").toLowerCase());
      }

      // Fallback for phone-first accounts where backend profile mapping is missing/outdated.
      emailCandidates.push(phoneToSyntheticEmail(normalizedPhone));
      emailCandidates.push(phoneToSyntheticEmailNational(normalizedPhone));
    }

    const uniqueCandidates = [...new Set(emailCandidates.filter(Boolean))];
    if (uniqueCandidates.length === 0) {
      return { success: false, message: "No account found" };
    }

    let userCredential = null;
    let lastAuthError = null;

    for (const candidateEmail of uniqueCandidates) {
      try {
        userCredential = await signInWithEmailAndPassword(
          auth,
          candidateEmail,
          normalizedPassword,
        );
        break;
      } catch (attemptError) {
        lastAuthError = attemptError;

        const retryableCodes = [
          "auth/user-not-found",
          "auth/wrong-password",
          "auth/invalid-email",
          "auth/invalid-credential",
        ];

        if (!retryableCodes.includes(attemptError.code)) {
          throw attemptError;
        }
      }
    }

    if (!userCredential) {
      throw lastAuthError || new Error("auth/invalid-credential");
    }

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

    const verificationStatus = await getVerificationStatus(user.uid);
    if (!verificationStatus.is_verified) {
      await signOut(auth);
      return {
        success: false,
        needsVerification: true,
        uid: user.uid,
        message: "Please verify your account before logging in.",
      };
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
    clearAuthSession();
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
  const storedSession = readAuthSession();
  if (storedSession?.uid) {
    const backendUser = await fetchUserFromBackend(storedSession.uid);
    if (backendUser) {
      return buildBackendUserProfileData(backendUser);
    }
  }

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribe();

      if (!firebaseUser) {
        resolve(null);
        return;
      }

      try {
        const verificationStatus = await getVerificationStatus(
          firebaseUser.uid,
        );
        if (!verificationStatus.is_verified) {
          try {
            await signOut(auth);
          } catch (signOutError) {
            console.warn("Could not sign out unverified user:", signOutError);
          }
          resolve(null);
          return;
        }

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

/**
 * Update user preferences and profile settings in Firestore.
 */
export const updateUserPreferences = async (userId, updates = {}) => {
  try {
    if (!userId) {
      return { success: false, message: "User ID is required" };
    }

    const payload = {};

    if (updates.preferences) {
      payload.preferences = normalizePreferences(updates.preferences);
    }

    if (typeof updates.fullName !== "undefined") {
      payload.fullName = (updates.fullName || "").trim();
    }

    if (typeof updates.phone !== "undefined") {
      payload.phone = updates.phone ? normalizePhone(updates.phone) : null;
    }

    if (typeof updates.emergencyContactNumber !== "undefined") {
      payload.emergencyContactNumber = updates.emergencyContactNumber || null;
    }

    if (Array.isArray(updates.emergencyContacts)) {
      const cleanedContacts = updates.emergencyContacts
        .map((contact) => (contact || "").trim())
        .filter(Boolean);
      payload.emergencyContacts = cleanedContacts;

      if (typeof updates.emergencyContactNumber === "undefined") {
        payload.emergencyContactNumber = cleanedContacts[0] || null;
      }
    }

    payload.lastActiveAt = new Date().toISOString();

    await setDoc(doc(db, "users", userId), payload, { merge: true });
    return { success: true };
  } catch (error) {
    console.error("Error updating user preferences:", error);
    return { success: false, message: error.message };
  }
};
