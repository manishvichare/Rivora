/**
 * Rivora API Client
 * Same-origin API in production; local backend while using Vite.
 * Handles API communication, authentication tokens, and endpoints.
 */

const API_BASE = window.location.port === "5173" ? "http://localhost:8000" : window.location.origin;

const RivoraAPI = {
  baseUrl: API_BASE,

  // Tab-isolated Token & Business storage with localStorage fallback
  getToken() {
    try {
      return sessionStorage.getItem("rivora_token") || localStorage.getItem("rivora_token");
    } catch (e) {
      return null;
    }
  },

  getUser() {
    try {
      let u = sessionStorage.getItem("rivora_user");
      if (!u) {
        u = localStorage.getItem("rivora_user");
      }
      if (!u) return null;
      return JSON.parse(u);
    } catch (e) {
      return null;
    }
  },

  getCurrentUser() {
    return this.getUser();
  },

  setAuth(token, user) {
    try {
      if (token) {
        sessionStorage.setItem("rivora_token", token);
        localStorage.setItem("rivora_token", token);
      }
      if (user) {
        sessionStorage.setItem("rivora_user", JSON.stringify(user));
        localStorage.setItem("rivora_user", JSON.stringify(user));
      }
    } catch (e) {
      console.warn("[RivoraAPI] Storage write error:", e);
    }
  },

  clearAuth() {
    try {
      sessionStorage.removeItem("rivora_token");
      sessionStorage.removeItem("rivora_user");
      // Also ensure legacy shared keys are removed
      localStorage.removeItem("rivora_token");
      localStorage.removeItem("rivora_user");
    } catch (e) {
      console.warn("[RivoraAPI] Storage clear error:", e);
    }
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  getHeaders(requireAuth = false) {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  },

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const defaultHeaders = this.getHeaders(options.requireAuth);
    const finalHeaders = { ...defaultHeaders, ...(options.headers || {}) };

    const config = {
      ...options,
      headers: finalHeaders,
    };

    try {
      const res = await fetch(url, config);
      let data = null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      if (!res.ok) {
        if (res.status === 401 && options.requireAuth) {
          this.clearAuth();
          const path = window.location.pathname.toLowerCase();
          const isProtectedPage = path.endsWith('provider.html') || path.endsWith('requests.html') || path.endsWith('analytics.html') || path.endsWith('profile.html');
          if (isProtectedPage) {
            window.location.href = 'login.html';
          }
        }
        const errorDetail = (data && data.detail) ? data.detail : (res.statusText || "Request failed");
        const err = new Error(typeof errorDetail === "string" ? errorDetail : JSON.stringify(errorDetail));
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (error) {
      console.warn(`[RivoraAPI] Error on ${options.method || "GET"} ${endpoint}:`, error.message);
      throw error;
    }
  },

  // Health check
  async checkHealth() {
    try {
      const data = await this.request("/health", { method: "GET" });
      return data && data.status === "healthy";
    } catch (e) {
      return false;
    }
  },

  // Auth
  async initiateSignupVerification(data) {
    return this.request("/auth/signup/initiate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async verifySignup(sessionId, emailOtp, mobileOtp = null) {
    const payload = {
      session_id: sessionId,
      email_otp: emailOtp,
    };
    if (mobileOtp) {
      payload.mobile_otp = mobileOtp;
    }
    const res = await this.request("/auth/signup/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (res && res.access_token) {
      this.setAuth(res.access_token, res.business);
    }
    return res;
  },

  async resendSignupOtp(sessionId, channel = "email") {
    return this.request("/auth/signup/resend", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        channel: channel,
      }),
    });
  },

  async signupWithFirebasePhone(data) {
    const res = await this.request("/auth/signup/firebase-phone", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (res && res.access_token) {
      this.setAuth(res.access_token, res.business);
    }
    return res;
  },

  async signup(data) {
    // Direct signup is locked: calls initiate flow
    return this.initiateSignupVerification(data);
  },


  async login(email, password) {
    const res = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res && res.access_token) {
      this.setAuth(res.access_token, res.business);
    }
    return res;
  },

  async verifyLoginOtp(sessionId, otp) {
    const res = await this.request("/auth/login-verify", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, otp: otp }),
    });
    if (res && res.access_token) {
      this.setAuth(res.access_token, res.business);
    }
    return res;
  },

  async resendLoginOtp(sessionId) {
    return this.request("/auth/login-resend-otp", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    });
  },

  async getMe() {
    return this.request("/auth/me", {
      method: "GET",
      requireAuth: true,
    });
  },

  // Resources
  async searchResources(params = {}) {
    const q = new URLSearchParams();
    if (params.type) q.append("type", params.type.toLowerCase());
    if (params.location) q.append("location", params.location);
    if (params.budget) q.append("budget", params.budget);
    if (params.lat) q.append("lat", params.lat);
    if (params.lon) q.append("lon", params.lon);
    if (params.start_time) q.append("start_time", params.start_time);
    if (params.end_time) q.append("end_time", params.end_time);
    if (params.min_capacity) q.append("min_capacity", params.min_capacity);

    const queryStr = q.toString() ? `?${q.toString()}` : "";
    return this.request(`/resources/search${queryStr}`, { method: "GET" });
  },

  async getResource(id) {
    return this.request(`/resources/${id}`, { method: "GET" });
  },

  async getMyResources() {
    return this.request("/resources/mine/list", {
      method: "GET",
      requireAuth: true,
    });
  },

  async createResource(resourceData) {
    return this.request("/resources", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify(resourceData),
    });
  },

  async updateResource(id, resourceData) {
    return this.request(`/resources/${id}`, {
      method: "PATCH",
      requireAuth: true,
      body: JSON.stringify(resourceData),
    });
  },

  async deleteResource(id) {
    return this.request(`/resources/${id}`, {
      method: "DELETE",
      requireAuth: true,
    });
  },

  async toggleBlockDate(resourceId, dateStr) {
    return this.request(`/resources/${resourceId}/toggle-block-date`, {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({ date: dateStr }),
    });
  },

  // Bookings
  async createBooking(bookingData) {
    return this.request("/bookings", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify(bookingData),
    });
  },

  async updateBookingStatus(id, updateData) {
    return this.request(`/bookings/${id}`, {
      method: "PATCH",
      requireAuth: true,
      body: JSON.stringify(updateData),
    });
  },

  async getMyBookings() {
    return this.request("/bookings/mine", {
      method: "GET",
      requireAuth: true,
    });
  },

  async getBooking(id) {
    return this.request(`/bookings/${id}`, {
      method: "GET",
      requireAuth: true,
    });
  },

  async createCounterOffer(bookingId, amountOrPayload, notes = "") {
    let amount = amountOrPayload;
    let noteText = notes;
    if (typeof amountOrPayload === 'object' && amountOrPayload !== null) {
      amount = amountOrPayload.amount;
      noteText = amountOrPayload.notes || "";
    }
    return this.request(`/bookings/${bookingId}/counter`, {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({ amount: parseFloat(amount), notes: noteText }),
    });
  },

  async getBookingMessages(bookingId) {
    return this.request(`/bookings/${bookingId}/messages`, {
      method: "GET",
      requireAuth: true,
    });
  },

  async confirmBooking(bookingId) {
    return this.request(`/bookings/${bookingId}/confirm`, {
      method: "POST",
      requireAuth: true,
    });
  },

  // Verification & Trust API
  async getSeekerVerificationStatus() {
    return this.request("/verification/seeker/status", {
      method: "GET",
      requireAuth: true,
    });
  },

  async submitSeekerVerification(data) {
    return this.request("/verification/seeker/submit", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify(data),
    });
  },

  async sendMobileOtp(mobileNumber) {
    return this.request("/verification/seeker/mobile/send-otp", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({ mobile_number: mobileNumber }),
    });
  },

  async verifyMobileOtp(mobileNumber, otp) {
    return this.request("/verification/seeker/mobile/verify-otp", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({ mobile_number: mobileNumber, otp: otp }),
    });
  },

  async sendAadhaarOtp(aadhaarNumber) {
    return this.request("/verification/seeker/aadhaar/send-otp", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({ aadhaar_number: aadhaarNumber }),
    });
  },

  async verifyAadhaarOtp(otp) {
    return this.request("/verification/seeker/aadhaar/verify-otp", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({ otp: otp }),
    });
  },

  async getProviderVerificationStatus() {
    return this.request("/verification/provider/status", {
      method: "GET",
      requireAuth: true,
    });
  },

  async submitProviderDocument(data) {
    return this.request("/verification/provider/document", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify(data),
    });
  },

  async getAdminVerificationStats() {
    return this.request("/verification/admin/stats", {
      method: "GET",
      requireAuth: true,
    });
  },

  async getAdminProviderDocuments() {
    return this.request("/verification/admin/documents", {
      method: "GET",
      requireAuth: true,
    });
  },

  async getAdminDocuments() {
    return this.getAdminProviderDocuments();
  },

  async reviewProviderDocument(docId, data) {
    return this.request(`/verification/admin/documents/${docId}/review`, {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify(data),
    });
  },

  async getAdminDuplicateFlags() {
    return this.request("/verification/admin/duplicate-flags", {
      method: "GET",
      requireAuth: true,
    });
  },

  async getAdminSecurityLogs() {
    return this.request("/verification/admin/security-logs", {
      method: "GET",
      requireAuth: true,
    });
  },

  // Transactions, Escrow & Invoicing
  async getMyTransactions() {
    return this.request("/transactions/mine", {
      method: "GET",
      requireAuth: true,
    });
  },

  async getTransactionByBooking(bookingId) {
    return this.request(`/transactions/by-booking/${bookingId}`, {
      method: "GET",
      requireAuth: true,
    });
  },

  async getEscrowDetails(txnId) {
    return this.request(`/transactions/${txnId}/escrow`, {
      method: "GET",
      requireAuth: true,
    });
  },

  async acceptTerms(txnId, data = {}) {
    return this.request(`/transactions/${txnId}/terms/accept`, {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify(data),
    });
  },

  async getServiceAgreement(txnId) {
    return this.request(`/transactions/${txnId}/agreement`, {
      method: "GET",
      requireAuth: true,
    });
  },

  async getInvoice(txnId) {
    return this.request(`/transactions/${txnId}/invoice`, {
      method: "GET",
      requireAuth: true,
    });
  },

  async requestRefund(txnId, data) {
    return this.request(`/transactions/${txnId}/refund`, {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify(data),
    });
  },

  // Notifications
  async getNotifications(category = null) {
    const q = category ? `?category=${encodeURIComponent(category)}` : "";
    return this.request(`/notifications${q}`, {
      method: "GET",
      requireAuth: true,
    });
  },

  async getUnreadNotificationCount() {
    return this.request("/notifications/unread-count", {
      method: "GET",
      requireAuth: true,
    });
  },

  async markNotificationRead(notifId) {
    return this.request(`/notifications/${notifId}/read`, {
      method: "PATCH",
      requireAuth: true,
    });
  },

  async markAllNotificationsRead() {
    return this.request("/notifications/mark-all-read", {
      method: "POST",
      requireAuth: true,
    });
  },

  async sendBookingMessage(bookingId, text, type = "chat") {
    return this.request(`/bookings/${bookingId}/messages`, {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({ message_text: text, message_type: type }),
    });
  },

  async getResource(id) {
    return this.request(`/resources/${id}`, { method: "GET" });
  },

  async getResourceBookedSlots(resourceId) {
    return this.request(`/resources/${resourceId}/booked-slots`, { method: "GET" });
  },

  async updateProfile(data) {
    const res = await this.request("/auth/me", {
      method: "PATCH",
      requireAuth: true,
      body: JSON.stringify(data),
    });
    if (res) {
      try {
        sessionStorage.setItem("rivora_user", JSON.stringify(res));
      } catch (e) {}
    }
    return res;
  },

  async getAnalytics() {
    return this.request("/analytics/summary", {
      method: "GET",
      requireAuth: true,
    });
  },

  // Requirements
  async getRequirements() {
    return this.request("/requirements", { method: "GET" });
  },

  async createRequirement(data) {
    return this.request("/requirements", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify(data),
    });
  },

  async getMyRequirements() {
    return this.request("/requirements/mine", {
      method: "GET",
      requireAuth: true,
    });
  },

  async getRequirementsMatches(requirementId) {
    return this.request(`/requirements/${requirementId}/matches`, {
      method: "GET",
      requireAuth: true,
    });
  },

  // Reviews
  async getResourceReviews(resourceId) {
    return this.request(`/reviews/resource/${resourceId}`, { method: "GET" });
  },

  async createReview(reviewData) {
    return this.request("/reviews", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify(reviewData),
    });
  },

  // Cloudinary unsigned upload — returns secure_url string
  async uploadToCloudinary(file) {
    const CLOUD_NAME = "jfftswdp";
    const UPLOAD_PRESET = "rivora_preset";
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    const res = await fetch(url, { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Cloudinary upload failed");
    }
    const data = await res.json();
    return data.secure_url;  // e.g. https://res.cloudinary.com/jfftswdp/image/upload/...
  },
};

window.RivoraAPI = RivoraAPI;
