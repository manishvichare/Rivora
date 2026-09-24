/**
 * Rivora - Firebase Phone Authentication Service
 * Project: rivora-a1993
 * Provides real-time SMS OTP dispatch and verification via Google Firebase.
 */

const firebaseConfig = {
  apiKey: "AIzaSyAP6A1QXa9ziPmOh3n3Np-zk0h4NYWqfQQ",
  authDomain: "rivora-a1993.firebaseapp.com",
  projectId: "rivora-a1993",
  storageBucket: "rivora-a1993.firebasestorage.app",
  messagingSenderId: "651043603424",
  appId: "1:651043603424:web:2c24c4b303d31589ade185",
  measurementId: "G-6QHK58PR6Z"
};

// Initialize Firebase App
if (typeof firebase !== "undefined" && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const RivoraFirebaseAuth = {
  recaptchaVerifier: null,
  confirmationResult: null,

  formatE164(phone) {
    if (!phone) return "";
    const clean = phone.replace(/[\s\-\(\)]/g, "");
    if (clean.startsWith("+")) {
      return clean;
    }
    const digits = clean.replace(/\D/g, "");
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    if (digits.length > 10) {
      return `+${digits}`;
    }
    return `+91${digits}`;
  },

  initRecaptcha(containerId = "recaptcha-container") {
    try {
      if (this.recaptchaVerifier) {
        try {
          this.recaptchaVerifier.clear();
        } catch (e) {}
        this.recaptchaVerifier = null;
      }

      this.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(containerId, {
        size: "invisible",
        callback: (response) => {
          console.log("[RivoraFirebaseAuth] reCAPTCHA verified successfully.");
        },
        "expired-callback": () => {
          console.warn("[RivoraFirebaseAuth] reCAPTCHA expired, resetting...");
          if (this.recaptchaVerifier) {
            this.recaptchaVerifier.render();
          }
        }
      });

      return this.recaptchaVerifier;
    } catch (err) {
      console.error("[RivoraFirebaseAuth] Error initializing reCAPTCHA:", err);
      throw err;
    }
  },

  async sendOtp(phone, containerId = "recaptcha-container") {
    const formattedPhone = this.formatE164(phone);
    if (!formattedPhone || formattedPhone.length < 10) {
      throw new Error("Please enter a valid phone number (e.g. 10 digits).");
    }

    try {
      const verifier = this.initRecaptcha(containerId);
      console.log(`[RivoraFirebaseAuth] Requesting real SMS OTP for ${formattedPhone}...`);
      
      const confirmationResult = await firebase.auth().signInWithPhoneNumber(formattedPhone, verifier);
      this.confirmationResult = confirmationResult;
      window.rivoraConfirmationResult = confirmationResult;
      
      console.log("[RivoraFirebaseAuth] SMS OTP dispatched successfully via Firebase.");
      return {
        success: true,
        formattedPhone: formattedPhone,
        confirmationResult: confirmationResult
      };
    } catch (err) {
      console.error("[RivoraFirebaseAuth] dispatch error:", err);
      let message = "Unable to dispatch SMS verification code. Please check your number and try again.";
      if (err.code === "auth/billing-not-enabled") {
        message = "SMS service is temporarily unavailable. Please try again shortly or contact support.";
      } else if (err.code === "auth/invalid-phone-number") {
        message = "Please enter a valid 10-digit mobile phone number.";
      } else if (err.code === "auth/too-many-requests") {
        message = "Too many verification requests. Please wait a few minutes before trying again.";
      } else if (err.code === "auth/quota-exceeded") {
        message = "Daily SMS limit reached. Please contact support.";
      } else if (err.code === "auth/network-request-failed") {
        message = "Network error. Please check your internet connection.";
      } else if (err.code === "auth/unauthorized-domain") {
        message = "Domain not authorized for verification. Please access via localhost.";
      } else if (err.message) {
        message = err.message.replace(/firebase:?/gi, "").replace(/error\s*\([^\)]*\):?/gi, "").replace(/\bauth\/[a-z0-9\-_]+/gi, "").trim() || message;
      }
      const customErr = new Error(message);
      customErr.code = err.code;
      throw customErr;
    }
  },

  async verifyOtp(code) {
    const confirmation = this.confirmationResult || window.rivoraConfirmationResult;
    if (!confirmation) {
      throw new Error("Verification session not found. Please request a new OTP code.");
    }
    const cleanCode = (code || "").trim();
    if (!cleanCode || cleanCode.length !== 6) {
      throw new Error("Please enter a valid 6-digit SMS verification code.");
    }

    try {
      const result = await confirmation.confirm(cleanCode);
      const user = result.user;
      const idToken = await user.getIdToken();
      return {
        success: true,
        user: user,
        idToken: idToken,
        phoneNumber: user.phoneNumber
      };
    } catch (err) {
      console.error("[RivoraFirebaseAuth] OTP verification error:", err);
      let message = "Incorrect SMS verification code. Please check your phone messages.";
      if (err.code === "auth/invalid-verification-code") {
        message = "Invalid 6-digit verification code. Please check your SMS and try again.";
      } else if (err.code === "auth/code-expired") {
        message = "Verification code has expired. Please click Resend SMS.";
      } else if (err.message) {
        message = err.message.replace(/firebase:?/gi, "").replace(/error\s*\([^\)]*\):?/gi, "").replace(/\bauth\/[a-z0-9\-_]+/gi, "").trim() || message;
      }
      const customErr = new Error(message);
      customErr.code = err.code;
      throw customErr;
    }
  }

};

window.RivoraFirebaseAuth = RivoraFirebaseAuth;
