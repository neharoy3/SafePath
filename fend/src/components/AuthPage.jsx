import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  registerUser,
  loginUser,
  signInWithGoogle,
  sendVerificationOtp,
  verifyRegistrationOtp,
  checkRegistrationIdentifiers,
} from "../utils/firebaseAuth";
import { ROUTES } from "../utils/routes";

const AuthPage = ({ setIsAuthenticated }) => {
  const [activeTab, setActiveTab] = useState("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginEmailPassword, setLoginEmailPassword] = useState("");
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [otpChannel, setOtpChannel] = useState("email");
  const [pendingVerification, setPendingVerification] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+91");
  const [loginMethod, setLoginMethod] = useState("email");
  const [loginCountryCode, setLoginCountryCode] = useState("+91");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPhonePassword, setLoginPhonePassword] = useState("");
  const navigate = useNavigate();

  const COUNTRY_CODES = [
    { code: "+91", label: "India (+91)" },
    { code: "+1", label: "US/CA (+1)" },
    { code: "+44", label: "UK (+44)" },
    { code: "+61", label: "Australia (+61)" },
    { code: "+971", label: "UAE (+971)" },
  ];

  const getNationalPhoneBounds = (countryCode) => {
    const countryDigits = (countryCode || "").replace(/\D/g, "").length;
    const maxDigits = Math.max(1, 15 - countryDigits);
    const minDigits = Math.max(1, 8 - countryDigits);
    return { minDigits, maxDigits };
  };

  const sanitizeNationalPhone = (value, countryCode) => {
    const digits = (value || "").replace(/\D/g, "");
    const { maxDigits } = getNationalPhoneBounds(countryCode);
    return digits.slice(0, maxDigits);
  };

  const isValidNationalPhone = (value, countryCode) => {
    const digits = (value || "").replace(/\D/g, "");
    const { minDigits, maxDigits } = getNationalPhoneBounds(countryCode);
    return digits.length >= minDigits && digits.length <= maxDigits;
  };

  const getNationalPhoneLengthHint = (countryCode) => {
    const { minDigits, maxDigits } = getNationalPhoneBounds(countryCode);
    if (minDigits === maxDigits) {
      return `${minDigits}`;
    }
    return `${minDigits}-${maxDigits}`;
  };

  const buildE164Phone = (value) => {
    const digits = (value || "").replace(/\D/g, "");
    return digits ? `${phoneCountryCode}${digits}` : "";
  };
  const createPendingUid = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `pending_${crypto.randomUUID()}`;
    }
    return `pending_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  };

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);
    return () => clearTimeout(splashTimer);
  }, []);

  const handleChange = (e) => {
    const nextValue =
      e.target.name === "phone"
        ? sanitizeNationalPhone(e.target.value, phoneCountryCode)
        : e.target.value;

    setFormData({
      ...formData,
      [e.target.name]: nextValue,
    });
    if (activeTab === "register") {
      if (
        e.target.name === "email" &&
        !e.target.value.trim() &&
        otpChannel === "email"
      ) {
        if (formData.phone.trim()) {
          setOtpChannel("phone");
        }
      }

      if (
        e.target.name === "phone" &&
        !e.target.value.trim() &&
        otpChannel === "phone"
      ) {
        if (formData.email.trim()) {
          setOtpChannel("email");
        }
      }
    }
    setError("");
  };

  const handleLoginFieldChange = (e) => {
    if (e.target.name === "email") {
      setLoginEmail(e.target.value);
    }
    if (e.target.name === "password") {
      setLoginEmailPassword(e.target.value);
    }
    setError("");
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const hasEmail = Boolean(formData.email.trim());
    const hasPhone = Boolean(formData.phone.trim());
    const formattedPhone = hasPhone ? buildE164Phone(formData.phone) : "";

    if (!hasEmail && !hasPhone) {
      setError("Please provide at least an email or a phone number");
      setLoading(false);
      return;
    }

    if (hasPhone && !isValidNationalPhone(formData.phone, phoneCountryCode)) {
      setError(
        `Phone number must be ${getNationalPhoneLengthHint(phoneCountryCode)} digits for the selected country code`,
      );
      setLoading(false);
      return;
    }

    if (otpChannel === "email" && !hasEmail) {
      setError("Enter email or switch OTP channel to phone");
      setLoading(false);
      return;
    }

    if (otpChannel === "phone" && !hasPhone) {
      setError("Enter phone number or switch OTP channel to email");
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    const existingCheck = await checkRegistrationIdentifiers({
      email: hasEmail ? formData.email.trim() : "",
      phone: hasPhone ? formattedPhone : "",
    });

    if (existingCheck.exists) {
      setError(
        existingCheck.message || "Account already exists. Please login.",
      );
      setLoading(false);
      return;
    }

    try {
      const pendingUid = createPendingUid();
      const otpResult = await sendVerificationOtp({
        uid: pendingUid,
        channel: otpChannel,
        email: hasEmail ? formData.email.trim() : "",
        phone: hasPhone ? formattedPhone : "",
      });

      if (!otpResult.success) {
        setError(otpResult.message || "Could not send OTP");
        return;
      }

      setPendingVerification({
        uid: pendingUid,
        channel: otpChannel,
        destination: otpResult.destination,
        registrationData: {
          fullName: formData.fullName,
          email: hasEmail ? formData.email.trim() : "",
          phone: hasPhone ? formattedPhone : "",
          password: formData.password,
          otpChannel,
        },
      });

      const toast = document.createElement("div");
      toast.className =
        "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
      toast.innerHTML =
        "<span>✅</span> <span>OTP sent. Verify OTP to create your account.</span>";
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.remove();
      }, 3000);
    } catch (error) {
      setError("An error occurred during registration. Please try again.");
    }

    setLoading(false);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");

    if (!pendingVerification?.uid) {
      setError("Verification session expired. Please register again.");
      return;
    }

    if (!/^\d{6}$/.test(otpCode)) {
      setError("Enter a valid 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      const verifyResult = await verifyRegistrationOtp({
        uid: pendingVerification.uid,
        channel: pendingVerification.channel,
        otp: otpCode,
      });

      if (!verifyResult.success) {
        setError(verifyResult.message || "Invalid OTP");
        return;
      }

      const registrationResult = await registerUser({
        ...pendingVerification.registrationData,
        skipOtp: true,
        verificationSourceUid: pendingVerification.uid,
      });

      if (!registrationResult.success) {
        setError(
          registrationResult.message ||
            "Could not create account after verification.",
        );
        return;
      }

      setPendingVerification(null);
      setOtpCode("");
      setIsAuthenticated(true);
      navigate(ROUTES.JOURNEY_PLANNER, { replace: true });
    } catch (err) {
      setError("Could not verify OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingVerification?.uid) {
      setError("Verification session expired. Please register again.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const resendResult = await sendVerificationOtp({
        uid: pendingVerification.uid,
        channel: pendingVerification.channel,
        email: pendingVerification.registrationData?.email || "",
        phone: pendingVerification.registrationData?.phone || "",
      });

      if (!resendResult.success) {
        setError(resendResult.message || "Could not resend OTP");
        return;
      }

      setPendingVerification((prev) => ({
        ...prev,
        destination: resendResult.destination,
      }));
    } catch (err) {
      setError("Could not resend OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const loginIdentifier =
      loginMethod === "phone" ? `${loginCountryCode}${loginPhone}` : loginEmail;
    const loginPassword =
      loginMethod === "phone" ? loginPhonePassword : loginEmailPassword;

    if (
      loginMethod === "phone" &&
      !isValidNationalPhone(loginPhone, loginCountryCode)
    ) {
      setError(
        `Enter a valid ${getNationalPhoneLengthHint(loginCountryCode)} digit phone number for the selected country code`,
      );
      setLoading(false);
      return;
    }

    try {
      const result = await loginUser(loginIdentifier, loginPassword);

      if (result.success) {
        setIsAuthenticated(true);
        // Show success toast
        const toast = document.createElement("div");
        toast.className =
          "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
        toast.innerHTML = "<span>✅</span> <span>Login successful</span>";
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.remove();
        }, 3000);
        navigate(ROUTES.JOURNEY_PLANNER, { replace: true });
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError("An error occurred during login. Please try again.");
    }

    setLoading(false);
  };

  const handleGoogleAuth = async () => {
    setError("");
    setLoading(true);

    try {
      const result = await signInWithGoogle();

      if (result.success) {
        setIsAuthenticated(true);
        const toast = document.createElement("div");
        toast.className =
          "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2";
        toast.innerHTML =
          "<span>✅</span> <span>Google sign-in successful</span>";
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.remove();
        }, 3000);
        navigate(ROUTES.JOURNEY_PLANNER, { replace: true });
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError("Google sign-in failed. Please try again.");
    }

    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0a0a0a 0%, #121212 100%)",
        minHeight: "100vh",
        width: "100%",
      }}
    >
      {/* Full-screen map background image with animation */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/home.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        aria-hidden="true"
      />

      {/* Translucent dark overlay for readability - less opaque */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/50"
        aria-hidden="true"
        style={{
          animation: "overlayPulse 8s ease-in-out infinite",
        }}
      />

      {/* Animated grid overlay for tech effect */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(0deg, transparent 24%, rgba(59, 130, 246, 0.3) 25%, rgba(59, 130, 246, 0.3) 26%, transparent 27%, transparent 74%, rgba(59, 130, 246, 0.3) 75%, rgba(59, 130, 246, 0.3) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(59, 130, 246, 0.3) 25%, rgba(59, 130, 246, 0.3) 26%, transparent 27%, transparent 74%, rgba(59, 130, 246, 0.3) 75%, rgba(59, 130, 246, 0.3) 76%, transparent 77%, transparent)",
          backgroundSize: "50px 50px",
          animation: "gridMove 15s linear infinite",
        }}
      />

      {/* Splash Screen - SafePath */}
      {showSplash && (
        <div className="fixed inset-0 flex items-center justify-center z-50 animate-[fadeInUp_0.6s_ease-out_forwards]">
          <div className="text-center">
            <img
              src="/safepath.png"
              alt="SafePath logo"
              className="mx-auto mb-4 h-20 w-20 object-contain"
            />
            <h1 className="text-6xl font-bold text-white mb-4 animate-[fadeInUp_0.8s_ease-out_forwards]">
              SafePath
            </h1>
            {/* <p className="text-xl text-white/70 animate-[fadeInUp_1s_ease-out_forwards]">made by MINDIMMAXDEV</p> */}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-blue-900/70 animate-[fadeOut_0.6s_ease-out_forwards_1.3s] pointer-events-none" />
        </div>
      )}

      {/* Neon glow effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500 rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
        <div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full filter blur-3xl opacity-20 animate-pulse"
          style={{ animationDelay: "1s" }}
        ></div>
      </div>

      {/* Scrollable form container */}
      <div
        className={`w-full max-w-lg sm:max-w-xl lg:max-w-2xl mx-auto rounded-2xl border border-white/20 bg-white/5 backdrop-blur-md p-8 md:p-10 shadow-2xl transition-all duration-500 relative z-10 max-h-[90vh] overflow-hidden flex flex-col ${showSplash ? "opacity-0" : "opacity-100"} ${!showSplash && "animate-[fadeInUp_0.6s_ease-out_forwards]"}`}
        style={{
          scrollBehavior: "smooth",
        }}
      >
        {/* Static Logo + Tabs */}
        <div className="shrink-0 text-center mb-8">
          <img
            src="/safepath.png"
            alt="SafePath logo"
            className="mx-auto mb-4 h-20 w-20 object-contain"
          />
          <h1 className="text-3xl font-bold text-white mb-2">SafePath</h1>
          <p className="text-white/70 text-sm">
            Your trusted companion for safe navigation
          </p>
          {/* Tabs */}
          <div className="mt-6 flex rounded-xl border border-white/10 bg-white/10 p-1">
            <button
              onClick={() => {
                setActiveTab("login");
                setError("");
              }}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === "login"
                  ? "bg-blue-600 text-white shadow-lg"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => {
                setActiveTab("register");
                setError("");
              }}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === "register"
                  ? "bg-blue-600 text-white shadow-lg"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-400/60 bg-red-600/70 p-3 text-sm text-white text-left">
              {error}
            </div>
          )}
        </div>

        {/* Scrollable Form Area */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 pt-6">
          {/* Forms */}
          {pendingVerification ? (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="rounded-lg border border-blue-400/40 bg-blue-500/10 p-4 text-sm text-blue-100">
                Enter the 6-digit OTP sent to {pendingVerification.destination}.
              </div>

              <div>
                <label className="mb-2 block text-base text-white">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, ""))
                  }
                  className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-base text-white placeholder-gray-300 transition-all duration-200 hover:bg-white/15 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="123456"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 py-3 text-base font-medium text-white transition hover:bg-blue-700 active:scale-[0.98] active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 shadow-lg shadow-blue-600/30"
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading}
                className="w-full rounded-xl border border-white/20 bg-white/10 py-3 text-base font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Resend OTP
              </button>

              <button
                type="button"
                onClick={() => {
                  setPendingVerification(null);
                  setOtpCode("");
                  setActiveTab("login");
                }}
                className="w-full rounded-xl border border-white/20 bg-transparent py-3 text-base font-medium text-white/80 transition hover:text-white"
              >
                Back to Login
              </button>
            </form>
          ) : (
            <form
              onSubmit={activeTab === "login" ? handleLogin : handleRegister}
              className="space-y-6"
            >
              {activeTab === "register" && (
                <div>
                  <label className="mb-2 block text-base text-white">
                    Full Name
                  </label>
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/60"
                      aria-hidden="true"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </span>
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 pl-10 text-base text-white placeholder-gray-300 transition-all duration-200 hover:bg-white/15 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="John Doe"
                      required={activeTab === "register"}
                    />
                  </div>
                </div>
              )}

              <div>
                {activeTab === "register" && (
                  <p className="mb-2 text-xs text-white/70">
                    Enter either email or phone number (at least one is
                    required).
                  </p>
                )}
                {activeTab === "login" && (
                  <div className="mb-2 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMethod("email");
                        setError("");
                      }}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                        loginMethod === "email"
                          ? "border-blue-500 bg-blue-600 text-white"
                          : "border-white/20 bg-white/10 text-white/80 hover:bg-white/15"
                      }`}
                    >
                      Login with Email
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMethod("phone");
                        setError("");
                      }}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                        loginMethod === "phone"
                          ? "border-blue-500 bg-blue-600 text-white"
                          : "border-white/20 bg-white/10 text-white/80 hover:bg-white/15"
                      }`}
                    >
                      Login with Phone
                    </button>
                  </div>
                )}
                <label className="mb-2 block text-base text-white">
                  {activeTab === "login"
                    ? loginMethod === "phone"
                      ? "Phone Number"
                      : "Email"
                    : "Email"}
                </label>
                {activeTab === "login" && loginMethod === "phone" ? (
                  <div className="grid grid-cols-[160px_1fr] gap-3">
                    <select
                      value={loginCountryCode}
                      onChange={(e) => {
                        const nextCountryCode = e.target.value;
                        setLoginCountryCode(nextCountryCode);
                        setLoginPhone((currentPhone) =>
                          sanitizeNationalPhone(currentPhone, nextCountryCode),
                        );
                        setError("");
                      }}
                      className="rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-sm text-white outline-none transition-all duration-200 hover:bg-white/15 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    >
                      {COUNTRY_CODES.map((country) => (
                        <option
                          key={country.code}
                          value={country.code}
                          className="bg-slate-900 text-white"
                        >
                          {country.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      value={loginPhone}
                      onChange={(e) => {
                        setLoginPhone(
                          sanitizeNationalPhone(
                            e.target.value,
                            loginCountryCode,
                          ),
                        );
                        setError("");
                      }}
                      inputMode="numeric"
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-base text-white placeholder-gray-300 transition-all duration-200 hover:bg-white/15 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="National phone number"
                      required={activeTab === "login"}
                    />
                  </div>
                ) : (
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/60"
                      aria-hidden="true"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </span>
                    <input
                      type="email"
                      name="email"
                      value={loginEmail}
                      onChange={handleLoginFieldChange}
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 pl-10 text-base text-white placeholder-gray-300 transition-all duration-200 hover:bg-white/15 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="john@example.com"
                      required={activeTab === "login"}
                    />
                  </div>
                )}
              </div>

              {activeTab === "register" && (
                <div>
                  <label className="mb-2 block text-base text-white">
                    Phone Number
                  </label>
                  <div className="grid grid-cols-[160px_1fr] gap-3">
                    <select
                      value={phoneCountryCode}
                      onChange={(e) => {
                        const nextCountryCode = e.target.value;
                        setPhoneCountryCode(nextCountryCode);
                        setFormData((prev) => ({
                          ...prev,
                          phone: sanitizeNationalPhone(
                            prev.phone,
                            nextCountryCode,
                          ),
                        }));
                        setError("");
                      }}
                      className="rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-sm text-white outline-none transition-all duration-200 hover:bg-white/15 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    >
                      {COUNTRY_CODES.map((country) => (
                        <option
                          key={country.code}
                          value={country.code}
                          className="bg-slate-900 text-white"
                        >
                          {country.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      inputMode="numeric"
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-base text-white placeholder-gray-300 transition-all duration-200 hover:bg-white/15 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="National phone number"
                    />
                  </div>
                </div>
              )}

              {activeTab === "register" && (
                <div>
                  <label className="mb-2 block text-base text-white">
                    Send OTP To
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setOtpChannel("email")}
                      disabled={!formData.email.trim()}
                      className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                        otpChannel === "email"
                          ? "border-blue-500 bg-blue-600 text-white"
                          : "border-white/20 bg-white/10 text-white/80 hover:bg-white/15"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setOtpChannel("phone")}
                      disabled={
                        !isValidNationalPhone(formData.phone, phoneCountryCode)
                      }
                      className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                        otpChannel === "phone"
                          ? "border-blue-500 bg-blue-600 text-white"
                          : "border-white/20 bg-white/10 text-white/80 hover:bg-white/15"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      Phone
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-2 block text-base text-white">
                  Password
                </label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/60"
                    aria-hidden="true"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </span>
                  <input
                    type="password"
                    name="password"
                    value={
                      activeTab === "login"
                        ? loginMethod === "phone"
                          ? loginPhonePassword
                          : loginEmailPassword
                        : formData.password
                    }
                    onChange={(e) => {
                      if (activeTab !== "login") {
                        handleChange(e);
                        return;
                      }

                      if (loginMethod === "phone") {
                        setLoginPhonePassword(e.target.value);
                      } else {
                        handleLoginFieldChange(e);
                      }
                      setError("");
                    }}
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 pl-10 text-base text-white placeholder-gray-300 transition-all duration-200 hover:bg-white/15 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <p className="mt-2 text-xs text-white/70">
                  Password must be 6-10 characters and include uppercase,
                  lowercase, a number, and a special character.
                </p>
              </div>

              {activeTab === "register" && (
                <div>
                  <label className="mb-2 block text-base text-white">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/60"
                      aria-hidden="true"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                    </span>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 pl-10 text-base text-white placeholder-gray-300 transition-all duration-200 hover:bg-white/15 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="••••••••"
                      required={activeTab === "register"}
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 py-3 text-base font-medium text-white transition hover:bg-blue-700 active:scale-[0.98] active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 shadow-lg shadow-blue-600/30"
              >
                {loading
                  ? "Processing..."
                  : activeTab === "login"
                    ? "Login"
                    : "Register"}
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-1 h-px bg-white/15" />
                <span className="mx-3 text-xs uppercase tracking-[0.2em] text-white/50">
                  or
                </span>
                <div className="flex-1 h-px bg-white/15" />
              </div>

              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-white py-3 text-base font-medium text-slate-900 transition hover:bg-slate-100 active:scale-[0.98] active:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 shadow-lg shadow-black/20"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 4 1.5l2.7-2.6C16.9 3.2 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.1-.2-1.6H12z"
                  />
                </svg>
                <span>
                  {loading ? "Processing..." : "Continue with Google"}
                </span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
