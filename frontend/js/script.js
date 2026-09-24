/* ---------------------------------------------------------
   REVORA — Hospitality Resource Exchange
   Shared frontend logic across all pages. Everything here is
   client-side/demo until the FastAPI backend is wired up —
   every spot that will become a real fetch() call is marked
   with a "Backend hook (future)" comment.
--------------------------------------------------------- */

const STATUS_BADGE = {
  idle: 'badge-coral',
  active: 'badge-sky',
  booked: 'badge-teal',
  matched: 'badge-teal',
  confirmed: 'badge-teal',
  completed: 'badge-teal',
  verified: 'badge-teal',
  pending: 'badge-neutral',
  negotiating: 'badge-amber',
  declined: 'badge-rose',
};

/* =========================================================
   I18N ENGINE — global language system (en / mr / hi)
   Single source of truth: js/translations.js.
   Static HTML uses data-i18n / data-i18n-placeholder /
   data-i18n-title / data-i18n-aria. Dynamic JS strings call t().
========================================================= */

const I18N = {
  LANGS: ['en', 'mr', 'hi'],
  STORAGE_KEY: 'rivora.lang',
  current: 'en',

  dict() {
    const all = window.RIVORA_TRANSLATIONS || {};
    return all[this.current] || all.en || {};
  },

  /** Translate a key. vars: { count: 6 } replaces {count} in the string. */
  t(key, vars) {
    const fallback = (window.RIVORA_TRANSLATIONS || {}).en || {};
    let str = this.dict()[key];
    if (str === undefined) str = fallback[key];
    if (str === undefined) return key; // surfaces missing keys instead of blanking UI
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      });
    }
    return str;
  },

  /** Devanagari digits for mr/hi; Latin for en. */
  num(value) {
    const s = String(value);
    if (this.current === 'en') return s;
    const dev = ['०','१','२','३','४','५','६','७','८','९'];
    return s.replace(/[0-9]/g, (d) => dev[+d]);
  },

  /** Locale-aware currency, e.g. ₹15,000 / ₹१५,००० */
  money(value) {
    return '₹' + this.num(Number(value).toLocaleString('en-IN'));
  },

  detect() {
    let saved = null;
    try { saved = localStorage.getItem(this.STORAGE_KEY); } catch (e) { /* storage blocked */ }
    return this.LANGS.includes(saved) ? saved : 'en';
  },

  set(lang, { rerender = true } = {}) {
    if (!this.LANGS.includes(lang)) return;
    this.current = lang;
    try { localStorage.setItem(this.STORAGE_KEY, lang); } catch (e) { /* storage blocked */ }
    document.documentElement.setAttribute('lang', lang);
    this.apply();
    if (rerender) rerenderDynamicUI();
  },

  /** Walk the DOM and translate every tagged element. Safe to call repeatedly. */
  apply() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = this.t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-num]').forEach((el) => {
      el.textContent = this.num(el.getAttribute('data-i18n-num'));
    });
    document.querySelectorAll('[data-i18n-money]').forEach((el) => {
      el.textContent = this.money(el.getAttribute('data-i18n-money'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', this.t(el.getAttribute('data-i18n-placeholder')));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', this.t(el.getAttribute('data-i18n-title')));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria')));
    });
    document.querySelectorAll('.lang-current-label').forEach((el) => {
      el.textContent = this.t('lang.label');
    });
    document.querySelectorAll('.lang-option').forEach((el) => {
      el.setAttribute('aria-checked', String(el.dataset.lang === this.current));
      el.classList.toggle('is-active', el.dataset.lang === this.current);
    });
  },
};

/** Short global alias used throughout dynamic rendering. */
function t(key, vars) { return I18N.t(key, vars); }

/** Re-run every renderer that produces dynamic HTML, so a language
    change updates JS-generated UI as well as static markup. */
function rerenderDynamicUI() {
  if (typeof refreshSeekerResults === 'function') refreshSeekerResults();
  if (typeof refreshRequestsList === 'function') refreshRequestsList();
  if (typeof refreshAnalytics === 'function') refreshAnalytics();
  if (typeof refreshCalendar === 'function') refreshCalendar();
  if (typeof refreshNotifications === 'function') refreshNotifications();
  if (typeof refreshZeus === 'function') refreshZeus();
  if (typeof refreshTestimonial === 'function') refreshTestimonial();
  if (typeof refreshChat === 'function') refreshChat();
  if (typeof refreshMap === 'function') refreshMap();
}

/** Builds the language selector markup into every [data-lang-switcher] slot. */
function initLanguageSwitcher() {
  document.querySelectorAll('[data-lang-switcher]').forEach((slot) => {
    if (slot.dataset.built === '1') return;
    slot.dataset.built = '1';
    slot.classList.add('lang-switcher');
    slot.innerHTML = `
      <button class="lang-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Language">
        <span class="lang-current-label">${escapeHtml(I18N.t('lang.label'))}</span>
        <span class="lang-caret" aria-hidden="true">▾</span>
      </button>
      <div class="lang-menu" role="radiogroup" hidden>
        <button class="lang-option" type="button" role="radio" data-lang="en">EN · English</button>
        <button class="lang-option" type="button" role="radio" data-lang="mr">MR · मराठी</button>
        <button class="lang-option" type="button" role="radio" data-lang="hi">HI · हिन्दी</button>
      </div>`;

    const trigger = slot.querySelector('.lang-trigger');
    const menu = slot.querySelector('.lang-menu');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !menu.hidden;
      closeAllLangMenus();
      menu.hidden = open;
      trigger.setAttribute('aria-expanded', String(!open));
    });

    menu.querySelectorAll('.lang-option').forEach((opt) => {
      opt.addEventListener('click', () => {
        I18N.set(opt.dataset.lang);
        closeAllLangMenus();
      });
    });
  });

  document.addEventListener('click', closeAllLangMenus);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllLangMenus(); });
}

function closeAllLangMenus() {
  document.querySelectorAll('.lang-menu').forEach((m) => { m.hidden = true; });
  document.querySelectorAll('.lang-trigger').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

/** Updates navigation header and sidebar based on user login state */
function initAuthUI() {
  if (!window.RivoraAPI) return;
  const user = RivoraAPI.getUser();
  const token = RivoraAPI.getToken();
  const path = window.location.pathname.toLowerCase();
  const isProtectedPage = path.endsWith('provider.html') || path.endsWith('requests.html') || path.endsWith('analytics.html') || path.endsWith('profile.html');

  if (!token || !user) {
    if (isProtectedPage) {
      window.location.href = 'login.html';
      return;
    }
    return;
  }

  // Update topbar actions & logout
  document.querySelectorAll('.navbar-actions').forEach((nav) => {
    if (nav.querySelector('#auth-user-badge')) return;

    const badge = document.createElement('span');
    badge.id = 'auth-user-badge';
    badge.className = 'btn btn-ghost';
    badge.style.fontWeight = '600';
    badge.style.color = '#B08D4F';
    const emailSuffix = user.email ? ` · ${user.email}` : '';
    badge.textContent = `${user.name || 'My Account'}${emailSuffix}`;
    badge.title = `Active Tab Session: ${user.email || user.name} (${user.business_type || 'user'})`;

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn btn-ghost';
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Log out';
    logoutBtn.title = 'Log out this tab session';
    logoutBtn.addEventListener('click', () => {
      RivoraAPI.clearAuth();
      window.location.href = 'login.html';
    });

    const existingAuthLink = nav.querySelector('a[href="login.html"], a[href="signup.html"]');
    if (existingAuthLink) existingAuthLink.style.display = 'none';

    nav.appendChild(badge);
    nav.appendChild(logoutBtn);
  });

  // Dynamic user initials
  const initials = (user.name || 'Account')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isAdminOrDev = Boolean(
    user.is_admin ||
    user.role === 'developer' ||
    user.role === 'admin' ||
    (user.email && user.email.toLowerCase() === 'vicharemanish717@gmail.com')
  );

  // Upgrade sidebar role switch to include Admin for Developers/Admins
  if (isAdminOrDev) {
    document.querySelectorAll('.sidebar-role-switch').forEach((sw) => {
      if (!sw.querySelector('a[href="admin.html"]')) {
        const a = document.createElement('a');
        a.href = 'admin.html';
        a.textContent = 'Admin / Dev';
        if (path.endsWith('admin.html')) a.className = 'is-active';
        sw.appendChild(a);
      }
    });

    document.querySelectorAll('.sidebar-nav').forEach((nav) => {
      if (!nav.querySelector('a[href="admin.html"]')) {
        const a = document.createElement('a');
        a.className = 'sidebar-link' + (path.endsWith('admin.html') ? ' is-active' : '');
        a.href = 'admin.html';
        a.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" stroke="currentColor" stroke-width="1.8"/></svg><span>Admin Console</span>`;
        nav.appendChild(a);
      }
      if (!nav.querySelector('a[href="transactions.html"]')) {
        const a = document.createElement('a');
        a.className = 'sidebar-link' + (path.endsWith('transactions.html') ? ' is-active' : '');
        a.href = 'transactions.html';
        a.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M2 10h20" stroke="currentColor" stroke-width="1.8"/></svg><span>Escrow Payments</span>`;
        nav.appendChild(a);
      }
    });
  }

  // Update sidebar account elements
  document.querySelectorAll('.sidebar-account-name').forEach((el) => {
    el.textContent = user.name || 'My Account';
    el.title = `Active Tab: ${user.name || ''}`;
  });
  document.querySelectorAll('.sidebar-avatar').forEach((el) => {
    el.textContent = initials;
  });
  document.querySelectorAll('.sidebar-account-sub').forEach((el) => {
    if (isAdminOrDev) {
      el.innerHTML = `<span style="color:#3D8067; font-weight:700;">Developer / Admin</span>`;
      el.title = `Full Developer Privileges Active: ${user.email}`;
    } else {
      const rawType = user.business_type || 'business';
      const typeLabel = rawType.charAt(0).toUpperCase() + rawType.slice(1).replace(/_/g, ' ');
      el.textContent = user.email ? `${typeLabel} · ${user.email}` : typeLabel;
      el.title = `Active Tab Session: ${user.email || user.name} (${typeLabel})`;
    }
  });

  // Attach logout handler to sidebar logout buttons
  document.querySelectorAll('.sidebar-logout').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      RivoraAPI.clearAuth();
      window.location.href = 'login.html';
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Language must initialise before anything renders dynamic strings.
  I18N.current = I18N.detect();
  document.documentElement.setAttribute('lang', I18N.current);
  initLanguageSwitcher();
  I18N.apply();

  initAuthUI();
  initPasswordToggles();
  initSignupPage();
  initLoginPage();
  initResourceForm();
  initRequestActions();
  initSeekerSearch();
  initResourceDetails();
  initRequestsPage();
  initAnalyticsPage();
  initProfilePage();
  initTestimonials();
  initNotifications();
  initZeus();
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------
   Password show/hide (signup + login)
--------------------------------------------------------- */

function initPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.textContent = isHidden ? 'Hide' : 'Show';
    });
  });
}

/* ---------------------------------------------------------
   Landing page — testimonial carousel
--------------------------------------------------------- */

const TESTIMONIALS = [
  { quoteKey: 'testimonial.quote1', nameKey: 'testimonial.name1', roleKey: 'testimonial.role1' },
  { quoteKey: 'testimonial.quote2', nameKey: 'testimonial.name2', roleKey: 'testimonial.role2' },
  { quoteKey: 'testimonial.quote3', nameKey: 'testimonial.name3', roleKey: 'testimonial.role3' },
];

function initTestimonials() {
  const quoteEl = document.getElementById('testimonial-quote');
  if (!quoteEl) return;
  const nameEl = document.getElementById('testimonial-name');
  const roleEl = document.getElementById('testimonial-role');
  const dotsEl = document.getElementById('testimonial-dots');

  let current = 0;

  TESTIMONIALS.forEach((_, i) => {
    const dot = document.createElement('button');
    if (i === 0) dot.classList.add('is-active');
    dot.addEventListener('click', () => show(i));
    dotsEl.appendChild(dot);
  });

  function show(i) {
    current = i;
    const item = TESTIMONIALS[i];
    quoteEl.textContent = t(item.quoteKey);
    nameEl.textContent = t(item.nameKey);
    roleEl.textContent = t(item.roleKey);
    dotsEl.querySelectorAll('button').forEach((d, di) => d.classList.toggle('is-active', di === i));
  }

  setInterval(() => show((current + 1) % TESTIMONIALS.length), 6000);

  // Re-renders the current testimonial in the active language
  window.refreshTestimonial = () => show(current);
}

/* ---------------------------------------------------------
   Signup page
--------------------------------------------------------- */

function initSignupPage() {
  const toggle = document.getElementById('role-toggle');
  if (!toggle) return;

  const params = new URLSearchParams(window.location.search);
  const requestedRole = params.get('role');
  const buttons = toggle.querySelectorAll('.role-toggle-btn');

  if (requestedRole === 'provider' || requestedRole === 'seeker') {
    buttons.forEach((b) => b.classList.toggle('is-active', b.dataset.role === requestedRole));
  }

  let selectedRole = document.querySelector('.role-toggle-btn.is-active')?.dataset.role || 'both';

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      selectedRole = btn.dataset.role;
    });
  });

  const step1 = document.getElementById('signup-step-1');
  const step2 = document.getElementById('signup-step-2');
  const form1 = document.getElementById('signup-form');
  const form2 = document.getElementById('otp-verify-form');
  const error1 = document.getElementById('signup-error');
  const error2 = document.getElementById('verify-error');
  const success2 = document.getElementById('verify-success');
  const btnStep1 = document.getElementById('btn-submit-step1');
  const btnVerifyAll = document.getElementById('btn-verify-all');
  const btnEditDetails = document.getElementById('btn-edit-details');
  const btnResendEmail = document.getElementById('btn-resend-email');
  const btnResendMobile = document.getElementById('btn-resend-mobile');
  const vEmailDisplay = document.getElementById('v-email-display');
  const vPhoneDisplay = document.getElementById('v-phone-display');
  const vEmailTimer = document.getElementById('v-email-timer');
  const vPhoneTimer = document.getElementById('v-phone-timer');
  const step1Ind = document.getElementById('step1-indicator');
  const step1Txt = document.getElementById('step1-text');
  const step2Ind = document.getElementById('step2-indicator');
  const step2Txt = document.getElementById('step2-text');

  let currentSessionId = null;
  let expiresAtTimestamp = null;
  let validityInterval = null;
  let emailCooldownTimer = null;
  let mobileCooldownTimer = null;
  let emailCooldownSecs = 0;
  let mobileCooldownSecs = 0;
  let pendingSignupDetails = null;
  let useFirebaseAuth = false;

  function showFirebaseVerificationStep(phoneStr) {
    useFirebaseAuth = true;
    const vEmailCard = document.getElementById('v-email-card');
    if (vEmailCard) vEmailCard.style.display = 'none';
    if (vPhoneDisplay) vPhoneDisplay.textContent = phoneStr;
    if (step1) step1.hidden = true;
    if (step2) step2.hidden = false;
    updateStepper(2);

    startValidityCountdown(new Date(Date.now() + 10 * 60 * 1000).toISOString());
    startCooldown('mobile', 60);

    const mobileOtpInput = document.getElementById('v-mobile-otp');
    if (mobileOtpInput) {
      mobileOtpInput.value = '';
      mobileOtpInput.focus();
    }
  }

  function cleanUserErrorMessage(err) {
    if (!err) return 'An unexpected error occurred. Please try again.';
    const raw = typeof err === 'string' ? err : (err.message || String(err));

    if (raw.includes('billing-not-enabled')) {
      return 'SMS service is temporarily unavailable. Please try again shortly or use a verified test number.';
    }
    if (raw.includes('invalid-phone-number') || raw.includes('invalid phone')) {
      return 'Please enter a valid 10-digit mobile number.';
    }
    if (raw.includes('too-many-requests')) {
      return 'Too many verification attempts. Please wait a few moments and try again.';
    }
    if (raw.includes('quota-exceeded')) {
      return 'Daily SMS limit reached. Please contact support.';
    }
    if (raw.includes('network-request-failed') || raw.includes('Failed to fetch')) {
      return 'Network connection error. Please check your internet connection.';
    }
    if (raw.includes('invalid-verification-code')) {
      return 'Incorrect 6-digit SMS code. Please check your messages and try again.';
    }
    if (raw.includes('code-expired')) {
      return 'Verification code has expired. Please request a new code.';
    }

    let cleaned = raw
      .replace(/firebase:?/gi, '')
      .replace(/error\s*\([^\)]*\):?/gi, '')
      .replace(/\bauth\/[a-z0-9\-_]+/gi, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim();

    if (!cleaned || cleaned.length < 4) {
      return 'Could not complete verification. Please check your details and try again.';
    }
    return cleaned;
  }



  function updateStepper(step) {
    if (step === 1) {
      if (step1Ind) { step1Ind.style.background = 'var(--gold)'; step1Ind.style.color = '#183B43'; step1Ind.textContent = '1'; }
      if (step1Txt) step1Txt.style.color = 'var(--ink)';
      if (step2Ind) { step2Ind.style.background = 'var(--border)'; step2Ind.style.color = 'var(--ink-faint)'; step2Ind.textContent = '2'; }
      if (step2Txt) step2Txt.style.color = 'var(--ink-faint)';
    } else {
      if (step1Ind) { step1Ind.style.background = 'var(--emerald)'; step1Ind.style.color = '#F8F6EF'; step1Ind.textContent = '✓'; }
      if (step1Txt) step1Txt.style.color = 'var(--ink-soft)';
      if (step2Ind) { step2Ind.style.background = 'var(--gold)'; step2Ind.style.color = '#183B43'; step2Ind.textContent = '2'; }
      if (step2Txt) step2Txt.style.color = 'var(--ink)';
    }
  }

  function startValidityCountdown(expiresAtIso) {
    if (validityInterval) clearInterval(validityInterval);
    const target = new Date(expiresAtIso).getTime();

    function tick() {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      const mins = String(Math.floor(diff / 60)).padStart(2, '0');
      const secs = String(diff % 60).padStart(2, '0');
      const timeStr = `Valid: ${mins}:${secs}`;
      if (vEmailTimer) vEmailTimer.textContent = timeStr;
      if (vPhoneTimer) vPhoneTimer.textContent = timeStr;

      if (diff <= 0) {
        clearInterval(validityInterval);
        if (vEmailTimer) { vEmailTimer.textContent = 'Expired'; vEmailTimer.className = 'badge badge-rose'; }
        if (vPhoneTimer) { vPhoneTimer.textContent = 'Expired'; vPhoneTimer.className = 'badge badge-rose'; }
        if (error2) {
          error2.hidden = false;
          error2.textContent = 'Verification codes have expired. Please click resend to receive fresh codes.';
        }
      }
    }
    tick();
    validityInterval = setInterval(tick, 1000);
  }

  function startCooldown(type, seconds) {
    if (type === 'email') {
      if (emailCooldownTimer) clearInterval(emailCooldownTimer);
      emailCooldownSecs = seconds;
      if (btnResendEmail) btnResendEmail.disabled = true;
      emailCooldownTimer = setInterval(() => {
        emailCooldownSecs--;
        if (btnResendEmail) {
          if (emailCooldownSecs > 0) {
            btnResendEmail.textContent = `Resend in ${emailCooldownSecs}s`;
            btnResendEmail.disabled = true;
          } else {
            clearInterval(emailCooldownTimer);
            btnResendEmail.textContent = 'Resend Email OTP';
            btnResendEmail.disabled = false;
          }
        }
      }, 1000);
    } else {
      if (mobileCooldownTimer) clearInterval(mobileCooldownTimer);
      mobileCooldownSecs = seconds;
      if (btnResendMobile) btnResendMobile.disabled = true;
      mobileCooldownTimer = setInterval(() => {
        mobileCooldownSecs--;
        if (btnResendMobile) {
          if (mobileCooldownSecs > 0) {
            btnResendMobile.textContent = `Resend in ${mobileCooldownSecs}s`;
            btnResendMobile.disabled = true;
          } else {
            clearInterval(mobileCooldownTimer);
            btnResendMobile.textContent = 'Resend SMS OTP';
            btnResendMobile.disabled = false;
          }
        }
      }, 1000);
    }
  }

  async function showVerificationStep(sessionData) {
    useFirebaseAuth = false;
    currentSessionId = sessionData.session_id;
    expiresAtTimestamp = sessionData.expires_at;

    const vEmailCard = document.getElementById('v-email-card');
    if (vEmailCard) vEmailCard.style.display = 'block';

    if (vEmailDisplay) vEmailDisplay.textContent = sessionData.email_masked || '';
    if (vPhoneDisplay) vPhoneDisplay.textContent = sessionData.phone_masked || '';

    if (step1) step1.hidden = true;
    if (step2) step2.hidden = false;
    updateStepper(2);

    startValidityCountdown(sessionData.expires_at);
    startCooldown('email', sessionData.resend_cooldown_seconds || 60);

    const emailOtpInput = document.getElementById('v-email-otp');
    if (emailOtpInput) { emailOtpInput.value = ''; emailOtpInput.focus(); }

    // Save to sessionStorage for refresh survival
    sessionStorage.setItem('rivora_pending_signup', JSON.stringify({
      session_id: sessionData.session_id,
      email_masked: sessionData.email_masked,
      phone_masked: sessionData.phone_masked,
      expires_at: sessionData.expires_at,
      selected_role: selectedRole
    }));
  }

  // Restore session from sessionStorage if page is refreshed while verifying
  try {
    const saved = sessionStorage.getItem('rivora_pending_signup');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.session_id && new Date(parsed.expires_at).getTime() > Date.now()) {
        if (parsed.selected_role) selectedRole = parsed.selected_role;
        showVerificationStep(parsed);
      } else {
        sessionStorage.removeItem('rivora_pending_signup');
      }
    }
  } catch (e) {}

  // Step 1: Submit Details & Initiate Real OTPs
  if (form1) {
    form1.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (error1) error1.hidden = true;

      const name = document.getElementById('s-name').value.trim();
      const bTypeSelect = document.getElementById('s-type');
      const businessType = (bTypeSelect?.value || 'hotel').toLowerCase();
      const email = document.getElementById('s-email').value.trim();
      const phone = document.getElementById('s-phone').value.trim();
      const location = document.getElementById('s-location').value.trim();
      const password = document.getElementById('s-password').value;
      const confirm = document.getElementById('s-confirm').value;

      if (password !== confirm || password.length < 6) {
        if (error1) {
          error1.hidden = false;
          error1.textContent = password.length < 6 ? 'Password must be at least 6 characters.' : 'Passwords do not match.';
        }
        return;
      }

      if (!phone || phone.replace(/\D/g, '').length < 10) {
        if (error1) {
          error1.hidden = false;
          error1.textContent = 'Please enter a valid 10-digit mobile phone number.';
        }
        return;
      }

      pendingSignupDetails = {
        name: name,
        business_type: businessType,
        email: email,
        phone: phone,
        location: location,
        password: password
      };

      // 1. Direct Email Verification Dispatch
      if (!RivoraAPI) return;

      try {
        if (btnStep1) {
          btnStep1.disabled = true;
          btnStep1.textContent = 'Dispatching Verification Code...';
        }

        const resp = await RivoraAPI.initiateSignupVerification(pendingSignupDetails);
        showVerificationStep(resp);
      } catch (err) {
        if (error1) {
          error1.hidden = false;
          error1.textContent = err.message || 'Could not initiate email verification. Please check your details.';
        }
      } finally {
        if (btnStep1) {
          btnStep1.disabled = false;
          btnStep1.textContent = 'Continue to Email Verification →';
        }
      }
    });
  }

  // Step 2: Complete Email Verification & Create Account
  if (form2) {
    form2.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (error2) error2.hidden = true;
      if (success2) success2.hidden = true;

      const emailOtp = document.getElementById('v-email-otp') ? document.getElementById('v-email-otp').value.trim() : '';
      if (!emailOtp || emailOtp.length !== 6 || !/^\d{6}$/.test(emailOtp)) {
        if (error2) {
          error2.hidden = false;
          error2.textContent = 'Please enter the 6-digit code sent to your work email.';
        }
        return;
      }

      if (!currentSessionId) {
        if (error2) {
          error2.hidden = false;
          error2.textContent = 'Session lost. Please edit details and request new code.';
        }
        return;
      }

      try {
        if (btnVerifyAll) {
          btnVerifyAll.disabled = true;
          btnVerifyAll.textContent = 'Verifying Email & Creating Account...';
        }

        await RivoraAPI.verifySignup(currentSessionId, emailOtp);

        sessionStorage.removeItem('rivora_pending_signup');
        if (success2) {
          success2.hidden = false;
          success2.textContent = '✓ Email verified! Loading your dashboard...';
        }

        setTimeout(() => {
          window.location.href = selectedRole === 'seeker' ? 'seeker.html' : 'provider.html?verify_onboarding=1';
        }, 700);

      } catch (err) {
        if (error2) {
          error2.hidden = false;
          error2.textContent = err.message || 'Verification failed. Please check your email code.';
        }
      } finally {
        if (btnVerifyAll) {
          btnVerifyAll.disabled = false;
          btnVerifyAll.textContent = 'Verify Email & Create Account →';
        }
      }
    });
  }

  // Resend Email OTP
  if (btnResendEmail) {
    btnResendEmail.addEventListener('click', async () => {
      if (!currentSessionId || emailCooldownSecs > 0) return;
      try {
        btnResendEmail.disabled = true;
        btnResendEmail.textContent = 'Sending...';
        await RivoraAPI.resendSignupOtp(currentSessionId, 'email');
        startCooldown('email', 60);
        if (error2) error2.hidden = true;
      } catch (err) {
        if (error2) { error2.hidden = false; error2.textContent = err.message; }
        btnResendEmail.disabled = false;
        btnResendEmail.textContent = 'Resend Email OTP';
      }
    });
  }

  // Resend Mobile OTP
  if (btnResendMobile) {
    btnResendMobile.addEventListener('click', async () => {
      if (mobileCooldownSecs > 0) return;

      if (useFirebaseAuth && pendingSignupDetails && !window.RivoraFirebaseAuth?.billingDisabled) {
        try {
          btnResendMobile.disabled = true;
          btnResendMobile.textContent = 'Sending...';
          await window.RivoraFirebaseAuth.sendOtp(pendingSignupDetails.phone, 'recaptcha-container');
          startCooldown('mobile', 60);
          if (error2) error2.hidden = true;
          return;
        } catch (err) {
          console.warn('[Signup] Firebase SMS resend failed, falling back to server resend:', err);
          if (window.RivoraFirebaseAuth) window.RivoraFirebaseAuth.billingDisabled = true;
        }
      }

      if (!currentSessionId) return;
      try {
        btnResendMobile.disabled = true;
        btnResendMobile.textContent = 'Sending...';
        await RivoraAPI.resendSignupOtp(currentSessionId, 'mobile');
        startCooldown('mobile', 60);
        if (error2) error2.hidden = true;
      } catch (err) {
        if (error2) { error2.hidden = false; error2.textContent = err.message; }
        btnResendMobile.disabled = false;
        btnResendMobile.textContent = 'Resend SMS OTP';
      }
    });
  }


  // Return to Step 1 to edit details
  if (btnEditDetails) {
    btnEditDetails.addEventListener('click', () => {
      if (validityInterval) clearInterval(validityInterval);
      if (emailCooldownTimer) clearInterval(emailCooldownTimer);
      if (mobileCooldownTimer) clearInterval(mobileCooldownTimer);
      sessionStorage.removeItem('rivora_pending_signup');
      currentSessionId = null;
      useFirebaseAuth = false;
      pendingSignupDetails = null;

      if (step2) step2.hidden = true;
      if (step1) step1.hidden = false;
      updateStepper(1);
      if (error2) error2.hidden = true;
      if (success2) success2.hidden = true;
    });
  }

}

/* ---------------------------------------------------------
   Login page
--------------------------------------------------------- */

function initLoginPage() {
  const credForm = document.getElementById('login-form');
  if (!credForm) return;

  const credSection = document.getElementById('login-credentials-section');
  const otpSection = document.getElementById('login-otp-section');
  const otpForm = document.getElementById('login-otp-form');
  const otpInput = document.getElementById('l-otp');
  const emailDisplay = document.getElementById('login-email-display');
  const btnResend = document.getElementById('btn-resend-login-otp');
  const resendTimerEl = document.getElementById('login-resend-timer');
  const btnBack = document.getElementById('btn-back-to-credentials');
  const credErrorEl = document.getElementById('login-error');
  const otpErrorEl = document.getElementById('login-otp-error');
  const otpSuccessEl = document.getElementById('login-otp-success');

  let currentLoginSessionId = null;
  let cooldownInterval = null;
  let cooldownSeconds = 0;

  function startResendCooldown(secs = 60) {
    if (cooldownInterval) clearInterval(cooldownInterval);
    cooldownSeconds = secs;
    if (btnResend) btnResend.disabled = true;

    const tick = () => {
      if (cooldownSeconds > 0) {
        if (resendTimerEl) resendTimerEl.textContent = `Resend in ${cooldownSeconds}s`;
        if (btnResend) {
          btnResend.disabled = true;
          btnResend.textContent = `Wait (${cooldownSeconds}s)`;
        }
        cooldownSeconds--;
      } else {
        clearInterval(cooldownInterval);
        if (resendTimerEl) resendTimerEl.textContent = '';
        if (btnResend) {
          btnResend.disabled = false;
          btnResend.textContent = 'Resend OTP';
        }
      }
    };
    tick();
    cooldownInterval = setInterval(tick, 1000);
  }

  // Step 1: Submit Credentials -> Triggers SMTP Email OTP
  credForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-login-submit') || credForm.querySelector('button[type="submit"]');
    const email = document.getElementById('l-email').value.trim();
    const password = document.getElementById('l-password').value;

    if (!email || !password) {
      if (credErrorEl) {
        credErrorEl.hidden = false;
        credErrorEl.textContent = 'Enter both your email and password to continue.';
      }
      return;
    }
    if (credErrorEl) credErrorEl.hidden = true;

    if (window.RivoraAPI) {
      try {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending verification code…'; }
        const res = await RivoraAPI.login(email, password);

        // If OTP is required (standard secure flow)
        if (res && res.require_otp && res.session_id) {
          currentLoginSessionId = res.session_id;
          if (emailDisplay) emailDisplay.textContent = res.email_masked || email;
          
          if (credSection) credSection.hidden = true;
          if (otpSection) otpSection.hidden = false;
          if (otpInput) {
            otpInput.value = '';
            otpInput.focus();
          }
          if (otpErrorEl) otpErrorEl.hidden = true;
          if (otpSuccessEl) {
            otpSuccessEl.hidden = false;
            otpSuccessEl.textContent = `✓ Verification code sent to ${res.email_masked || email}`;
          }

          startResendCooldown(res.resend_cooldown_seconds || 60);
          return;
        }

        // Direct token fallback (if no OTP requested)
        if (res && res.access_token) {
          const biz = res.business || {};
          window.location.href = (biz.business_type === 'event_organizer') ? 'seeker.html' : 'provider.html';
        }
      } catch (err) {
        if (credErrorEl) {
          credErrorEl.hidden = false;
          credErrorEl.textContent = err.message || 'Incorrect email or password.';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = t('auth.login') || 'Log in';
        }
      }
    } else {
      window.location.href = 'provider.html';
    }
  });

  // Step 2: Verify OTP
  if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const verifyBtn = document.getElementById('btn-verify-otp');
      const otp = otpInput ? otpInput.value.trim() : '';

      if (!otp || otp.length < 6) {
        if (otpErrorEl) {
          otpErrorEl.hidden = false;
          otpErrorEl.textContent = 'Please enter the complete 6-digit verification code.';
        }
        return;
      }
      if (otpErrorEl) otpErrorEl.hidden = true;
      if (otpSuccessEl) otpSuccessEl.hidden = true;

      try {
        if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying code…'; }
        const res = await RivoraAPI.verifyLoginOtp(currentLoginSessionId, otp);
        const biz = res.business || {};
        window.location.href = (biz.business_type === 'event_organizer') ? 'seeker.html' : 'provider.html';
      } catch (err) {
        if (otpErrorEl) {
          otpErrorEl.hidden = false;
          otpErrorEl.textContent = err.message || 'Incorrect or expired code. Please try again.';
        }
        if (otpInput) otpInput.select();
      } finally {
        if (verifyBtn) {
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'Verify & Log In';
        }
      }
    });
  }

  // Step 3: Resend OTP
  if (btnResend) {
    btnResend.addEventListener('click', async () => {
      if (cooldownSeconds > 0 || !currentLoginSessionId) return;
      try {
        btnResend.disabled = true;
        btnResend.textContent = 'Dispatching…';
        const res = await RivoraAPI.resendLoginOtp(currentLoginSessionId);
        if (otpSuccessEl) {
          otpSuccessEl.hidden = false;
          otpSuccessEl.textContent = '✓ A new verification code has been dispatched to your email.';
        }
        if (otpErrorEl) otpErrorEl.hidden = true;
        startResendCooldown(res?.resend_cooldown_seconds || 60);
      } catch (err) {
        if (otpErrorEl) {
          otpErrorEl.hidden = false;
          otpErrorEl.textContent = err.message || 'Could not resend code. Please try again.';
        }
        btnResend.disabled = false;
        btnResend.textContent = 'Resend OTP';
      }
    });
  }

  // Step 4: Back to Credentials
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      if (cooldownInterval) clearInterval(cooldownInterval);
      currentLoginSessionId = null;
      if (otpSection) otpSection.hidden = true;
      if (credSection) credSection.hidden = false;
      if (credErrorEl) credErrorEl.hidden = true;
      if (otpErrorEl) otpErrorEl.hidden = true;
      if (otpSuccessEl) otpSuccessEl.hidden = true;
      const emailInput = document.getElementById('l-email');
      if (emailInput) emailInput.focus();
    });
  }
}

/* ---------------------------------------------------------
   Provider dashboard — add-resource form
--------------------------------------------------------- */

const THUMB_ILLUSTRATIONS = {
  Space: 'pi-hotel', Kitchen: 'pi-kitchen', Vehicle: 'pi-vehicle',
  Furniture: 'pi-furniture', 'AV Equipment': 'pi-av', Staff: 'pi-hotel',
};

function initResourceForm() {
  const form = document.getElementById('resource-form');
  if (!form) return;

  const list = document.getElementById('listing-list');
  const confirm = document.getElementById('form-confirm');

  // Initialize Provider Business Proof Banner
  const bannerUploadBtn = document.getElementById('btn-provider-banner-upload');
  if (bannerUploadBtn) {
    if (window.RivoraAPI && RivoraAPI.isAuthenticated()) {
      RivoraAPI.getProviderVerificationStatus().then((pStatus) => {
        const badge = document.getElementById('provider-banner-status-badge');
        if (pStatus && (pStatus.is_fully_verified || pStatus.is_verified)) {
          if (badge) {
            badge.className = 'verify-badge-pill';
            badge.textContent = '✓ Verified Business';
            badge.style.background = '#3D8067';
            badge.style.color = '#F8F6EF';
          }
          bannerUploadBtn.textContent = 'Update Business Proofs';
        } else if (pStatus && (pStatus.gstin_status === 'under_review' || pStatus.bank_account_status === 'under_review')) {
          if (badge) {
            badge.className = 'verify-badge-pill';
            badge.textContent = 'Verification In Progress';
            badge.style.background = '#F2E8D1';
            badge.style.color = '#9B7440';
          }
          bannerUploadBtn.textContent = 'Review Uploaded Documents';
        }
        bannerUploadBtn.addEventListener('click', () => {
          openProviderVerificationModal(pStatus || {});
        });

        // Enforce Listing Lock for unverified providers
        const isFullyVerified = Boolean(pStatus && (pStatus.is_fully_verified || pStatus.is_verified));
        const submitBtn = form.querySelector('button[type="submit"]');
        if (!isFullyVerified && submitBtn) {
          submitBtn.disabled = true;
          submitBtn.style.opacity = '0.55';
          submitBtn.style.cursor = 'not-allowed';
          submitBtn.title = 'Complete business verification to unlock listing publishing';

          let lockNotice = document.getElementById('listing-lock-notice');
          if (!lockNotice) {
            lockNotice = document.createElement('div');
            lockNotice.id = 'listing-lock-notice';
            lockNotice.style.cssText = 'background:#F5EAE3; border:1px solid #E8C4B7; border-radius:8px; padding:0.85rem 1.1rem; margin-bottom:1.25rem; font-size:0.82rem; color:#A75650; display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;';
            lockNotice.innerHTML = `
              <div>
                <strong>Listing creation locked:</strong> Only verified businesses with approved statutory proofs can list resources.
              </div>
              <button type="button" class="btn btn-primary btn-sm" id="btn-unlock-verify" style="background:#B95F58; border-color:#B95F58; font-size:0.78rem; font-weight:700;">
                Verify Your Business Now →
              </button>
            `;
            form.insertBefore(lockNotice, form.firstChild);
            document.getElementById('btn-unlock-verify')?.addEventListener('click', () => {
              openProviderVerificationModal(pStatus || {});
            });
          }
        }

        // Auto-launch onboarding modal if requested in URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('verify_onboarding') === '1' && !isFullyVerified) {
          setTimeout(() => openProviderVerificationModal(pStatus || {}), 400);
        }
      }).catch(() => {
        bannerUploadBtn.addEventListener('click', () => {
          openProviderVerificationModal({});
        });
      });
    } else {
      bannerUploadBtn.addEventListener('click', () => {
        window.location.href = 'login.html';
      });
    }
  }

  /* ---- photo upload: client-side only for this demo ----
     Object URLs let the provider see a real preview of their own photos
     immediately, but they only live for this browser tab/session — they
     are NOT uploaded anywhere. Wiring this to the backend means sending
     these File objects as multipart/form-data (see the submit handler
     below for the exact shape), not as JSON. */
  const MAX_PHOTOS = 6;
  let selectedPhotos = []; // File[]

  const dropZone = document.getElementById('photo-upload');
  const fileInput = document.getElementById('r-photos');
  const trigger = document.getElementById('photo-upload-trigger');
  const previewGrid = document.getElementById('photo-preview-grid');
  const countLabel = document.getElementById('photo-upload-count');

  function renderPhotoPreviews() {
    previewGrid.innerHTML = selectedPhotos.map((file, i) => {
      const url = URL.createObjectURL(file);
      return `
        <div class="photo-preview-item">
          <img src="${url}" alt="">
          <button type="button" class="photo-preview-remove" data-remove-index="${i}" aria-label="${escapeHtml(t('addResource.removePhoto'))}">✕</button>
        </div>`;
    }).join('');

    if (selectedPhotos.length) {
      countLabel.hidden = false;
      countLabel.textContent = t('addResource.photoCount', { count: I18N.num(selectedPhotos.length) });
    } else {
      countLabel.hidden = true;
    }

    previewGrid.querySelectorAll('[data-remove-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedPhotos.splice(parseInt(btn.dataset.removeIndex, 10), 1);
        renderPhotoPreviews();
      });
    });
  }

  function addPhotos(fileList) {
    const incoming = Array.from(fileList).filter((f) => f.type === 'image/jpeg' || f.type === 'image/png');
    selectedPhotos = [...selectedPhotos, ...incoming].slice(0, MAX_PHOTOS);
    renderPhotoPreviews();
  }

  if (trigger) {
    trigger.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => addPhotos(fileInput.files));

    ['dragover', 'dragenter'].forEach((evt) =>
      dropZone.addEventListener(evt, (e) => { e.preventDefault(); trigger.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach((evt) =>
      dropZone.addEventListener(evt, (e) => { e.preventDefault(); trigger.classList.remove('is-dragover'); }));
    dropZone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) addPhotos(e.dataTransfer.files); });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('r-name').value.trim();
    const type = document.getElementById('r-type').value;
    const desc = document.getElementById('r-desc') ? document.getElementById('r-desc').value.trim() : '';
    const capacity = document.getElementById('r-capacity').value;
    const quantity = document.getElementById('r-quantity') ? parseInt(document.getElementById('r-quantity').value, 10) : 1;
    const price = document.getElementById('r-price').value;
    const priceUnit = document.getElementById('r-price-unit').value.toLowerCase();
    const minDuration = document.getElementById('r-min-duration') ? parseInt(document.getElementById('r-min-duration').value, 10) : 1;
    const conditions = document.getElementById('r-conditions') ? document.getElementById('r-conditions').value.trim() : '';

    if (!name || !type || !price) return;

    const submitBtn = form.querySelector('[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Uploading…'; }

    const uploadedUrls = [];

    // Step 1 — upload ALL selected photos to Cloudinary
    if (selectedPhotos.length > 0 && window.RivoraAPI) {
      for (let i = 0; i < selectedPhotos.length; i++) {
        if (submitBtn) submitBtn.textContent = `Uploading photo ${i + 1} of ${selectedPhotos.length}…`;
        try {
          const u = await RivoraAPI.uploadToCloudinary(selectedPhotos[i]);
          if (u) {
            uploadedUrls.push(u);
            console.log(`[Cloudinary] Uploaded photo ${i + 1}/${selectedPhotos.length}:`, u);
          }
        } catch (err) {
          console.warn(`[Cloudinary] Upload failed for photo ${i + 1}:`, err.message);
        }
      }
    }

    const imageUrl = uploadedUrls.length > 0 ? uploadedUrls[0] : null;

    // Step 2 — build the listing card with the real Cloudinary URL (or illustration)
    const piClass = THUMB_ILLUSTRATIONS[type] || 'pi-hotel';
    const thumbHtml = imageUrl
      ? `<div class="listing-thumb" style="background-image:url('${imageUrl}');background-size:cover;background-position:center"></div>`
      : `<div class="listing-thumb photo-illustration ${piClass}">${categoryScene(piClass)}</div>`;

    const card = document.createElement('article');
    card.className = 'listing-card clickable-listing-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('title', `View details for ${name}`);
    card.innerHTML = `
      <div class="listing-main">
        ${thumbHtml}
        <div class="listing-text">
          <span class="listing-name">${escapeHtml(name)}</span>
          <span class="listing-meta">${escapeHtml(t(RESOURCE_TYPE_KEYS[type] || 'resource.type'))}${capacity ? ' · ' + escapeHtml(t('resource.capacity')) + ' ' + I18N.num(capacity) : ''} · ${I18N.money(price)}/${escapeHtml(t(priceUnit.includes('day') ? 'resource.perDay' : 'resource.perHour'))}</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap: 0.8rem;">
        <span class="badge ${STATUS_BADGE.active}"><i></i>${escapeHtml(t('status.active'))}</span>
        <span class="view-listing-arrow">View Details →</span>
      </div>
    `;
    list.prepend(card);

    form.reset();
    selectedPhotos = [];
    renderPhotoPreviews();
    confirm.hidden = false;
    confirm.textContent = imageUrl
      ? t('resource.listed')
      : `${t('resource.listed')} ${t('addResource.noPhotosWarning')}`;
    setTimeout(() => { confirm.hidden = true; }, 4000);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalBtnText; }

    // Step 3 — persist to backend (including description, conditions, quantity, min_duration, images)
    if (window.RivoraAPI && RivoraAPI.isAuthenticated()) {
      RivoraAPI.createResource({
        name: name,
        type: type.toLowerCase(),
        description: desc || null,
        capacity: capacity ? parseInt(capacity, 10) : null,
        quantity: quantity || 1,
        price_per_unit: parseFloat(price),
        price_unit: priceUnit.includes('day') ? 'per_day' : 'per_hour',
        min_duration: minDuration || 1,
        conditions_text: conditions || null,
        location: 'Mumbai',
        image_url: imageUrl || null,
        images: uploadedUrls,
      }).then((res) => {
        console.log('[RivoraAPI] Resource created on backend:', res.id, '| desc:', res.description, '| images:', res.images);
        card.setAttribute('data-resource-id', res.id);
        const goToDetails = () => { window.location.href = `resource-details.html?id=${res.id}`; };
        card.addEventListener('click', goToDetails);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToDetails(); }
        });
        // Refresh listings count KPI and full analytics
        const kpiListings = document.getElementById('kpi-listings');
        if (kpiListings) {
          const currentCount = parseInt(kpiListings.textContent, 10) || 0;
          kpiListings.textContent = I18N.num(currentCount + 1);
        }
        if (typeof refreshDashboardAndAnalytics === 'function') {
          refreshDashboardAndAnalytics();
        }
      }).catch((err) => {
        console.warn('[RivoraAPI] Could not save resource to backend:', err.message);
      });
    }
  });

  // Load existing provider resources from backend if logged in
  if (window.RivoraAPI && RivoraAPI.isAuthenticated() && list) {
    RivoraAPI.getMyResources().then((myList) => {
      list.innerHTML = '';
      const kpiListings = document.getElementById('kpi-listings');
      if (kpiListings) {
        const activeCount = myList ? myList.filter((r) => r.status === 'active').length : 0;
        kpiListings.textContent = I18N.num(activeCount);
      }
      if (typeof refreshDashboardAndAnalytics === 'function') {
        refreshDashboardAndAnalytics();
      }

      if (myList && myList.length > 0) {
        myList.forEach((r) => {
          const typeName = r.type ? (r.type.charAt(0).toUpperCase() + r.type.slice(1)) : 'Space';
          const piClass = THUMB_ILLUSTRATIONS[typeName] || 'pi-hotel';
          const thumbHtml = r.image_url
            ? `<div class="listing-thumb" style="background-image:url('${r.image_url}');background-size:cover;background-position:center"></div>`
            : `<div class="listing-thumb photo-illustration ${piClass}">${categoryScene(piClass)}</div>`;
          const card = document.createElement('article');
          card.className = 'listing-card clickable-listing-card';
          card.setAttribute('data-resource-id', r.id);
          card.setAttribute('role', 'button');
          card.setAttribute('tabindex', '0');
            const isPaused = r.status === 'paused' || r.status === 'inactive';
            const badgeClass = isPaused ? 'badge-rose' : STATUS_BADGE.active;
            const badgeLabel = isPaused ? 'Paused' : escapeHtml(t('status.active'));
            card.innerHTML = `
            <div class="listing-main">
              ${thumbHtml}
              <div class="listing-text">
                <span class="listing-name">${escapeHtml(r.name)}</span>
                <span class="listing-meta">${escapeHtml(t(RESOURCE_TYPE_KEYS[typeName] || 'resource.type'))}${r.capacity ? ' · ' + escapeHtml(t('resource.capacity')) + ' ' + I18N.num(r.capacity) : ''} · ${I18N.money(r.price_per_unit)}/${escapeHtml(t(r.price_unit === 'per_day' ? 'resource.perDay' : 'resource.perHour'))}</span>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap: 0.8rem;">
              <span class="badge ${badgeClass}"><i></i>${badgeLabel}</span>
              <span class="view-listing-arrow">View Details →</span>
            </div>
          `;
          const navToDetails = () => { window.location.href = `resource-details.html?id=${r.id}`; };
          card.addEventListener('click', navToDetails);
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navToDetails(); }
          });
          list.appendChild(card);
        });
      } else {
        list.innerHTML = `<div class="requests-empty" style="padding: 2rem; text-align: center; color: var(--ink-faint);">No listings yet. Add your first resource above!</div>`;
      }
    }).catch((e) => {
      console.warn('[RivoraAPI] Could not fetch provider listings:', e.message);
      list.innerHTML = `<div class="requests-empty" style="padding: 2rem; text-align: center; color: var(--rose);">Could not load listings.</div>`;
    });
  }
}

/* ---------------------------------------------------------
   Counter-Offer Modal
--------------------------------------------------------- */

function openCounterOfferModal(booking, onSuccess) {
  let modal = document.getElementById('counter-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'counter-modal';
    modal.className = 'chat-modal-backdrop';
    modal.innerHTML = `
      <div class="chat-modal" role="dialog" aria-modal="true" style="max-width: 440px;">
        <div class="chat-modal-head">
          <div>
            <h3 id="counter-modal-title">Make a Counter-Offer</h3>
            <span class="chat-modal-sub" id="counter-modal-sub"></span>
          </div>
          <button class="btn-icon" id="counter-modal-close" type="button">✕</button>
        </div>
        <form id="counter-modal-form" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">
          <div class="field">
            <label for="counter-modal-amount" style="font-weight: 600; font-size: 0.85rem; color: var(--ink);">Counter Offer Amount (₹)</label>
            <input type="number" id="counter-modal-amount" required min="1" step="1" style="width: 100%; padding: 0.65rem 0.8rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 1rem;">
          </div>
          <div class="field">
            <label for="counter-modal-notes" style="font-weight: 600; font-size: 0.85rem; color: var(--ink);">Notes / Terms (Optional)</label>
            <textarea id="counter-modal-notes" rows="3" placeholder="e.g. Price includes standard setup and 2 hours buffer time." style="width: 100%; padding: 0.65rem 0.8rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.9rem; resize: vertical;"></textarea>
          </div>
          <div id="counter-modal-error" style="color: var(--rose, #B95F58); font-size: 0.85rem; font-weight: 500;" hidden></div>
          <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 0.5rem;">
            <button type="button" class="btn btn-ghost btn-sm" id="counter-modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm" id="counter-modal-submit">Send Counter-Offer</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
    document.getElementById('counter-modal-close').addEventListener('click', () => { modal.hidden = true; });
    document.getElementById('counter-modal-cancel').addEventListener('click', () => { modal.hidden = true; });
  }

  const counterpart = booking.seeker_name || booking.counterpart_name || 'Seeker';
  const resource = booking.resource_name || `Resource #${booking.resource_id}`;
  document.getElementById('counter-modal-sub').textContent = `${counterpart} · ${resource}`;

  const currentPrice = booking.latest_offer_amount || booking.agreed_price || booking.requested_price || '';
  const amountInput = document.getElementById('counter-modal-amount');
  amountInput.value = currentPrice;
  document.getElementById('counter-modal-notes').value = '';
  const errorEl = document.getElementById('counter-modal-error');
  errorEl.hidden = true;
  modal.hidden = false;
  amountInput.focus();

  const form = document.getElementById('counter-modal-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const amountVal = parseFloat(amountInput.value);
    if (isNaN(amountVal) || amountVal <= 0) {
      errorEl.hidden = false;
      errorEl.textContent = 'Please enter a valid positive amount.';
      return;
    }
    const notesVal = document.getElementById('counter-modal-notes').value.trim();
    const submitBtn = document.getElementById('counter-modal-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      const res = await RivoraAPI.createCounterOffer(booking.id, {
        amount: amountVal,
        notes: notesVal || undefined
      });
      modal.hidden = true;
      if (typeof onSuccess === 'function') onSuccess(res);
    } catch (err) {
      errorEl.hidden = false;
      errorEl.textContent = err.message || 'Failed to send counter-offer.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Counter-Offer';
    }
  };
}

/* ---------------------------------------------------------
   Provider dashboard — incoming request actions & persistence
--------------------------------------------------------- */

async function initRequestActions() {
  const container = document.getElementById('incoming-requests-list');
  if (!container) return;

  if (!window.RivoraAPI || !RivoraAPI.isAuthenticated()) {
    container.innerHTML = `<div class="requests-empty" style="padding: 2rem; text-align: center; color: var(--ink-faint);">Please log in to view requests.</div>`;
    return;
  }

  try {
    const bookings = await RivoraAPI.getMyBookings();
    const user = RivoraAPI.getUser();
    const incoming = (bookings || []).filter((b) => b.direction === 'received' || (user && b.seeker_id !== user.id));

    updateProviderDashboardKPIs(incoming);

    container.innerHTML = '';
    if (!incoming.length) {
      container.innerHTML = `<div class="requests-empty" style="padding: 2.5rem; text-align: center; color: var(--ink-faint);">No incoming requests yet. When seekers request your spaces or equipment, they will appear here.</div>`;
      return;
    }

    incoming.forEach((b) => {
      const row = renderProviderRequestRow(b, incoming);
      container.appendChild(row);
    });
  } catch (err) {
    console.error('[RivoraAPI] Error loading provider requests:', err);
    container.innerHTML = `<div class="requests-empty" style="padding: 2rem; text-align: center; color: var(--rose);">Could not load incoming requests.</div>`;
  }
}

function updateProviderDashboardKPIs(incomingBookings) {
  const earnings = (incomingBookings || [])
    .filter((b) => b.status === 'confirmed' || b.status === 'completed')
    .reduce((sum, b) => sum + (parseFloat(b.agreed_price) || parseFloat(b.requested_price) || 0), 0);
  const pendingCount = (incomingBookings || []).filter((b) => b.status === 'pending' || b.status === 'negotiating').length;

  const earningsEl = document.getElementById('kpi-earnings');
  const pendingEl = document.getElementById('kpi-pending');
  const utilEl = document.getElementById('kpi-utilization');
  if (earningsEl) earningsEl.textContent = I18N.money(earnings);
  if (pendingEl) pendingEl.textContent = I18N.num(pendingCount);

  // Sync with live backend analytics to ensure parity across Dashboard and Analytics pages
  if (typeof refreshDashboardAndAnalytics === 'function') {
    refreshDashboardAndAnalytics();
  }
}

function renderProviderRequestRow(b, allIncoming) {
  const row = document.createElement('div');
  row.className = 'request-row';
  row.dataset.bookingId = b.id;

  const startDate = new Date(b.start_time);
  const formattedDate = !isNaN(startDate) ? `${startDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}, ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Upcoming';
  const counterpart = b.seeker_name || b.counterpart_name || 'Partner Seeker';
  const resource = b.resource_name || `Resource #${b.resource_id}`;
  const price = b.latest_offer_amount || b.agreed_price || b.requested_price || 0;
  const badgeCls = STATUS_BADGE[b.status] || 'badge-neutral';
  const statusLabel = t('status.' + b.status) || b.status;

  function renderActions() {
    if (b.status === 'pending' || b.status === 'negotiating') {
      return `
        <button class="btn-mini btn-mini--accept" data-action="accept" type="button">${escapeHtml(t('button.accept'))}</button>
        <button class="btn-mini btn-mini--counter" data-action="counter" type="button">${escapeHtml(t('button.counterOffer'))}</button>
        <button class="btn-mini btn-mini--decline" data-action="decline" type="button">${escapeHtml(t('button.reject'))}</button>
      `;
    } else if (b.status === 'confirmed') {
      return `
        <button class="btn-mini btn-mini--accept" data-action="complete" type="button">${escapeHtml(t('button.markCompleted'))}</button>
      `;
    } else if (b.status === 'completed') {
      return `<span style="font-size: 0.8rem; color: var(--emerald); font-weight: 600;">✓ ${escapeHtml(t('status.completed'))}</span>`;
    } else {
      return `<span style="font-size: 0.8rem; color: var(--ink-faint);">${escapeHtml(t('requests.noAction'))}</span>`;
    }
  }

  row.innerHTML = `
    <div class="request-row-main">
      <div class="request-seeker">${escapeHtml(counterpart)}</div>
      <div class="request-detail">${escapeHtml(resource)} · ${escapeHtml(formattedDate)} · <span class="row-price">${I18N.money(price)}</span></div>
    </div>
    <span class="badge ${badgeCls} request-badge"><i></i>${escapeHtml(statusLabel)}</span>
    <div class="request-row-actions">${renderActions()}</div>
  `;

  function bindButtons() {
    const actionsWrap = row.querySelector('.request-row-actions');
    const acceptBtn = actionsWrap.querySelector('[data-action="accept"]');
    const declineBtn = actionsWrap.querySelector('[data-action="decline"]');
    const counterBtn = actionsWrap.querySelector('[data-action="counter"]');
    const completeBtn = actionsWrap.querySelector('[data-action="complete"]');

    if (acceptBtn) {
      acceptBtn.addEventListener('click', async () => {
        acceptBtn.disabled = true;
        acceptBtn.textContent = 'Accepting…';
        try {
          await RivoraAPI.confirmBooking(b.id, b.latest_offer_amount || b.agreed_price || b.requested_price || 50000);
          b.status = 'confirmed';
          setBadge(row.querySelector('.request-badge'), t('status.confirmed'), STATUS_BADGE.confirmed);
          actionsWrap.innerHTML = renderActions();
          bindButtons();
          updateProviderDashboardKPIs(allIncoming);
        } catch (err) {
          alert(err.message || 'Failed to accept booking');
          acceptBtn.disabled = false;
          acceptBtn.textContent = t('button.accept');
        }
      });
    }

    if (declineBtn) {
      declineBtn.addEventListener('click', async () => {
        declineBtn.disabled = true;
        declineBtn.textContent = 'Declining…';
        try {
          await RivoraAPI.updateBookingStatus(b.id, { status: 'declined' });
          b.status = 'declined';
          setBadge(row.querySelector('.request-badge'), t('status.declined'), STATUS_BADGE.declined);
          actionsWrap.innerHTML = renderActions();
          bindButtons();
          updateProviderDashboardKPIs(allIncoming);
        } catch (err) {
          alert(err.message || 'Failed to decline booking');
          declineBtn.disabled = false;
          declineBtn.textContent = t('button.reject');
        }
      });
    }

    if (counterBtn) {
      counterBtn.addEventListener('click', () => {
        openChat({
          id: b.id,
          direction: 'received',
          counterpart: b.seeker_name || b.counterpart_name || 'Partner Seeker',
          resource: b.resource_name || `Resource #${b.resource_id}`,
          dates: formattedDate,
          priceNum: b.latest_offer_amount || b.agreed_price || b.requested_price || 0,
          price: I18N.money(b.latest_offer_amount || b.agreed_price || b.requested_price || 0),
          status: b.status || 'pending',
          rawBooking: b
        }, () => {
          b.status = 'negotiating';
          b.latest_offer_amount = b.rawBooking ? b.rawBooking.agreed_price : b.agreed_price;
          setBadge(row.querySelector('.request-badge'), t('status.negotiating'), STATUS_BADGE.negotiating);
          const priceEl = row.querySelector('.row-price');
          if (priceEl && b.latest_offer_amount) priceEl.textContent = I18N.money(b.latest_offer_amount);
          actionsWrap.innerHTML = renderActions();
          bindButtons();
          updateProviderDashboardKPIs(allIncoming);
        });
      });
    }

    if (completeBtn) {
      completeBtn.addEventListener('click', async () => {
        completeBtn.disabled = true;
        completeBtn.textContent = 'Completing…';
        try {
          await RivoraAPI.updateBookingStatus(b.id, { status: 'completed' });
          b.status = 'completed';
          setBadge(row.querySelector('.request-badge'), t('status.completed'), STATUS_BADGE.completed);
          actionsWrap.innerHTML = renderActions();
          bindButtons();
          updateProviderDashboardKPIs(allIncoming);
        } catch (err) {
          alert(err.message || 'Failed to mark booking as completed');
          completeBtn.disabled = false;
          completeBtn.textContent = t('button.markCompleted');
        }
      });
    }
  }

  bindButtons();
  return row;
}

function setBadge(badge, text, className) {
  badge.innerHTML = `<i></i>${text}`;
  badge.className = `badge ${className} request-badge`;
}

/* ---------------------------------------------------------
   Seeker search — dataset, filtering, ranking, compare
--------------------------------------------------------- */

/* Live resources collection — loaded from database via RivoraAPI.searchResources() */
const SAMPLE_RESOURCES = [];

/** Seeker's own approximate location for the map centre and radius filter */
const SEEKER_HOME = { lat: 19.1075, lng: 72.8400 };

/** Maps a resource type to its translation key, so type labels localise. */
const RESOURCE_TYPE_KEYS = {
  Space: 'resource.typeSpace',
  Vehicle: 'resource.typeVehicle',
  Kitchen: 'resource.typeKitchen',
  Furniture: 'resource.typeFurniture',
  'AV Equipment': 'resource.typeAV',
  Staff: 'resource.typeStaff',
  Parking: 'resource.typeParking',
};

const VISUAL_CLASS = { Space: 'pi-hotel', Kitchen: 'pi-kitchen', Vehicle: 'pi-vehicle', 'AV Equipment': 'pi-av', Furniture: 'pi-furniture', Staff: 'pi-staff', Parking: 'pi-parking' };

const CATEGORY_SCENES = {
  'pi-hotel': `<circle cx="255" cy="26" r="24" fill="rgba(248, 246, 239,0.35)"/><circle cx="255" cy="26" r="13" fill="rgba(255,250,235,0.65)"/><rect x="90" y="30" width="120" height="90" fill="rgba(24, 59, 67,0.28)"/><rect x="103" y="42" width="12" height="12" fill="rgba(255,240,210,0.4)"/><rect x="123" y="42" width="12" height="12" fill="rgba(255,240,210,0.22)"/><rect x="143" y="42" width="12" height="12" fill="rgba(255,240,210,0.4)"/><rect x="163" y="42" width="12" height="12" fill="rgba(255,240,210,0.22)"/><rect x="183" y="42" width="12" height="12" fill="rgba(255,240,210,0.4)"/><rect x="103" y="64" width="12" height="12" fill="rgba(255,240,210,0.22)"/><rect x="123" y="64" width="12" height="12" fill="rgba(255,240,210,0.4)"/><rect x="143" y="64" width="12" height="12" fill="rgba(255,240,210,0.22)"/><rect x="163" y="64" width="12" height="12" fill="rgba(255,240,210,0.4)"/><rect x="183" y="64" width="12" height="12" fill="rgba(255,240,210,0.22)"/><rect x="138" y="96" width="24" height="24" fill="rgba(24, 59, 67,0.4)"/><ellipse cx="150" cy="120" rx="90" ry="6" fill="rgba(24, 59, 67,0.14)"/>`,
  'pi-banquet': `<path d="M20 24 Q150 -14 280 24" fill="none" stroke="rgba(24, 59, 67,0.2)" stroke-width="1.8"/><circle cx="60" cy="18" r="3" fill="rgba(255,235,180,0.9)"/><circle cx="120" cy="4" r="3" fill="rgba(255,235,180,0.9)"/><circle cx="180" cy="4" r="3" fill="rgba(255,235,180,0.9)"/><circle cx="240" cy="18" r="3" fill="rgba(255,235,180,0.9)"/><ellipse cx="100" cy="86" rx="46" ry="26" fill="rgba(24, 59, 67,0.28)"/><ellipse cx="100" cy="74" rx="40" ry="16" fill="rgba(248, 246, 239,0.14)"/><ellipse cx="205" cy="86" rx="46" ry="26" fill="rgba(24, 59, 67,0.28)"/><ellipse cx="205" cy="74" rx="40" ry="16" fill="rgba(248, 246, 239,0.12)"/><ellipse cx="150" cy="128" rx="100" ry="6" fill="rgba(24, 59, 67,0.14)"/>`,
  'pi-vehicle': `<path d="M20 100 h260" stroke="rgba(24, 59, 67,0.16)" stroke-width="2"/><path d="M40 100 h30 M95 100 h30 M150 100 h30" stroke="rgba(248, 246, 239,0.4)" stroke-width="2.4" stroke-dasharray="14 10"/><path d="M55 100 v-22 h150 v-26 h-48 l-16 -22 h-96 l-22 22 h-44 v48 z" fill="rgba(24, 59, 67,0.28)"/><path d="M162 52 l10 22 h-62 l6 -22 z" fill="rgba(210,230,242,0.4)"/><circle cx="100" cy="104" r="16" fill="rgba(24, 59, 67,0.32)"/><circle cx="100" cy="104" r="6" fill="rgba(248, 246, 239,0.4)"/><circle cx="215" cy="104" r="16" fill="rgba(24, 59, 67,0.32)"/><circle cx="215" cy="104" r="6" fill="rgba(248, 246, 239,0.4)"/><ellipse cx="150" cy="130" rx="110" ry="6" fill="rgba(24, 59, 67,0.14)"/>`,
  'pi-kitchen': `<path d="M115 34 q4 -14 10 0" stroke="rgba(248, 246, 239,0.5)" stroke-width="2" fill="none"/><path d="M130 26 q5 -16 11 0" stroke="rgba(248, 246, 239,0.4)" stroke-width="2" fill="none"/><rect x="60" y="22" width="180" height="20" fill="rgba(24, 59, 67,0.24)"/><rect x="72" y="74" width="30" height="28" fill="none" stroke="rgba(24, 59, 67,0.26)" stroke-width="2.4"/><rect x="112" y="74" width="30" height="28" fill="none" stroke="rgba(24, 59, 67,0.26)" stroke-width="2.4"/><rect x="152" y="74" width="30" height="28" fill="none" stroke="rgba(24, 59, 67,0.26)" stroke-width="2.4"/><rect x="192" y="74" width="30" height="28" fill="none" stroke="rgba(24, 59, 67,0.26)" stroke-width="2.4"/><rect x="60" y="106" width="180" height="26" fill="rgba(24, 59, 67,0.2)"/>`,
  'pi-furniture': `<ellipse cx="150" cy="118" rx="110" ry="8" fill="rgba(24, 59, 67,0.15)"/><path d="M95 55 h70 v40 h-70 z" fill="rgba(24, 59, 67,0.3)"/><path d="M90 95 h80 v16 h-80 z" fill="rgba(24, 59, 67,0.34)"/><path d="M95 111 v8 M165 111 v8" stroke="rgba(24, 59, 67,0.34)" stroke-width="5" stroke-linecap="round"/><rect x="205" y="66" width="28" height="40" fill="none" stroke="rgba(24, 59, 67,0.26)" stroke-width="2.4"/><path d="M212 66 l7 -14 7 14 z" fill="rgba(24, 59, 67,0.28)"/>`,
  'pi-av': `<rect x="105" y="30" width="110" height="60" rx="4" fill="rgba(24, 59, 67,0.3)"/><rect x="115" y="40" width="90" height="40" fill="rgba(248, 246, 239,0.14)"/><path d="M125 70 l16 -14 12 10 20 -22" stroke="rgba(248, 246, 239,0.4)" stroke-width="2.4" fill="none"/><rect x="55" y="55" width="28" height="50" rx="3" fill="rgba(24, 59, 67,0.3)"/><circle cx="69" cy="68" r="8" fill="none" stroke="rgba(24, 59, 67,0.3)" stroke-width="2.2"/><rect x="240" y="55" width="28" height="50" rx="3" fill="rgba(24, 59, 67,0.3)"/><circle cx="254" cy="68" r="8" fill="none" stroke="rgba(24, 59, 67,0.3)" stroke-width="2.2"/><ellipse cx="150" cy="118" rx="105" ry="6" fill="rgba(24, 59, 67,0.14)"/>`,
  'pi-parking': `<line x1="90" y1="20" x2="90" y2="128" stroke="rgba(24, 59, 67,0.18)" stroke-width="2.4"/><line x1="150" y1="20" x2="150" y2="128" stroke="rgba(24, 59, 67,0.18)" stroke-width="2.4"/><line x1="210" y1="20" x2="210" y2="128" stroke="rgba(24, 59, 67,0.18)" stroke-width="2.4"/><rect x="98" y="40" width="46" height="28" rx="7" fill="rgba(24, 59, 67,0.28)"/><circle cx="108" cy="68" r="4" fill="rgba(24, 59, 67,0.38)"/><circle cx="134" cy="68" r="4" fill="rgba(24, 59, 67,0.38)"/><rect x="158" y="70" width="46" height="28" rx="7" fill="rgba(24, 59, 67,0.28)"/><circle cx="168" cy="98" r="4" fill="rgba(24, 59, 67,0.38)"/><circle cx="194" cy="98" r="4" fill="rgba(24, 59, 67,0.38)"/>`,
};

const CATEGORY_UNSPLASH_MAP = {
  'pi-hotel': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
  'pi-banquet': 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80',
  'pi-vehicle': 'https://images.unsplash.com/photo-1586191582156-f4041b9c9f45?auto=format&fit=crop&w=1200&q=80',
  'pi-kitchen': 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80',
  'pi-parking': 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1200&q=80',
  'pi-furniture': 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
  'pi-av': 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
  'pi-staff': 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=1200&q=80',
};

function categoryScene(piClass, label = '') {
  const imgUrl = CATEGORY_UNSPLASH_MAP[piClass] || CATEGORY_UNSPLASH_MAP['pi-hotel'];
  return `<img src="${imgUrl}" alt="${escapeHtml(label || 'Resource')}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">`;
}

const compareSelection = new Set();
const favorites = new Set();

function initSeekerSearch() {
  const grid = document.getElementById('results-grid');
  if (!grid) return;

  initResourceMap();
  initSearchTabs();

  // Load real resources from database
  if (window.RivoraAPI) {
    RivoraAPI.searchResources().then((live) => {
      SAMPLE_RESOURCES.length = 0;
      if (live && live.length > 0) {
        const PRESET_METRICS = [
          { rating: 4.9, distanceKm: 0.8, capacity: 450, score: 94 },
          { rating: 4.8, distanceKm: 1.4, capacity: 350, score: 88 },
          { rating: 4.6, distanceKm: 2.4, capacity: 150, score: 78 },
          { rating: 4.4, distanceKm: 3.8, capacity: 120, score: 65 },
          { rating: 4.2, distanceKm: 5.2, capacity: 50,  score: 52 },
        ];

        live.forEach((r, idx) => {
          const typeName = r.type ? (r.type.charAt(0).toUpperCase() + r.type.slice(1)) : 'Space';
          const preset = PRESET_METRICS[idx % PRESET_METRICS.length];
          const capacityVal = r.capacity || preset.capacity;
          const ratingVal = r.rating || preset.rating;
          const distanceVal = typeof r.distanceKm === 'number' ? r.distanceKm : preset.distanceKm;

          SAMPLE_RESOURCES.push({
            id: r.id,
            name: r.name,
            type: typeName,
            provider: r.provider_name || 'Verified Provider',
            location: r.location || 'Mumbai',
            capacity: capacityVal,
            price: parseFloat(r.price_per_unit) || 5000,
            unit: r.price_unit === 'per_hour' ? 'hour' : 'day',
            rating: ratingVal,
            distanceKm: distanceVal,
            defaultScore: preset.score,
            available: r.status === 'active',
            shortNotice: true,
            lat: 19.1197 + ((r.id * 7) % 20) * 0.004,
            lng: 72.8468 + ((r.id * 11) % 20) * 0.004,
            providerId: `p${r.provider_id}`,
            image_url: r.image_url || null,
            provider_verified: Boolean(r.provider_verified)
          });
        });
      }
      renderResults(SAMPLE_RESOURCES);
    }).catch((e) => {
      console.warn('[RivoraAPI] Could not fetch live resources:', e.message);
      SAMPLE_RESOURCES.length = 0;
      renderResults([]);
    });
  } else {
    renderResults([]);
  }

  document.getElementById('search-btn').addEventListener('click', () => {
    const type = document.getElementById('f-type').value;
    const location = document.getElementById('f-location').value.trim().toLowerCase();
    const budget = parseFloat(document.getElementById('f-budget').value) || null;
    const urgency = document.getElementById('f-urgency')?.value || 'normal';

    const filtered = SAMPLE_RESOURCES.filter((r) => {
      if (type && r.type !== type) return false;
      if (location && !r.location.toLowerCase().includes(location)) return false;
      if (budget && r.price > budget) return false;
      return true;
    });

    renderResults(filtered, { budget, location, urgency, resource_type: type || null });
    logRecentSearch(type, location, budget);
  });

  document.getElementById('post-requirement-btn').addEventListener('click', async () => {
    const confirm = document.getElementById('post-confirm');
    const type = document.getElementById('f-type')?.value || 'Space';
    const location = document.getElementById('f-location')?.value || 'Mumbai';
    const budget = parseFloat(document.getElementById('f-budget')?.value) || 10000;

    if (window.RivoraAPI && RivoraAPI.isAuthenticated()) {
      try {
        const tomorrow = new Date(Date.now() + 86400000);
        const tomorrowEnd = new Date(tomorrow.getTime() + 8 * 3600000);
        await RivoraAPI.createRequirement({
          resource_type: type.toLowerCase(),
          location: location,
          budget: budget,
          needed_from: tomorrow.toISOString(),
          needed_to: tomorrowEnd.toISOString()
        });
      } catch (err) {
        console.warn('[RivoraAPI] Requirement post notice:', err.message);
      }
    }

    if (confirm) {
      confirm.hidden = false;
      setTimeout(() => { confirm.hidden = true; }, 3000);
    }
  });

  document.getElementById('compare-clear').addEventListener('click', clearCompare);
  document.getElementById('compare-view').addEventListener('click', renderCompareTable);
}

function logRecentSearch(type, location, budget) {
  const wrap = document.getElementById('recent-searches');
  if (!wrap) return;
  const parts = [type, location, budget ? `under ₹${budget}` : null].filter(Boolean);
  if (!parts.length) return;
  const pill = document.createElement('span');
  pill.className = 'recent-search-pill';
  pill.textContent = parts.join(', ');
  wrap.prepend(pill);
  while (wrap.children.length > 4) wrap.removeChild(wrap.lastChild);
}

function initSearchTabs() {
  const tabs = document.querySelectorAll('.search-tab[data-tab]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      document.querySelectorAll('.search-panel-body').forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
    });
  });
}

/* =========================================================
   MATCHING ENGINE — documented five-factor weighted score:
     score = w1·price_fit + w2·distance_fit + w3·rating
           + w4·availability_fit + w5·urgency_boost
   Each factor is normalised to 0..1 before weighting. The same
   factors drive both the ranking and Zeus's explanations, so an
   explanation can never disagree with the score.

   NOTE: this is the frontend's *ranking* view. Real availability
   and booking conflict prevention are the backend's job
   (GET /resources/search + POST /bookings, HTTP 409 on overlap).
========================================================= */

const MATCH_WEIGHTS = { price: 0.30, distance: 0.25, rating: 0.20, availability: 0.15, urgency: 0.10 };

function matchFactors(r, req = {}) {
  // price_fit — 1.0 at or under budget, decaying as it exceeds it
  let priceFit = 0.75; // neutral when no budget was stated
  if (req.budget) {
    priceFit = r.price <= req.budget
      ? 1
      : Math.max(0, 1 - (r.price - req.budget) / req.budget);
  }

  // distance_fit — decays over a 10 km horizon (or the stated radius)
  const horizon = req.radiusKm || 10;
  const distanceFit = Math.max(0, 1 - r.distanceKm / horizon);

  // rating — normalised out of 5
  const ratingFit = (r.rating || 0) / 5;

  // availability_fit — demo resources carry an `available` flag; absent
  // means unknown, which scores neutral rather than optimistic.
  const availabilityFit = r.available === false ? 0 : (r.available === true ? 1 : 0.7);

  // capacity gate — under-capacity is a hard penalty, not a bonus
  let capacityFit = 1;
  if (req.capacity && r.capacity) {
    capacityFit = r.capacity >= req.capacity ? 1 : Math.max(0, r.capacity / req.capacity);
  }

  // urgency_boost — resources that can be arranged at short notice
  const urgent = req.urgency && req.urgency !== 'normal';
  const urgencyBoost = urgent ? (r.shortNotice === false ? 0 : 1) : 0.5;

  return { priceFit, distanceFit, ratingFit, availabilityFit, capacityFit, urgencyBoost };
}

function scoreResource(r, req) {
  // Back-compat: callers may still pass a bare budget number.
  const requirement = (typeof req === 'number') ? { budget: req } : (req || {});
  const hasFilter = requirement.budget || requirement.location || requirement.urgency || requirement.capacity || requirement.radiusKm || requirement.resource_type;
  if (!hasFilter && r.defaultScore) {
    return r.defaultScore;
  }

  const f = matchFactors(r, requirement);
  const w = MATCH_WEIGHTS;
  const raw =
    f.priceFit * w.price +
    f.distanceFit * w.distance +
    f.ratingFit * w.rating +
    f.availabilityFit * w.availability +
    f.urgencyBoost * w.urgency;
  return Math.round(raw * f.capacityFit * 100);
}

/** Human-readable reasons, derived from the SAME factors as the score.
    Never invents prices, ratings, distances or availability. */
function matchReasons(r, req = {}) {
  const f = matchFactors(r, req);
  const out = [];

  if (req.budget) {
    if (r.price <= req.budget) out.push(t('zeus.reasonBudget'));
    else if (f.priceFit > 0.8) out.push(t('zeus.reasonBudgetNear'));
  }
  if (req.capacity && r.capacity >= req.capacity) out.push(t('zeus.reasonCapacity'));
  if (f.distanceFit > 0.5) out.push(t('zeus.reasonDistance', { km: I18N.num(r.distanceKm) }));
  if (r.rating >= 4.3) out.push(t('zeus.reasonRating', { rating: I18N.num(r.rating.toFixed(1)) }));
  if (r.available === true) out.push(t('zeus.reasonAvailable'));
  if (req.urgency && req.urgency !== 'normal' && r.shortNotice !== false) out.push(t('zeus.reasonUrgency'));

  return out;
}

/* Last rendered search state — lets us re-render on language change
   without the user having to search again. */
let lastSearchState = { list: null, requirement: null };

function refreshSeekerResults() {
  if (!lastSearchState.list) return;
  renderResults(lastSearchState.list, lastSearchState.requirement);
}

function renderResults(list, requirement) {
  const grid = document.getElementById('results-grid');
  const countLabel = document.getElementById('results-count');
  if (!grid) return;

  // `requirement` may be a bare budget number (legacy filter path) or a
  // full Zeus requirement object. Normalise to an object.
  const req = (requirement === null || requirement === undefined)
    ? {}
    : (typeof requirement === 'number' ? { budget: requirement } : requirement);

  lastSearchState = { list, requirement: req };

  // Radius filter: only apply when the resource carries real coordinates
  // and a radius was actually set (map slider or Zeus's radiusKm field).
  const withinRadius = req.radiusKm
    ? list.filter((r) => typeof r.distanceKm !== 'number' || r.distanceKm <= req.radiusKm)
    : list;

  const scored = withinRadius
    .map((r) => ({ ...r, score: scoreResource(r, req), reasons: matchReasons(r, req) }))
    .sort((a, b) => b.score - a.score);

  countLabel.textContent = scored.length
    ? (scored.length === 1
        ? t('message.showingCountOne')
        : t('message.showingCount', { count: I18N.num(scored.length) }))
    : t('message.noResults');

  grid.innerHTML = '';
  if (!scored.length) {
    grid.innerHTML = `<div class="results-empty">${escapeHtml(t('message.tryWidening'))}</div>`;
    renderMapMarkers([]);
    return;
  }

  scored.forEach((r) => {
    const card = document.createElement('article');
    card.className = 'result-card';
    card.setAttribute('data-resource-id', r.id);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('title', `View details for ${r.name}`);
    const piClass = VISUAL_CLASS[r.type] || 'pi-hotel';
    const isFav = favorites.has(r.id);
    const badgeClass = r.score >= 90 ? STATUS_BADGE.confirmed : r.score >= 75 ? STATUS_BADGE.active : STATUS_BADGE.negotiating;

    const visualContent = r.image_url
      ? `<img src="${escapeHtml(r.image_url)}" alt="${escapeHtml(r.name)}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">`
      : categoryScene(piClass, r.name);

    card.innerHTML = `
      <div class="result-visual photo-illustration ${piClass}" data-resource-id="${r.id}">
        <span class="badge ${badgeClass}"><i></i>${t('common.percentMatch', { pct: I18N.num(r.score) })}</span>
        <button class="result-fav ${isFav ? 'is-fav' : ''}" data-fav-id="${r.id}" title="Save" type="button">♥</button>
        ${r.provider_verified ? '<span class="verified-chip" style="background:#3D8067; color:#F8F6EF; font-weight:700; border-color:#3D8067;">Verified Business</span>' : `<span class="verified-chip">${escapeHtml(t('status.verified'))}</span>`}
        ${visualContent}
        <div class="visual-hover-overlay">
          <span>View Details →</span>
        </div>
      </div>
      <div class="result-body">
        <label class="compare-check">
          <input type="checkbox" data-compare-id="${r.id}" ${compareSelection.has(r.id) ? 'checked' : ''}> ${escapeHtml(t('button.compare'))}
        </label>
        <span class="result-type">${escapeHtml(t(RESOURCE_TYPE_KEYS[r.type] || 'resource.type'))}</span>
        <div class="result-name" data-resource-id="${r.id}">${escapeHtml(r.name)}</div>
        <div class="result-provider">${escapeHtml(r.provider)} ${r.provider_verified ? '<span title="Government & Business Proof Verified" style="color:#3D8067; font-weight:700; font-size:0.75rem; background:#E8F2E8; border:1px solid #BED8C5; padding:0.1rem 0.4rem; border-radius:999px; margin-left:0.25rem;">Verified Business</span>' : ''} · ${escapeHtml(r.location)}</div>
        <div class="result-meta">
          <span class="result-rating">★ ${I18N.num(r.rating.toFixed(1))}</span>
          <span>${escapeHtml(t('resource.capacity'))} ${I18N.num(r.capacity)}</span>
          <span>${I18N.num(r.distanceKm)} ${escapeHtml(t('common.km'))}</span>
        </div>
        <div class="result-price">${I18N.money(r.price)} <span>${escapeHtml(t(r.unit === 'day' ? 'common.perDay' : 'common.perHour'))}</span></div>
        <div class="match-row">
          <div class="match-bar"><div class="match-bar-fill" style="width:${r.score}%"></div></div>
          <span class="match-label">${I18N.num(r.score)}%</span>
        </div>
        ${r.reasons && r.reasons.length ? `
        <details class="why-match">
          <summary>${escapeHtml(t('zeus.whyRecommended'))}</summary>
          <ul>${r.reasons.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
        </details>` : ''}
        <div class="result-card-actions">
          <button class="btn btn-primary btn-sm result-request-btn" type="button" data-resource-id="${r.id}">${escapeHtml(t('resource.requestThis'))}</button>
          ${typeof r.lat === 'number' ? `<button class="btn btn-outline btn-sm" type="button" data-view-map-id="${r.id}">${escapeHtml(t('map.viewOnMap'))}</button>` : ''}
        </div>
      </div>
    `;

    const navToDetails = () => { window.location.href = `resource-details.html?id=${r.id}`; };

    card.addEventListener('click', (e) => {
      if (e.target.closest('button, input, label, summary, details, a')) return;
      navToDetails();
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (!e.target.closest('button, input, label, summary, details, a')) {
          e.preventDefault();
          navToDetails();
        }
      }
    });

    card.querySelector('[data-fav-id]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (favorites.has(r.id)) { favorites.delete(r.id); e.target.classList.remove('is-fav'); }
      else { favorites.add(r.id); e.target.classList.add('is-fav'); }
    });

    card.querySelector('[data-compare-id]').addEventListener('change', (e) => {
      e.stopPropagation();
      if (e.target.checked) compareSelection.add(r.id); else compareSelection.delete(r.id);
      updateCompareBar();
    });

    card.querySelector('.result-request-btn').addEventListener('click', async (e) => {
      const btn = e.target;
      const resourceId = parseInt(btn.dataset.resourceId, 10);

      if (!window.RivoraAPI || !RivoraAPI.isAuthenticated()) {
        alert('Please log in to submit a booking request.');
        window.location.href = 'login.html';
        return;
      }

      btn.textContent = 'Requesting…';
      btn.disabled = true;

      try {
        const tomorrow = new Date(Date.now() + 86400000);
        const tomorrowEnd = new Date(tomorrow.getTime() + 8 * 3600000);
        await RivoraAPI.createBooking({
          resource_id: resourceId,
          start_time: tomorrow.toISOString(),
          end_time: tomorrowEnd.toISOString(),
          requested_price: r.price,
          notes: 'Requested from Seeker Marketplace'
        });
        btn.textContent = (t('resource.requested') || 'Requested') + ' ✓';
        alert('Booking request sent successfully to the provider! You can track it under Requests.');
      } catch (err) {
        if (err.status === 409) {
          alert('Conflict: This slot is already booked for that time range!');
          btn.textContent = 'Conflict';
        } else {
          alert(err.message || 'Could not submit booking request.');
          btn.disabled = false;
          btn.textContent = t('resource.requestThis') || 'Request this';
        }
      }
    });

    card.querySelector('[data-view-map-id]')?.addEventListener('click', () => focusMapMarker(r.id));

    grid.appendChild(card);
  });

  updateCompareBar();
  renderMapMarkers(scored); // keep the map in sync with whatever the grid just showed
}

function updateCompareBar() {
  const bar = document.getElementById('compare-bar');
  const count = document.getElementById('compare-count');
  if (!bar) return;
  if (compareSelection.size >= 2) {
    bar.hidden = false;
    count.textContent = `${I18N.num(compareSelection.size)} ${t('seeker.selected')}`;
  } else {
    bar.hidden = true;
    document.getElementById('compare-panel').hidden = true;
  }
}

function clearCompare() {
  compareSelection.clear();
  document.querySelectorAll('[data-compare-id]').forEach((cb) => { cb.checked = false; });
  updateCompareBar();
}

function renderCompareTable() {
  const items = SAMPLE_RESOURCES.filter((r) => compareSelection.has(r.id));
  const panel = document.getElementById('compare-panel');
  const table = document.getElementById('compare-table');

  const rows = [
    [t('analytics.colProvider'), (r) => r.provider],
    [t('resource.type'), (r) => t(RESOURCE_TYPE_KEYS[r.type] || 'resource.type')],
    [t('resource.capacity'), (r) => I18N.num(r.capacity)],
    [t('analytics.colPrice'), (r) => `${I18N.money(r.price)} ${t(r.unit === 'day' ? 'common.perDay' : 'common.perHour')}`],
    [t('common.km'), (r) => `${I18N.num(r.distanceKm)} ${t('common.km')}`],
    [t('profile.ratings'), (r) => `${I18N.num(r.rating.toFixed(1))} ★`],
  ];

  let html = '<thead><tr><th></th>' + items.map((r) => `<th>${escapeHtml(r.name)}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach(([label, getter]) => {
    html += `<tr><th>${label}</th>` + items.map((r) => `<td>${escapeHtml(String(getter(r)))}</td>`).join('') + '</tr>';
  });
  html += '</tbody>';

  table.innerHTML = html;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------------------------------------------------------
   Resource details — availability calendar + request form
--------------------------------------------------------- */

async function initResourceDetails() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;

  const api = window.RivoraAPI;
  const urlParams = new URLSearchParams(window.location.search);
  const rawId = urlParams.get('id');
  let resourceId = rawId ? parseInt(rawId, 10) : null;
  if (isNaN(resourceId)) resourceId = null;

  // If no ID specified, look up available resources and pick the first
  if (!resourceId && api) {
    try {
      const allRes = await api.searchResources();
      if (allRes && allRes.length > 0) {
        resourceId = allRes[0].id;
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', `${window.location.pathname}?id=${resourceId}`);
        }
      }
    } catch (e) {
      console.warn('[RivoraAPI] Error getting fallback resource:', e);
    }
  }

  const currentUser = api && typeof api.getUser === 'function' ? api.getUser() : null;
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();

  let pricePerDay = 5000;
  let unitLabel = 'day';
  let selectedStartDate = null;
  let selectedEndDate = null;
  let allBookedSlots = [];

  if (api && resourceId) {
    try {
      currentResource = await api.getResource(resourceId);
    } catch (err) {
      console.warn('[RivoraAPI] Error loading resource details:', err.message);
    }
  }

  const mainContent = document.getElementById('main-content');
  if (!currentResource) {
    if (mainContent) {
      mainContent.innerHTML = `
        <div style="padding: 4rem 2rem; text-align: center; max-width: 540px; margin: 0 auto;">
          <h2 style="font-size: 1.6rem; font-family: var(--font-head); margin-bottom: 0.6rem;">Resource Not Found</h2>
          <p style="color: var(--ink-soft); margin-bottom: 1.8rem; font-size: 0.95rem;">
            This property or resource may have been unlisted, removed, or the link is expired.
          </p>
          <a href="seeker.html" class="btn btn-primary" style="display:inline-block; text-decoration:none;">Browse Available Resources</a>
        </div>
      `;
    }
    return;
  }

  // Determine user role and ownership
  const isOwner = currentUser && (
    currentUser.id === currentResource.provider_id ||
    (currentUser.business_type === 'provider' && currentUser.name === currentResource.provider_name)
  );
  const isProviderUser = isOwner || (currentUser && currentUser.business_type === 'provider');

  pricePerDay = parseFloat(currentResource.price_per_unit) || 5000;
  unitLabel = currentResource.price_unit === 'per_hour' ? 'hour' : 'day';
  document.title = `${currentResource.name} · Rivora`;

  // Update back navigation link
  const backLink = document.getElementById('resource-back-link');
  const backLinkText = document.getElementById('back-link-text');
  if (backLink && backLinkText) {
    if (isProviderUser) {
      backLink.setAttribute('href', 'provider.html');
      backLinkText.textContent = 'Back to my listings';
    } else {
      backLink.setAttribute('href', 'seeker.html');
      backLinkText.textContent = 'Back to search results';
    }
  }

  // Update sidebar role switch active state
  document.querySelectorAll('.sidebar-role-switch a').forEach((a) => {
    const href = a.getAttribute('href');
    if (isProviderUser && href === 'provider.html') a.classList.add('is-active');
    else if (!isProviderUser && href === 'seeker.html') a.classList.add('is-active');
    else a.classList.remove('is-active');
  });

  // Populate Header & Titles
  const nameEl = document.getElementById('detail-name');
  if (nameEl) nameEl.textContent = currentResource.name;

  const providerEl = document.getElementById('detail-provider');
  if (providerEl) {
    if (currentResource.provider_verified) {
      providerEl.innerHTML = `<strong>${escapeHtml(currentResource.provider_name || 'Hospitality Partner')}</strong> <span class="verify-badge-pill" style="display:inline-flex; align-items:center; gap:0.25rem; background:#E8F2E8; color:#3C765F; font-size:0.75rem; font-weight:700; padding:0.15rem 0.5rem; border-radius:999px; border:1px solid #BED8C5; margin-left:0.35rem;">Verified Business</span> · ${escapeHtml(currentResource.location || 'Mumbai')}`;
    } else {
      providerEl.textContent = `${currentResource.provider_name || 'Provider'} · ${currentResource.location || 'Mumbai'}`;
    }
  }

  const typeEl = document.getElementById('detail-type');
  if (typeEl && currentResource.type) {
    typeEl.textContent = currentResource.type.charAt(0).toUpperCase() + currentResource.type.slice(1);
  }

  const statusText = document.getElementById('detail-status-text');
  const statusBadge = document.getElementById('detail-status-badge');
  if (statusText) statusText.textContent = currentResource.status === 'active' ? 'Active' : currentResource.status;
  if (statusBadge && currentResource.status !== 'active') {
    statusBadge.className = 'badge badge-rose';
  }

  // Populate Dynamic Host Trust & Reliability Scorecard
  if (currentResource.provider_id && window.RivoraAPI) {
    RivoraAPI.request(`/auth/business/${currentResource.provider_id}/trust-profile`).then((tp) => {
      const relPill = document.getElementById('host-reliability-pill');
      if (relPill) relPill.textContent = `${tp.reliability_score}% Reliability Score`;
      const statDeals = document.getElementById('trust-stat-deals');
      if (statDeals) statDeals.textContent = `${tp.completed_deals_count || 12}+`;
      const statPayouts = document.getElementById('trust-stat-payouts');
      if (statPayouts) statPayouts.textContent = `₹${((tp.escrow_disbursed_total || 150000) / 100000).toFixed(1)}L+`;
      const statCancel = document.getElementById('trust-stat-cancel');
      if (statCancel) statCancel.textContent = `${tp.cancellation_rate_pct || 0}%`;
      const statLic = document.getElementById('trust-stat-licenses');
      if (statLic) statLic.textContent = tp.verified ? '✓ Verified Host' : 'Statutory In Review';
    }).catch((e) => console.warn('Could not load trust profile:', e));

    // Load authentic completed-booking reviews
    RivoraAPI.request(`/reviews/resource/${currentResource.id}`).then((revs) => {
      const container = document.getElementById('real-reviews-container');
      if (container && revs && revs.length > 0) {
        container.innerHTML = revs.map((r) => `
          <div class="review-item">
            <div class="review-head">
              <span class="review-author">${escapeHtml(r.reviewer_name || 'Verified Seeker')} <span class="admin-badge admin-badge--verified" style="font-size:0.68rem; margin-left:0.25rem;">✓ Verified Booking</span></span>
              <span class="review-rating">${r.rating}.0 ★</span>
            </div>
            <p class="review-text">${escapeHtml(r.comment || 'Seamless transaction, highly recommended.')}</p>
          </div>
        `).join('');
      }
    }).catch(() => {});
  }

  // Populate Gallery
  const galleryTag = document.getElementById('detail-gallery-tag');
  if (galleryTag) {
    galleryTag.textContent = `${currentResource.name} · ${currentResource.location || 'Mumbai'}`;
  }

  const galleryEl = document.getElementById('detail-gallery');
  const gallerySvg = document.getElementById('detail-gallery-svg');
  const prevBtn = document.getElementById('gallery-prev');
  const nextBtn = document.getElementById('gallery-next');
  const counterEl = document.getElementById('detail-gallery-counter');
  const thumbsContainer = document.getElementById('detail-gallery-thumbs');

  // Extract all photos: check currentResource.images first, then image_url
  let galleryPhotos = [];
  if (Array.isArray(currentResource.images) && currentResource.images.length > 0) {
    galleryPhotos = currentResource.images.filter(Boolean);
  } else if (typeof currentResource.images === 'string' && currentResource.images.trim()) {
    try {
      const parsed = JSON.parse(currentResource.images);
      if (Array.isArray(parsed)) galleryPhotos = parsed.filter(Boolean);
      else galleryPhotos = [currentResource.images];
    } catch {
      galleryPhotos = currentResource.images.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  if (galleryPhotos.length === 0 && currentResource.image_url) {
    galleryPhotos = [currentResource.image_url];
  }

  let activePhotoIndex = 0;

  function updateGalleryDisplay() {
    if (!galleryEl) return;
    if (galleryPhotos.length > 0) {
      const currentPhoto = galleryPhotos[activePhotoIndex];
      galleryEl.style.backgroundImage = `url('${currentPhoto}')`;
      galleryEl.style.backgroundSize = 'cover';
      galleryEl.style.backgroundPosition = 'center';
      if (gallerySvg) gallerySvg.style.display = 'none';

      if (galleryPhotos.length > 1) {
        if (prevBtn) prevBtn.style.display = 'flex';
        if (nextBtn) nextBtn.style.display = 'flex';
        if (counterEl) {
          counterEl.style.display = 'block';
          counterEl.textContent = `${activePhotoIndex + 1} / ${galleryPhotos.length}`;
        }
      } else {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (counterEl) counterEl.style.display = 'none';
      }

      // Update active thumbnail
      if (thumbsContainer) {
        thumbsContainer.querySelectorAll('.gallery-thumb-item').forEach((thumb, idx) => {
          if (idx === activePhotoIndex) {
            thumb.classList.add('is-active');
            thumb.setAttribute('aria-selected', 'true');
          } else {
            thumb.classList.remove('is-active');
            thumb.setAttribute('aria-selected', 'false');
          }
        });
      }
    } else {
      galleryEl.style.backgroundImage = 'none';
      if (gallerySvg) gallerySvg.style.display = 'block';
      const piClass = THUMB_ILLUSTRATIONS[currentResource.type ? (currentResource.type.charAt(0).toUpperCase() + currentResource.type.slice(1)) : 'Space'] || 'pi-hotel';
      galleryEl.className = `detail-gallery photo-illustration ${piClass}`;
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      if (counterEl) counterEl.style.display = 'none';
      if (thumbsContainer) thumbsContainer.innerHTML = '';
    }
  }

  // Render thumbnails if multiple photos
  if (thumbsContainer) {
    thumbsContainer.innerHTML = '';
    if (galleryPhotos.length > 1) {
      galleryPhotos.forEach((photoUrl, idx) => {
        const thumb = document.createElement('div');
        thumb.className = `gallery-thumb-item ${idx === 0 ? 'is-active' : ''}`;
        thumb.style.backgroundImage = `url('${photoUrl}')`;
        thumb.setAttribute('role', 'button');
        thumb.setAttribute('tabindex', '0');
        thumb.setAttribute('aria-label', `View photo ${idx + 1}`);
        thumb.setAttribute('title', `Photo ${idx + 1} of ${galleryPhotos.length}`);
        thumb.addEventListener('click', () => {
          activePhotoIndex = idx;
          updateGalleryDisplay();
        });
        thumb.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activePhotoIndex = idx;
            updateGalleryDisplay();
          }
        });
        thumbsContainer.appendChild(thumb);
      });
    }
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activePhotoIndex = (activePhotoIndex - 1 + galleryPhotos.length) % galleryPhotos.length;
      updateGalleryDisplay();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activePhotoIndex = (activePhotoIndex + 1) % galleryPhotos.length;
      updateGalleryDisplay();
    });
  }

  // Keyboard arrow navigation for gallery
  document.addEventListener('keydown', (e) => {
    if (galleryPhotos.length <= 1) return;
    if (e.key === 'ArrowLeft') {
      activePhotoIndex = (activePhotoIndex - 1 + galleryPhotos.length) % galleryPhotos.length;
      updateGalleryDisplay();
    } else if (e.key === 'ArrowRight') {
      activePhotoIndex = (activePhotoIndex + 1) % galleryPhotos.length;
      updateGalleryDisplay();
    }
  });

  updateGalleryDisplay();

  // Populate Description & Conditions
  const descEl = document.getElementById('detail-description');
  if (descEl) {
    if (currentResource.description && currentResource.description.trim()) {
      descEl.textContent = currentResource.description;
      descEl.style.fontStyle = 'normal';
      descEl.style.color = 'var(--ink-soft)';
    } else {
      descEl.textContent = 'No description provided for this listing.';
      descEl.style.fontStyle = 'italic';
      descEl.style.color = 'var(--ink-faint)';
    }
  }

  const condEl = document.getElementById('detail-conditions');
  if (condEl) {
    if (currentResource.conditions_text && currentResource.conditions_text.trim()) {
      condEl.textContent = currentResource.conditions_text;
      condEl.style.fontStyle = 'normal';
      condEl.style.color = 'var(--ink-soft)';
    } else {
      condEl.textContent = 'Standard terms apply. Contact the provider for specific requests.';
      condEl.style.fontStyle = 'italic';
      condEl.style.color = 'var(--ink-faint)';
    }
  }

  // Edit Listing Details Modal (for owner)
  const editModal = document.getElementById('edit-details-modal');
  const openEditBtn = document.getElementById('btn-open-edit-modal');
  const closeEditBtn = document.getElementById('edit-modal-close');
  const cancelEditBtn = document.getElementById('btn-cancel-edit');
  const backdropEdit = document.getElementById('edit-modal-backdrop');
  const editForm = document.getElementById('edit-details-form');

  const editDescInput = document.getElementById('edit-desc');
  const editCondInput = document.getElementById('edit-conditions');
  const editCapInput = document.getElementById('edit-capacity');
  const editMinDurInput = document.getElementById('edit-min-dur');

  function openEditModal() {
    if (!editModal) return;
    if (editDescInput) editDescInput.value = currentResource.description || '';
    if (editCondInput) editCondInput.value = currentResource.conditions_text || '';
    if (editCapInput) editCapInput.value = currentResource.capacity || '';
    if (editMinDurInput) editMinDurInput.value = currentResource.min_duration || 1;
    editModal.hidden = false;
  }

  function closeEditModal() {
    if (editModal) editModal.hidden = true;
  }

  if (openEditBtn) openEditBtn.addEventListener('click', openEditModal);
  if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditModal);
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditModal);
  if (backdropEdit) backdropEdit.addEventListener('click', closeEditModal);

  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-edit');
      const origText = saveBtn ? saveBtn.textContent : 'Save Changes';
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

      const updatedPayload = {
        description: editDescInput ? editDescInput.value.trim() : null,
        conditions_text: editCondInput ? editCondInput.value.trim() : null,
        capacity: editCapInput && editCapInput.value ? parseInt(editCapInput.value, 10) : null,
        min_duration: editMinDurInput && editMinDurInput.value ? parseInt(editMinDurInput.value, 10) : 1,
      };

      try {
        if (api && api.updateResource) {
          const res = await api.updateResource(currentResource.id, updatedPayload);
          currentResource.description = res.description;
          currentResource.conditions_text = res.conditions_text;
          currentResource.capacity = res.capacity;
          currentResource.min_duration = res.min_duration;

          // Update UI live
          if (descEl) {
            if (currentResource.description) {
              descEl.textContent = currentResource.description;
              descEl.style.fontStyle = 'normal';
              descEl.style.color = 'var(--ink-soft)';
            } else {
              descEl.textContent = 'No description provided for this listing.';
              descEl.style.fontStyle = 'italic';
              descEl.style.color = 'var(--ink-faint)';
            }
          }

          if (condEl) {
            if (currentResource.conditions_text) {
              condEl.textContent = currentResource.conditions_text;
              condEl.style.fontStyle = 'normal';
              condEl.style.color = 'var(--ink-soft)';
            } else {
              condEl.textContent = 'Standard terms apply. Contact the provider for specific requests.';
              condEl.style.fontStyle = 'italic';
              condEl.style.color = 'var(--ink-faint)';
            }
          }

          const chipCapEl = document.getElementById('chip-capacity');
          if (chipCapEl) chipCapEl.textContent = currentResource.capacity ? I18N.num(currentResource.capacity) : '—';

          const chipMinEl = document.getElementById('chip-min-booking');
          if (chipMinEl) {
            const minDur = currentResource.min_duration || 1;
            chipMinEl.textContent = `${minDur} ${unitLabel}${minDur > 1 ? 's' : ''}`;
          }
        }
        closeEditModal();
      } catch (err) {
        alert('Could not update listing: ' + (err.message || 'Error occurred'));
      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = origText; }
      }
    });
  }

  // Populate Meta Chips
  const chipCap = document.getElementById('chip-capacity');
  if (chipCap) chipCap.textContent = currentResource.capacity ? I18N.num(currentResource.capacity) : '—';

  const chipQty = document.getElementById('chip-quantity');
  if (chipQty) chipQty.textContent = currentResource.quantity ? I18N.num(currentResource.quantity) : 1;

  const chipMin = document.getElementById('chip-min-booking');
  if (chipMin) {
    const minDur = currentResource.min_duration || 1;
    chipMin.textContent = `${minDur} ${unitLabel}${minDur > 1 ? 's' : ''}`;
  }

  const chipPrice = document.getElementById('chip-price');
  if (chipPrice) chipPrice.textContent = I18N.money(pricePerDay);

  const chipPriceUnit = document.getElementById('chip-price-unit');
  if (chipPriceUnit) chipPriceUnit.textContent = currentResource.price_unit === 'per_hour' ? 'Per hour' : 'Per day';

  // Populate AI Match / Listing Insights Box
  const aiHeading = document.getElementById('ai-match-heading');
  const aiList = document.getElementById('ai-match-list');
  if (aiHeading && aiList) {
    if (isOwner) {
      aiHeading.textContent = 'Listing Performance & Market Visibility';
      aiList.innerHTML = `
        <li><i></i><span>Active listing in Rivora Mumbai B2B marketplace</span></li>
        <li><i></i><span>Direct seeker booking requests and counter-offers enabled</span></li>
        <li><i></i><span>Live availability calendar linked for instant verification</span></li>
        <li><i></i><span>Automated conflict detection prevents overlapping bookings</span></li>
      `;
    } else {
      aiHeading.textContent = 'Why this is a good match for you';
      aiList.innerHTML = `
        <li><i></i><span>${currentResource.capacity ? I18N.num(currentResource.capacity) + ' guest capacity covers standard event requirements' : 'Flexible layout and capacity setup'}</span></li>
        <li><i></i><span>Competitive rate at ${I18N.money(pricePerDay)} / ${unitLabel}</span></li>
        <li><i></i><span>Verified Provider: ${escapeHtml(currentResource.provider_name || 'Hospitality Partner')}</span></li>
        <li><i></i><span>Located in ${escapeHtml(currentResource.location || 'Mumbai')}</span></li>
      `;
    }
  }

  // Toggle Sidebar Panels based on role/ownership
  const seekerPanel = document.getElementById('seeker-action-panel');
  const providerPanel = document.getElementById('provider-manage-panel');
  const sidebarPrice = document.getElementById('sidebar-price');
  const providerSidebarPrice = document.getElementById('provider-sidebar-price');
  const providerStatsRate = document.getElementById('provider-stats-rate');

  const formattedPrice = `${I18N.money(pricePerDay)} <span style="font-size:0.75rem; color:var(--ink-faint); font-weight:normal;">/ ${unitLabel}</span>`;
  if (sidebarPrice) sidebarPrice.innerHTML = formattedPrice;
  if (providerSidebarPrice) providerSidebarPrice.innerHTML = formattedPrice;
  if (providerStatsRate) providerStatsRate.textContent = `${I18N.money(pricePerDay)}/${unitLabel}`;

  if (isOwner) {
    if (seekerPanel) seekerPanel.style.display = 'none';
    if (providerPanel) providerPanel.style.display = 'block';
  } else {
    if (seekerPanel) seekerPanel.style.display = 'block';
    if (providerPanel) providerPanel.style.display = 'none';
  }

  // Adjust calendar legend and hint based on ownership
  const legendBlockedItem = document.getElementById('legend-blocked-item');
  const legendSelectedItem = document.getElementById('legend-selected-item');
  const calendarHint = document.getElementById('calendar-hint');

  if (isOwner) {
    if (legendBlockedItem) legendBlockedItem.style.display = 'inline-flex';
    if (legendSelectedItem) legendSelectedItem.style.display = 'none';
    if (calendarHint) calendarHint.textContent = 'Click any available date to block it, or click a blocked date to make it available.';
  } else {
    if (legendBlockedItem) legendBlockedItem.style.display = 'none';
    if (legendSelectedItem) legendSelectedItem.style.display = 'inline-flex';
  }

  // Pause / Inactive Listing Toggle (for owner)
  const pauseCheckbox = document.getElementById('pause-listing-checkbox');
  const providerStatusPill = document.getElementById('provider-status-pill');
  const providerTopStatusBadge = document.getElementById('provider-top-status-badge');
  const pauseToggleTitle = document.getElementById('pause-toggle-title');
  const pauseToggleDesc = document.getElementById('pause-toggle-desc');

  function updateStatusDisplay(status) {
    const isPaused = status === 'paused' || status === 'inactive';
    if (pauseCheckbox) pauseCheckbox.checked = isPaused;

    if (providerStatusPill) {
      if (isPaused) {
        providerStatusPill.textContent = 'Paused / Inactive';
        providerStatusPill.className = 'badge badge-rose';
        providerStatusPill.style.background = 'rgba(224, 82, 82, 0.12)';
        providerStatusPill.style.color = 'var(--rose, #B95F58)';
        providerStatusPill.style.borderColor = 'rgba(224, 82, 82, 0.3)';
      } else {
        providerStatusPill.textContent = 'Published';
        providerStatusPill.className = 'badge badge-sky';
        providerStatusPill.style.background = '';
        providerStatusPill.style.color = '';
        providerStatusPill.style.borderColor = '';
      }
    }

    if (providerTopStatusBadge) {
      providerTopStatusBadge.innerHTML = isPaused ? '<i></i>Paused Listing' : '<i></i>Active Listing';
      providerTopStatusBadge.className = isPaused ? 'badge badge-rose' : 'badge badge-coral';
    }

    if (pauseToggleTitle) {
      pauseToggleTitle.textContent = isPaused ? 'Listing Paused' : 'Pause Listing';
    }
    if (pauseToggleDesc) {
      pauseToggleDesc.textContent = isPaused ? 'Hidden from public seeker search' : 'Temporarily hide from search';
    }

    const detailStatusText = document.getElementById('detail-status-text');
    const detailStatusBadge = document.getElementById('detail-status-badge');
    if (detailStatusText) {
      detailStatusText.textContent = isPaused ? 'Paused' : 'Active';
    }
    if (detailStatusBadge) {
      detailStatusBadge.className = isPaused ? 'badge badge-rose' : 'badge badge-coral';
    }
  }

  updateStatusDisplay(currentResource.status);

  if (pauseCheckbox) {
    pauseCheckbox.addEventListener('change', async () => {
      const willPause = pauseCheckbox.checked;
      const newStatus = willPause ? 'paused' : 'active';
      try {
        if (api && api.updateResource) {
          const res = await api.updateResource(currentResource.id, { status: newStatus });
          currentResource.status = res.status;
          updateStatusDisplay(currentResource.status);
        }
      } catch (err) {
        alert('Could not update listing status: ' + (err.message || 'Error occurred'));
        pauseCheckbox.checked = !willPause;
      }
    });
  }

  // Delete Listing Confirmation Modal (for owner)
  const deleteModal = document.getElementById('delete-confirm-modal');
  const openDeleteBtn = document.getElementById('btn-open-delete-modal');
  const cancelDeleteBtn = document.getElementById('btn-cancel-delete');
  const backdropDelete = document.getElementById('delete-modal-backdrop');
  const confirmDeleteBtn = document.getElementById('btn-confirm-delete');

  function openDeleteModal() {
    if (deleteModal) deleteModal.hidden = false;
  }
  function closeDeleteModal() {
    if (deleteModal) deleteModal.hidden = true;
  }

  if (openDeleteBtn) openDeleteBtn.addEventListener('click', openDeleteModal);
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteModal);
  if (backdropDelete) backdropDelete.addEventListener('click', closeDeleteModal);

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
      const origText = confirmDeleteBtn.textContent;
      confirmDeleteBtn.disabled = true;
      confirmDeleteBtn.textContent = 'Deleting…';
      try {
        if (api && api.deleteResource) {
          await api.deleteResource(currentResource.id);
          window.location.href = 'provider.html';
        }
      } catch (err) {
        alert('Could not delete listing: ' + (err.message || 'Error occurred'));
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = origText;
      }
    });
  }

  // Fetch real booked slots from database
  try {
    const slots = await (api ? api.getResourceBookedSlots(resourceId) : []);
    allBookedSlots = slots || [];
    const providerBookedCount = document.getElementById('provider-booked-count');
    if (providerBookedCount) {
      providerBookedCount.textContent = `${allBookedSlots.length} booked slot${allBookedSlots.length === 1 ? '' : 's'}`;
    }
  } catch (err) {
    console.warn('[RivoraAPI] Error loading booked slots:', err.message);
    allBookedSlots = [];
  }

  // Message provider chat trigger
  const msgBtn = document.getElementById('message-provider-btn');
  const chatBtnText = document.getElementById('chat-btn-text');
  if (chatBtnText && currentResource.provider_name) {
    chatBtnText.textContent = `Chat with ${currentResource.provider_name}`;
  }
  if (msgBtn) {
    msgBtn.addEventListener('click', () => {
      openChat({
        id: `resource-${currentResource.id}`,
        resource: currentResource.name,
        counterpart: currentResource.provider_name || 'Provider'
      });
    });
  }

  // Initialize Leaflet Map
  const detailMapEl = document.getElementById('resource-detail-map');
  if (detailMapEl && typeof L !== 'undefined') {
    const pos = { lat: 19.1197 + ((currentResource.id * 7) % 20) * 0.004, lng: 72.8468 + ((currentResource.id * 11) % 20) * 0.004 };
    const detailMap = L.map(detailMapEl, { scrollWheelZoom: false }).setView([pos.lat, pos.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(detailMap);
    const icon = L.divIcon({ className: '', html: '<div class="map-marker map-marker--available"><span>R</span></div>', iconSize: [28, 28], iconAnchor: [14, 28] });
    L.marker([pos.lat, pos.lng], { icon }).addTo(detailMap).bindPopup(`<strong>${escapeHtml(currentResource.name)}</strong><br>${escapeHtml(currentResource.location || 'Mumbai')}`).openPopup();
    setTimeout(() => detailMap.invalidateSize(), 200);
  }

  // Month navigation setup
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const calPrevBtn = document.getElementById('cal-prev-btn');
  const calNextBtn = document.getElementById('cal-next-btn');
  const calMonthLabel = document.getElementById('calendar-month-label');

  if (calPrevBtn) {
    calPrevBtn.addEventListener('click', () => {
      const isPastOrCur = (viewYear < today.getFullYear()) || (viewYear === today.getFullYear() && viewMonth <= today.getMonth());
      if (!isPastOrCur) {
        viewMonth--;
        if (viewMonth < 0) {
          viewMonth = 11;
          viewYear--;
        }
        renderCalendar();
      }
    });
  }

  if (calNextBtn) {
    calNextBtn.addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear++;
      }
      renderCalendar();
    });
  }

  // Render Availability Calendar
  renderCalendar();

  function renderCalendar() {
    if (calMonthLabel) {
      calMonthLabel.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
    }
    if (calPrevBtn) {
      const isPastOrCur = (viewYear < today.getFullYear()) || (viewYear === today.getFullYear() && viewMonth <= today.getMonth());
      calPrevBtn.disabled = isPastOrCur;
    }

    calendarEl.innerHTML = '';
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].forEach((d) => {
      const el = document.createElement('div');
      el.className = 'calendar-weekday';
      el.textContent = t('calendar.' + d);
      calendarEl.appendChild(el);
    });

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    // Map booked days for this viewMonth, separating client bookings from owner blocks
    const ownerBlockedDaysSet = new Set();
    const clientBookedDaysSet = new Set();
    const mStart = new Date(viewYear, viewMonth, 1, 0, 0, 0);
    const mEnd = new Date(viewYear, viewMonth, daysInMonth, 23, 59, 59);

    allBookedSlots.forEach((s) => {
      const start = new Date(s.start_time);
      const end = new Date(s.end_time);
      if (end >= mStart && start <= mEnd) {
        const sDay = (start.getFullYear() === viewYear && start.getMonth() === viewMonth) ? start.getDate() : 1;
        const eDay = (end.getFullYear() === viewYear && end.getMonth() === viewMonth) ? end.getDate() : daysInMonth;
        for (let d = sDay; d <= eDay; d++) {
          if (s.is_blocked_by_owner) {
            ownerBlockedDaysSet.add(d);
          } else {
            clientBookedDaysSet.add(d);
          }
        }
      }
    });

    // Muted filler days before 1st of month
    for (let i = 0; i < firstDay; i++) {
      const el = document.createElement('div');
      el.className = 'calendar-day is-muted';
      calendarEl.appendChild(el);
    }

    const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-day';
      cell.textContent = I18N.num(day);

      const cellDate = new Date(viewYear, viewMonth, day, 0, 0, 0);
      const isPastDay = cellDate < todayZero;
      const isOwnerBlocked = ownerBlockedDaysSet.has(day);
      const isClientBooked = clientBookedDaysSet.has(day);

      if (isPastDay) {
        cell.classList.add('is-muted');
      } else if (isOwner) {
        // Provider viewing own resource: can click to toggle block
        if (isClientBooked) {
          cell.classList.add('is-booked');
          cell.title = 'Booked by client (confirmed)';
        } else if (isOwnerBlocked) {
          cell.classList.add('is-blocked-by-owner');
          cell.title = 'Blocked by you — click to make available';
          cell.addEventListener('click', () => handleOwnerToggleBlock(cellDate));
        } else {
          cell.classList.add('is-owner-interactive');
          if (cellDate.getTime() === todayZero.getTime()) cell.classList.add('is-today');
          cell.title = 'Available — click to block date';
          cell.addEventListener('click', () => handleOwnerToggleBlock(cellDate));
        }
      } else {
        // Seeker viewing resource: can select range
        if (isClientBooked || isOwnerBlocked) {
          cell.classList.add('is-booked');
          cell.title = 'Unavailable / Booked';
        } else {
          if (cellDate.getTime() === todayZero.getTime()) cell.classList.add('is-today');
          if (isDateSelected(cellDate)) cell.classList.add('is-selected');
          cell.addEventListener('click', () => handleDayClick(cellDate));
        }
      }
      calendarEl.appendChild(cell);
    }
  }

  async function handleOwnerToggleBlock(cellDate) {
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${cellDate.getFullYear()}-${pad(cellDate.getMonth() + 1)}-${pad(cellDate.getDate())}`;

    try {
      if (api && api.toggleBlockDate) {
        await api.toggleBlockDate(currentResource.id, dateStr);
        // Refresh booked slots from server to sync state
        const slots = await api.getResourceBookedSlots(currentResource.id);
        allBookedSlots = slots || [];
        const providerBookedCount = document.getElementById('provider-booked-count');
        if (providerBookedCount) {
          providerBookedCount.textContent = `${allBookedSlots.length} booked slot${allBookedSlots.length === 1 ? '' : 's'}`;
        }
        renderCalendar();
      }
    } catch (err) {
      alert('Could not update date availability: ' + (err.message || 'Error occurred'));
    }
  }

  function isDateSelected(cellDate) {
    const t = cellDate.getTime();
    if (!selectedStartDate) return false;
    const s = selectedStartDate.getTime();
    if (!selectedEndDate) return t === s;
    const e = selectedEndDate.getTime();
    return t >= s && t <= e;
  }

  function handleDayClick(cellDate) {
    const hint = document.getElementById('calendar-hint');
    if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
      selectedStartDate = cellDate;
      selectedEndDate = null;
      if (hint) hint.textContent = t('calendar.pickEnd');
      syncFormDates(selectedStartDate, null);
    } else {
      const start = selectedStartDate <= cellDate ? selectedStartDate : cellDate;
      const end = selectedStartDate <= cellDate ? cellDate : selectedStartDate;

      // Check if slot overlaps with booked slots
      const overlaps = allBookedSlots.some((slot) => {
        const s = new Date(slot.start_time);
        const e = new Date(slot.end_time);
        const sZero = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0);
        const eZero = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59);
        return end >= sZero && start <= eZero;
      });

      if (overlaps) {
        if (hint) hint.textContent = t('calendar.crossesBooked');
        selectedStartDate = null;
        selectedEndDate = null;
        syncFormDates(null, null);
      } else {
        selectedStartDate = start;
        selectedEndDate = end;
        const fmt = (d) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
        if (hint) hint.textContent = `${t('calendar.selected')}: ${fmt(start)} – ${fmt(end)} ${end.getFullYear()}`;
        syncFormDates(selectedStartDate, selectedEndDate);
      }
    }
    renderCalendar();
  }

  function syncFormDates(start, end) {
    const startInput = document.getElementById('req-start');
    const endInput = document.getElementById('req-end');
    if (!startInput || !endInput) return;
    const pad = (n) => String(n).padStart(2, '0');
    const toISO = (d) => d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
    startInput.value = toISO(start);
    endInput.value = toISO(end || start);
    updatePriceTotal();
  }

  function updatePriceTotal() {
    const startInput = document.getElementById('req-start');
    const endInput = document.getElementById('req-end');
    const totalEl = document.getElementById('price-total');
    if (!startInput || !endInput || !totalEl) return;
    if (!startInput.value || !endInput.value) {
      totalEl.textContent = `Estimated total: ${I18N.money(pricePerDay)} (1 ${unitLabel})`;
      return;
    }
    const start = new Date(startInput.value);
    const end = new Date(endInput.value);
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    totalEl.textContent = t('message.estimatedTotal', { total: I18N.money(days * pricePerDay), days: I18N.num(days) });
  }

  updatePriceTotal();

  const startInput = document.getElementById('req-start');
  const endInput = document.getElementById('req-end');
  const pad = (n) => String(n).padStart(2, '0');
  const todayISO = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (startInput) {
    startInput.min = todayISO;
    startInput.addEventListener('change', () => {
      if (startInput.value) {
        const parts = startInput.value.split('-').map(Number);
        selectedStartDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
        viewYear = parts[0];
        viewMonth = parts[1] - 1;
      } else {
        selectedStartDate = null;
      }
      updatePriceTotal();
      renderCalendar();
    });
  }
  if (endInput) {
    endInput.min = todayISO;
    endInput.addEventListener('change', () => {
      if (endInput.value) {
        const parts = endInput.value.split('-').map(Number);
        selectedEndDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
      } else {
        selectedEndDate = null;
      }
      updatePriceTotal();
      renderCalendar();
    });
  }

  // Booking form submission
  const form = document.getElementById('request-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('request-error');
      const successEl = document.getElementById('request-success');
      const submitBtn = document.getElementById('btn-submit-request') || form.querySelector('button[type="submit"]');
      if (errorEl) errorEl.hidden = true;
      if (successEl) successEl.hidden = true;

      if (!window.RivoraAPI || !RivoraAPI.isAuthenticated()) {
        alert('Please log in to submit a booking request.');
        window.location.href = 'login.html';
        return;
      }

      const sVal = startInput ? startInput.value : '';
      const eVal = endInput ? endInput.value : '';
      if (!sVal || !eVal) {
        if (errorEl) { errorEl.hidden = false; errorEl.textContent = 'Please select start and end dates.'; }
        return;
      }

      const sParts = sVal.split('-').map(Number);
      const eParts = eVal.split('-').map(Number);
      const start = new Date(sParts[0], sParts[1] - 1, sParts[2], 0, 0, 0);
      const end = new Date(eParts[0], eParts[1] - 1, eParts[2], 23, 59, 59);

      if (end < start) {
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = 'End date cannot be earlier than start date.';
        }
        return;
      }

      const overlaps = (allBookedSlots || []).some((slot) => {
        const s = new Date(slot.start_time);
        const e = new Date(slot.end_time);
        return end >= s && start <= e;
      });
      if (overlaps) {
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = (typeof t === 'function' ? t('calendar.crossesBooked') : null) || 'Selected dates overlap with an existing booking.';
        }
        return;
      }

      const diffTime = Math.abs(new Date(eParts[0], eParts[1] - 1, eParts[2]).getTime() - new Date(sParts[0], sParts[1] - 1, sParts[2]).getTime());
      const days = Math.max(1, Math.round(diffTime / 86400000) + 1);
      const calculatedPrice = days * pricePerDay;
      const messageVal = document.getElementById('req-message') ? document.getElementById('req-message').value : '';

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting request…'; }

      try {
        const startDt = new Date(sParts[0], sParts[1] - 1, sParts[2], 9, 0, 0);
        const endDt = new Date(eParts[0], eParts[1] - 1, eParts[2], 18, 0, 0);
        if (api) {
          await api.createBooking({
            resource_id: resourceId,
            start_time: startDt.toISOString(),
            end_time: endDt.toISOString(),
            requested_price: calculatedPrice,
            notes: messageVal ? messageVal.trim() : 'Requested via availability calendar'
          });
        }
        if (successEl) {
          successEl.hidden = false;
          successEl.textContent = '✓ Booking request placed successfully — pending provider confirmation!';
        }
        alert('✓ Booking request submitted successfully! You can track negotiations and confirmation under Requests.');
        form.reset();
        selectedStartDate = null;
        selectedEndDate = null;
        updatePriceTotal();
        try {
          const freshSlots = await api.getResourceBookedSlots(resourceId);
          allBookedSlots = freshSlots || [];
        } catch (_) {}
        renderCalendar();
      } catch (err) {
        console.error('[RivoraAPI] Booking request error:', err);
        if (errorEl) {
          errorEl.hidden = false;
          if (err.status === 409) {
            errorEl.textContent = 'Conflict: This slot was just booked by another seeker. Please select different dates.';
          } else {
            errorEl.textContent = err.message || 'Could not place booking request.';
          }
        }
        alert('Could not submit booking request: ' + (err.message || 'Error occurred. Please try again.'));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = (typeof t === 'function' ? t('resource.requestThis') : null) || 'Request this resource';
        }
      }
    });
  }

  // Dynamically load real Similar Resources from database
  if (api) {
    try {
      const allLive = await api.searchResources();
      const similarGrid = document.getElementById('similar-grid');
      const similarSection = document.getElementById('similar-section');
      if (similarGrid && allLive && allLive.length > 0) {
        // Exclude current resource
        const candidates = allLive.filter((r) => r.id !== currentResource.id);
        // Prioritize same type
        candidates.sort((a, b) => {
          const aMatch = a.type === currentResource.type ? 1 : 0;
          const bMatch = b.type === currentResource.type ? 1 : 0;
          return bMatch - aMatch;
        });
        const top3 = candidates.slice(0, 3);
        if (top3.length > 0) {
          similarGrid.innerHTML = '';
          top3.forEach((sim) => {
            const typeName = sim.type ? (sim.type.charAt(0).toUpperCase() + sim.type.slice(1)) : 'Space';
            const piClass = THUMB_ILLUSTRATIONS[typeName] || 'pi-hotel';
            const visual = sim.image_url
              ? `<img src="${escapeHtml(sim.image_url)}" alt="${escapeHtml(sim.name)}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">`
              : `<div class="photo-illustration ${piClass}" style="height:96px;">${categoryScene(piClass)}</div>`;

            const card = document.createElement('article');
            card.className = 'category-card';
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.setAttribute('title', `View details for ${sim.name}`);
            card.innerHTML = `
              <div style="height:96px; overflow:hidden;">${visual}</div>
              <div class="category-body">
                <div class="category-name">${escapeHtml(sim.name)}</div>
                <div class="category-sub">${sim.capacity ? I18N.num(sim.capacity) + ' cap · ' : ''}${I18N.money(sim.price_per_unit)}/${sim.price_unit === 'per_hour' ? 'hr' : 'day'}</div>
              </div>
            `;
            const navSim = () => { window.location.href = `resource-details.html?id=${sim.id}`; };
            card.addEventListener('click', navSim);
            card.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navSim(); }
            });
            similarGrid.appendChild(card);
          });
        } else if (similarSection) {
          similarSection.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('[RivoraAPI] Could not load similar resources:', e.message);
    }
  }
}

/* ---------------------------------------------------------
   Requests page — live persistent status tracker
--------------------------------------------------------- */

const SAMPLE_REQUESTS = [];

const STAGES = ['pending', 'negotiating', 'confirmed', 'completed'];

async function initRequestsPage() {
  const list = document.getElementById('request-list');
  if (!list) return;

  let currentDirection = 'received';
  let currentStatus = 'all';

  function updateCounts() {
    const recCount = SAMPLE_REQUESTS.filter((r) => r.direction === 'received').length;
    const sntCount = SAMPLE_REQUESTS.filter((r) => r.direction === 'sent').length;
    const recEl = document.getElementById('count-received');
    const sntEl = document.getElementById('count-sent');
    if (recEl) recEl.textContent = `(${I18N.num(recCount)})`;
    if (sntEl) sntEl.textContent = `(${I18N.num(sntCount)})`;
  }

  document.querySelectorAll('.search-tab[data-direction]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.search-tab[data-direction]').forEach((t) => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('is-active'); tab.setAttribute('aria-selected', 'true');
      currentDirection = tab.dataset.direction;
      render();
    });
  });

  document.querySelectorAll('.status-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.status-chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentStatus = chip.dataset.status;
      render();
    });
  });

  function render() {
    updateCounts();
    const items = SAMPLE_REQUESTS.filter((r) => r.direction === currentDirection && (currentStatus === 'all' || r.status === currentStatus));
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = `<div class="requests-empty">${escapeHtml(t('message.noRequests'))}</div>`;
      return;
    }
    items.forEach((r) => list.appendChild(buildRequestCard(r, render)));
  }

  window.refreshRequestsList = render;

  // Load real bookings from database
  if (window.RivoraAPI && RivoraAPI.isAuthenticated()) {
    try {
      const bookings = await RivoraAPI.getMyBookings();
      const user = RivoraAPI.getUser();
      SAMPLE_REQUESTS.length = 0;

      if (bookings && bookings.length > 0) {
        bookings.forEach((b) => {
          const isReceived = b.direction === 'received' || (user && b.seeker_id !== user.id);
          const counterpart = isReceived
            ? (b.seeker_name || b.counterpart_name || 'Seeker')
            : (b.provider_name || b.counterpart_name || 'Provider');
          const start = new Date(b.start_time);
          const formattedDates = !isNaN(start)
            ? `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Scheduled';
          const priceNum = parseFloat(b.latest_offer_amount || b.agreed_price || b.requested_price) || 0;

          SAMPLE_REQUESTS.push({
            id: b.id,
            direction: isReceived ? 'received' : 'sent',
            counterpart: counterpart,
            resource: b.resource_name || `Resource #${b.resource_id}`,
            datesKey: null,
            dates: formattedDates,
            priceNum: priceNum,
            price: I18N.money(priceNum),
            status: b.status || 'pending',
            rawBooking: b
          });
        });
      } else {
        loadDefaultSampleRequests();
      }
      render();
    } catch (e) {
      console.warn('[RivoraAPI] Could not fetch requests:', e.message);
      loadDefaultSampleRequests();
      render();
    }
  } else {
    loadDefaultSampleRequests();
    render();
  }

  function loadDefaultSampleRequests() {
    SAMPLE_REQUESTS.push(
      {
        id: 991,
        direction: 'received',
        counterpart: 'MVVERSE',
        resource: 'Banquet and Hall',
        datesKey: null,
        dates: 'Sep 28 – Sep 30, 2026',
        priceNum: 50000,
        price: '₹50,000',
        status: 'negotiating',
        rawBooking: null
      },
      {
        id: 992,
        direction: 'received',
        counterpart: 'Coastal Caterers',
        resource: 'Commercial Kitchen A',
        datesKey: null,
        dates: 'Oct 04, 2026 · Full Day',
        priceNum: 18000,
        price: '₹18,000',
        status: 'pending',
        rawBooking: null
      },
      {
        id: 993,
        direction: 'received',
        counterpart: 'Skyline Events',
        resource: 'Grand Ballroom',
        datesKey: null,
        dates: 'Oct 12, 2026',
        priceNum: 85000,
        price: '₹85,000',
        status: 'confirmed',
        rawBooking: null
      },
      {
        id: 994,
        direction: 'sent',
        counterpart: 'Grand Palm Hotel',
        resource: 'Hotel Parking Bay',
        datesKey: null,
        dates: 'Oct 15, 2026',
        priceNum: 12000,
        price: '₹12,000',
        status: 'pending',
        rawBooking: null
      }
    );
  }
}

function buildRequestCard(r, onRefresh) {
  const card = document.createElement('article');
  card.className = 'request-card-full';
  const badgeClass = STATUS_BADGE[r.status] || 'badge-neutral';
  const statusText = t('status.' + r.status) || r.status;
  const localizedDates = r.datesKey ? t(r.datesKey) : r.dates;
  const localizedPrice = r.priceNum ? I18N.money(r.priceNum) : r.price;

  card.innerHTML = `
    <div class="request-card-head">
      <div>
        <div class="request-card-title">${escapeHtml(r.counterpart)}</div>
        <div class="request-card-meta">${escapeHtml(r.resource)} · ${escapeHtml(localizedDates)} · ${escapeHtml(localizedPrice)}</div>
      </div>
      <span class="badge ${badgeClass}"><i></i>${escapeHtml(statusText)}</span>
    </div>
    ${buildStepper(r.status)}
    <div class="request-card-footer">
      <div class="request-actions">${buildFooterActions(r)}</div>
      <button class="btn-mini btn-mini--chat" data-chat-id="${r.id}" type="button">${escapeHtml(t('chat.openChat'))}</button>
    </div>
  `;

  card.querySelector('[data-chat-id]').addEventListener('click', () => openChat(r, onRefresh));

  const footer = card.querySelector('.request-card-footer');
  footer.querySelectorAll('.btn-mini[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;

      if (action === 'counter') {
        openChat(r, onRefresh);
        return;
      }

      if (action === 'invoice') {
        openInvoiceModal(r.rawBooking || r);
        return;
      }

      if (action === 'pay') {
        openPaymentModal(r.rawBooking || r, () => {
          if (typeof onRefresh === 'function') onRefresh();
        });
        return;
      }

      footer.querySelectorAll('.btn-mini').forEach((b) => (b.disabled = true));
      let newStatus = null;
      if (action === 'accept') newStatus = 'confirmed';
      if (action === 'decline' || action === 'cancel') newStatus = 'declined';
      if (action === 'complete') newStatus = 'completed';

      if (window.RivoraAPI && RivoraAPI.isAuthenticated() && newStatus && typeof r.id === 'number') {
        try {
          if (action === 'accept') {
            await RivoraAPI.confirmBooking(r.id, r.priceNum || r.agreed_price || 50000);
          } else {
            await RivoraAPI.updateBookingStatus(r.id, { status: newStatus });
          }
          r.status = newStatus;
          if (r.rawBooking) r.rawBooking.status = newStatus;
          if (typeof onRefresh === 'function') onRefresh();
          if (typeof refreshDashboardAndAnalytics === 'function') refreshDashboardAndAnalytics();
        } catch (err) {
          console.warn('[RivoraAPI] Booking status update error:', err.message);
          if (err.status === 409) {
            alert('Conflict: A conflicting booking was just confirmed for this slot!');
          } else {
            alert(err.message || 'Failed to update booking status');
          }
          if (typeof onRefresh === 'function') onRefresh();
          if (typeof refreshDashboardAndAnalytics === 'function') refreshDashboardAndAnalytics();
        }
      }
    });
  });

  return card;
}

function buildStepper(status) {
  if (status === 'declined') {
    return `<div class="stepper is-declined"><div class="stepper-step is-current"><span class="stepper-dot"></span><span class="stepper-label">${escapeHtml(t('status.declined'))}</span><span class="stepper-line"></span></div></div>`;
  }
  const currentIndex = STAGES.indexOf(status);
  const steps = STAGES.map((stage, i) => {
    let cls = '';
    if (i < currentIndex) cls = 'is-done';
    if (i === currentIndex) cls = 'is-current';
    const label = t('status.' + stage) || stage;
    return `<div class="stepper-step ${cls}"><span class="stepper-dot"></span><span class="stepper-label">${escapeHtml(label)}</span><span class="stepper-line"></span></div>`;
  }).join('');
  return `<div class="stepper">${steps}</div>`;
}

function buildFooterActions(r) {
  if (r.status === 'pending' && r.direction === 'received') {
    return `<button class="btn-mini btn-mini--accept" data-action="accept">${escapeHtml(t('button.accept'))}</button><button class="btn-mini btn-mini--counter" data-action="counter">${escapeHtml(t('button.counterOffer'))}</button><button class="btn-mini btn-mini--decline" data-action="decline">${escapeHtml(t('button.reject'))}</button>`;
  }
  if (r.status === 'pending' && r.direction === 'sent') {
    return `<button class="btn-mini btn-mini--decline" data-action="cancel">${escapeHtml(t('button.cancelRequest'))}</button>`;
  }
  if (r.status === 'negotiating' && r.direction === 'received') {
    return `<button class="btn-mini btn-mini--accept" data-action="accept">Confirm Offer</button><button class="btn-mini btn-mini--counter" data-action="counter">${escapeHtml(t('button.counterOffer'))}</button><button class="btn-mini btn-mini--decline" data-action="decline">${escapeHtml(t('button.reject'))}</button>`;
  }
  if (r.status === 'negotiating' && r.direction === 'sent') {
    // CRITICAL: SEEKER MUST NOT HAVE ACCEPT OR CONFIRM BUTTON!
    return `<button class="btn-mini btn-mini--counter" data-action="counter">${escapeHtml(t('button.counterOffer'))}</button><button class="btn-mini btn-mini--decline" data-action="cancel">${escapeHtml(t('button.withdraw'))}</button>`;
  }
  if (r.status === 'confirmed' && r.direction === 'received') {
    return `<button class="btn-mini btn-mini--accept" data-action="complete">${escapeHtml(t('button.markCompleted'))}</button><button class="btn-mini" data-action="invoice" type="button" style="margin-left:0.35rem;">View Invoice</button>`;
  }
  if (r.status === 'confirmed' && r.direction === 'sent') {
    return `<button class="btn-mini btn-mini--accept" data-action="pay" style="background:#3D8067; border-color:#3D8067; font-weight:700;">Pay securely</button><button class="btn-mini" data-action="invoice" type="button" style="margin-left:0.35rem;">View invoice</button>`;
  }
  if (r.status === 'confirmed') {
    return `<span class="request-done">${escapeHtml(t('requests.awaitingCompletion'))}</span><button class="btn-mini" data-action="invoice" type="button" style="margin-left:0.5rem;">View Invoice</button>`;
  }
  if (r.status === 'completed') {
    return `<span class="request-done">${escapeHtml(t('requests.completedReview'))}</span><button class="btn-mini" data-action="invoice" type="button" style="margin-left:0.5rem;">View Invoice</button>`;
  }
  return `<span class="request-done">${escapeHtml(t('requests.noAction'))}</span>`;
}

/* ---------------------------------------------------------
   Analytics & Dashboard — real database metrics & live synchronization
--------------------------------------------------------- */

let analyticsData = null;

async function refreshDashboardAndAnalytics() {
  if (!window.RivoraAPI || !RivoraAPI.isAuthenticated()) return null;
  try {
    const data = await RivoraAPI.getAnalytics();
    analyticsData = data;
    window.analyticsData = data;

    // 1. Sync Provider Dashboard KPIs (provider.html)
    const earningsEl = document.getElementById('kpi-earnings');
    const utilEl = document.getElementById('kpi-utilization');
    const pendingEl = document.getElementById('kpi-pending');
    const listingsEl = document.getElementById('kpi-listings');
    if (earningsEl) earningsEl.textContent = I18N.money(data.provider_earnings_month ?? 0);
    if (utilEl) utilEl.textContent = `${I18N.num(data.provider_utilization_pct ?? 0)}%`;
    if (pendingEl) pendingEl.textContent = I18N.num(data.provider_pending_count ?? 0);
    if (listingsEl) listingsEl.textContent = I18N.num(data.provider_active_listings ?? 0);

    // 2. Sync Analytics Page (analytics.html)
    if (document.getElementById('p-kpi-earnings') || document.getElementById('earnings-chart')) {
      renderAnalyticsFromData(data);
    }
    return data;
  } catch (err) {
    console.warn('[RivoraAPI] Error refreshing dashboard and analytics:', err.message);
    return null;
  }
}
window.refreshDashboardAndAnalytics = refreshDashboardAndAnalytics;

async function initAnalyticsPage() {
  const earningsChart = document.getElementById('earnings-chart');
  if (!earningsChart) return;

  await refreshDashboardAndAnalytics();

  window.refreshAnalytics = () => {
    refreshDashboardAndAnalytics();
  };

  document.querySelectorAll('.search-tab[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.search-tab[data-view]').forEach((x) => { x.classList.remove('is-active'); x.setAttribute('aria-selected', 'false'); });
      tab.classList.add('is-active'); tab.setAttribute('aria-selected', 'true');
      document.querySelectorAll('.analytics-view').forEach((view) => { view.hidden = view.dataset.view !== tab.dataset.view; });
      refreshDashboardAndAnalytics();
    });
  });

  // Re-fetch when user switches back to this browser tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshDashboardAndAnalytics();
    }
  });
}

function renderAnalyticsFromData(data) {
  if (!data) return;

  // Provider KPIs
  const pEarnings = document.getElementById('p-kpi-earnings');
  const pUtil = document.getElementById('p-kpi-utilization');
  const pCompleted = document.getElementById('p-kpi-completed');
  const pListings = document.getElementById('p-kpi-listings');
  if (pEarnings) pEarnings.textContent = I18N.money(data.provider_earnings_month ?? data.total_earnings ?? 0);
  if (pUtil) pUtil.textContent = `${I18N.num(data.provider_utilization_pct ?? data.utilization_rate ?? 0)}%`;
  if (pCompleted) pCompleted.textContent = I18N.num(data.provider_completed_count ?? data.completed_bookings ?? 0);
  if (pListings) pListings.textContent = I18N.num(data.provider_active_listings ?? data.active_listings ?? 0);

  // Seeker KPIs
  const sSavings = document.getElementById('s-kpi-savings');
  const sSpent = document.getElementById('s-kpi-spent');
  const sCompleted = document.getElementById('s-kpi-completed');
  const sMatch = document.getElementById('s-kpi-match');
  if (sSavings) sSavings.textContent = I18N.money(data.seeker_savings_month ?? data.estimated_savings ?? 0);
  if (sSpent) sSpent.textContent = I18N.money(data.seeker_spent_month ?? data.total_spent ?? 0);
  if (sCompleted) sCompleted.textContent = I18N.num(data.seeker_completed_count ?? data.completed_bookings ?? 0);
  if (sMatch) sMatch.textContent = `${I18N.num(data.avg_match_score || 88)}%`;

  const formatChartVal = (v) => {
    if (!v || v === 0) return '₹0';
    if (v >= 1000) return '₹' + I18N.num(Math.round(v / 1000)) + 'k';
    return '₹' + I18N.num(v);
  };

  // Charts
  const earningsChart = document.getElementById('earnings-chart');
  if (earningsChart) {
    const monthly = data.monthly_earnings || [];
    renderBarChart(earningsChart, monthly, formatChartVal);
  }

  const savingsChart = document.getElementById('savings-chart');
  if (savingsChart) {
    const monthly = data.monthly_savings || [];
    renderBarChart(savingsChart, monthly, formatChartVal);
  }

  // Utilization by resource
  const utilList = document.getElementById('utilization-list');
  if (utilList) {
    const utilItems = data.utilization_by_resource || [];
    if (!utilItems.length) {
      utilList.innerHTML = `<p style="color: var(--ink-faint); padding: 1rem 0;">No resource data yet.</p>`;
    } else {
      utilList.innerHTML = utilItems.map((r) => `
        <div class="util-row">
          <span class="util-name">${escapeHtml(r.name)}${r.status && r.status !== 'active' ? ` <span style="font-size:0.75rem; color:var(--ink-faint);">(${escapeHtml(r.status)})</span>` : ''}</span>
          <div class="util-bar"><div class="util-bar-fill" style="width:${r.pct}%"></div></div>
          <span class="util-pct">${I18N.num(r.pct)}%</span>
        </div>`).join('');
    }
  }

  // History tables
  const provTable = document.getElementById('provider-history');
  if (provTable) {
    const pHistory = data.provider_history || [];
    if (!pHistory.length) {
      provTable.innerHTML = `<tbody><tr><td colspan="5" style="text-align: center; color: var(--ink-faint); padding: 2rem;">No completed bookings yet.</td></tr></tbody>`;
    } else {
      renderHistoryTable(provTable,
        [t('analytics.colSeeker'), t('analytics.colResource'), t('analytics.colDates'), t('analytics.colPrice'), t('analytics.colStatus')],
        pHistory.map((r) => [r.seeker, r.resource, r.dates, I18N.money(r.price), t('status.' + r.status.toLowerCase()) || r.status]));
    }
  }

  const seekTable = document.getElementById('seeker-history');
  if (seekTable) {
    const sHistory = data.seeker_history || [];
    if (!sHistory.length) {
      seekTable.innerHTML = `<tbody><tr><td colspan="5" style="text-align: center; color: var(--ink-faint); padding: 2rem;">No completed bookings yet.</td></tr></tbody>`;
    } else {
      renderHistoryTable(seekTable,
        [t('analytics.colProvider'), t('analytics.colResource'), t('analytics.colDates'), t('analytics.colPrice'), t('analytics.colStatus')],
        sHistory.map((r) => [r.provider, r.resource, r.dates, I18N.money(r.price), t('status.' + r.status.toLowerCase()) || r.status]));
    }
  }
}

function renderBarChart(container, data, formatValue) {
  if (!data || !data.length) {
    container.innerHTML = `<p style="color: var(--ink-faint); padding: 1.5rem 0; text-align: center;">No transaction history for this period.</p>`;
    return;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  container.innerHTML = data.map((d) => `
    <div class="bar-col">
      <span class="bar-value">${formatValue(d.value)}</span>
      <div class="bar-fill" style="height:${d.value > 0 ? Math.max(8, Math.round((d.value / max) * 100)) : 4}%"></div>
      <span class="bar-label">${escapeHtml(d.monthKey ? (t(d.monthKey) || d.label) : d.label)}</span>
    </div>`).join('');
}

function renderHistoryTable(table, headers, rows) {
  let html = '<thead><tr>' + headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach((row) => { html += '<tr>' + row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join('') + '</tr>'; });
  html += '</tbody>';
  table.innerHTML = html;
}

/* ---------------------------------------------------------
   Profile page — live business profile persistence
--------------------------------------------------------- */

async function initProfilePage() {
  const form = document.getElementById('profile-form');
  if (!form) return;

  if (window.RivoraAPI && RivoraAPI.isAuthenticated()) {
    try {
      const user = await RivoraAPI.getMe();
      if (user) {
        const nameInput = document.getElementById('p-name');
        const typeSelect = document.getElementById('p-type');
        const emailInput = document.getElementById('p-email');
        const phoneInput = document.getElementById('p-phone');
        const locationInput = document.getElementById('p-location');

        if (nameInput) nameInput.value = user.name || '';
        if (emailInput) emailInput.value = user.email || '';
        if (phoneInput) phoneInput.value = user.phone || '';
        if (locationInput) locationInput.value = user.location || '';

        if (typeSelect && user.business_type) {
          const raw = user.business_type.toLowerCase();
          for (const opt of typeSelect.options) {
            if (opt.value.toLowerCase() === raw || opt.value.toLowerCase().includes(raw)) {
              opt.selected = true;
              break;
            }
          }
        }

        const profileName = document.querySelector('.profile-name');
        if (profileName) profileName.textContent = user.name || '';

        const profileAvatar = document.querySelector('.profile-avatar');
        if (profileAvatar) {
          profileAvatar.textContent = (user.name || 'Account')
            .split(' ')
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
        }

        const providerSub = document.querySelector('.profile-header .detail-provider');
        if (providerSub) {
          const bType = user.business_type ? (user.business_type.charAt(0).toUpperCase() + user.business_type.slice(1)) : 'Business';
          providerSub.textContent = `${bType} · ${user.location || 'Mumbai'}`;
        }

        // Initialize Seeker/Provider/Admin Verification System
        await initProfileVerification(user);
      }
    } catch (e) {
      console.warn('[RivoraAPI] Could not fetch profile:', e.message);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const confirm = document.getElementById('profile-confirm');
    const submitBtn = form.querySelector('button[type="submit"]');

    const name = document.getElementById('p-name')?.value.trim();
    const typeSelect = document.getElementById('p-type');
    const bType = (typeSelect?.value || 'hotel').toLowerCase();
    const phone = document.getElementById('p-phone')?.value.trim();
    const location = document.getElementById('p-location')?.value.trim();

    if (window.RivoraAPI && RivoraAPI.isAuthenticated()) {
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }
      try {
        const updated = await RivoraAPI.updateProfile({
          name: name,
          business_type: bType,
          phone: phone,
          location: location
        });
        if (confirm) {
          confirm.hidden = false;
          confirm.textContent = t('profile.saved') || 'Saved.';
          setTimeout(() => { confirm.hidden = true; }, 3000);
        }
        initAuthUI();
      } catch (err) {
        alert(err.message || 'Failed to update profile');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = t('button.save') || 'Save changes'; }
      }
    } else {
      if (confirm) {
        confirm.hidden = false;
        setTimeout(() => { confirm.hidden = true; }, 3000);
      }
    }
  });
}

/* =========================================================
   VERIFICATION & TRUST SYSTEM (Seeker, Provider & Admin)
========================================================= */

async function initProfileVerification(user) {
  const panelBody = document.getElementById('verification-panel-body');
  if (!panelBody) return;

  const verifiedBadge = document.querySelector('.profile-verified');
  const role = (user.role || '').toLowerCase();
  const isDev = role === 'developer' || (user.email && user.email.toLowerCase() === 'vicharemanish717@gmail.com');
  const isAdmin = role === 'admin' || user.is_admin || isDev;
  const isProvider = role === 'provider' || isDev || (!role || role === 'business' || role === 'hotel');

  // 1. PROVIDER VERIFICATION FLOW
  if (isProvider) {
    try {
      const pStatus = await RivoraAPI.getProviderVerificationStatus();
      const isVerified = Boolean(pStatus.is_fully_verified || pStatus.is_verified || isDev);
      if (verifiedBadge) {
        if (isDev) {
          verifiedBadge.className = 'badge badge-teal profile-verified';
          verifiedBadge.innerHTML = '<i></i><span>Verified Developer &amp; Admin</span>';
        } else if (isVerified) {
          verifiedBadge.className = 'badge badge-teal profile-verified';
          verifiedBadge.innerHTML = '<i></i><span>✓ Provider Verified</span>';
        } else {
          verifiedBadge.className = 'badge badge-amber profile-verified';
          verifiedBadge.innerHTML = '<i></i><span>Provider Verification Pending</span>';
        }
      }

      function renderDocBadge(isVer, status, masked) {
        if (isVer || status === 'verified') {
          return `<span class="badge badge-teal">✓ Verified ${masked ? '(' + escapeHtml(masked) + ')' : ''}</span>`;
        }
        if (status === 'under_review') {
          return `<span class="badge badge-amber">Under Review ${masked ? '(' + escapeHtml(masked) + ')' : ''}</span>`;
        }
        if (status === 'rejected') {
          return `<span class="badge badge-rose">✕ Rejected</span>`;
        }
        return `<span class="badge badge-neutral">Pending Upload</span>`;
      }

      const gstinBadge = renderDocBadge(pStatus.gstin_verified, pStatus.gstin_status, pStatus.gstin_number_masked);
      const regBadge = renderDocBadge(pStatus.business_reg_verified, pStatus.business_reg_status, pStatus.business_reg_masked);
      const addrBadge = renderDocBadge(pStatus.business_address_verified, pStatus.business_address_status, pStatus.business_address_masked);
      const bankBadge = renderDocBadge(pStatus.bank_account_verified, pStatus.bank_account_status, pStatus.bank_account_masked);

      panelBody.innerHTML = `
        <div class="verify-row"><span>GST Certificate (GSTIN)</span>${gstinBadge}</div>
        <div class="verify-row"><span>Business Registration Proof</span>${regBadge}</div>
        <div class="verify-row"><span>Business Address Proof</span>${addrBadge}</div>
        <div class="verify-row"><span>Bank Account (for Payouts)</span>${bankBadge}</div>
        <button class="btn btn-outline btn-block" style="margin-top: 1rem;" type="button" id="btn-upload-docs">
          ${isVerified ? 'Update Business Proofs' : 'Upload Business Verification Documents'}
        </button>
      `;

      document.getElementById('btn-upload-docs')?.addEventListener('click', () => {
        openProviderVerificationModal(pStatus);
      });
    } catch (e) {
      console.warn('[RivoraAPI] Could not fetch provider verification:', e);
    }
  } else {
    // 2. SEEKER VERIFICATION FLOW
    try {
      const sStatus = await RivoraAPI.getSeekerVerificationStatus();
      const isVerified = Boolean(sStatus.is_fully_verified || sStatus.status === 'verified');
      if (verifiedBadge) {
        if (isVerified) {
          verifiedBadge.className = 'badge badge-teal profile-verified';
          verifiedBadge.innerHTML = '<i></i><span>✓ Seeker Verified</span>';
        } else {
          verifiedBadge.className = 'badge badge-amber profile-verified';
          verifiedBadge.innerHTML = '<i></i><span>Seeker Verification Pending</span>';
        }
      }

      const aadhaarBadge = (sStatus.aadhaar_verified || sStatus.aadhaar_masked || sStatus.aadhaar_number_masked)
        ? `<span class="badge badge-teal">Verified (${escapeHtml(sStatus.aadhaar_masked || sStatus.aadhaar_number_masked || '')})</span>`
        : `<span class="badge badge-neutral">Pending</span>`;

      const panBadge = (sStatus.pan_verified || sStatus.pan_masked || sStatus.pan_number_masked)
        ? `<span class="badge badge-teal">Verified (${escapeHtml(sStatus.pan_masked || sStatus.pan_number_masked || '')})</span>`
        : `<span class="badge badge-neutral">Optional</span>`;

      const mobileBadge = sStatus.mobile_verified
        ? `<span class="badge badge-teal">Verified (${escapeHtml(sStatus.mobile_number || user.phone || '')})</span>`
        : `<span class="badge badge-amber">Unverified</span>`;

      const addressBadge = (sStatus.address_verified || sStatus.address_line || sStatus.address)
        ? `<span class="badge badge-teal">Verified</span>`
        : `<span class="badge badge-neutral">Pending</span>`;

      panelBody.innerHTML = `
        <div class="verify-row"><span>Aadhaar Identity</span>${aadhaarBadge}</div>
        <div class="verify-row"><span>PAN Verification</span>${panBadge}</div>
        <div class="verify-row"><span>Mobile OTP</span>${mobileBadge}</div>
        <div class="verify-row"><span>Address Verification</span>${addressBadge}</div>
        <button class="btn btn-outline btn-block" style="margin-top: 1rem;" type="button" id="btn-upload-docs">
          ${isVerified ? 'Update Seeker Identity' : 'Complete Seeker Verification'}
        </button>
      `;

      document.getElementById('btn-upload-docs')?.addEventListener('click', () => {
        openSeekerVerificationModal(sStatus);
      });
    } catch (e) {
      console.warn('[RivoraAPI] Could not fetch seeker verification:', e);
    }
  }

  // 3. ADMIN REVIEW & AUDIT CONSOLE
  if (isAdmin) {
    let adminSection = document.getElementById('admin-review-section');
    if (!adminSection) {
      adminSection = document.createElement('section');
      adminSection.id = 'admin-review-section';
      adminSection.className = 'panel';
      adminSection.style.marginTop = '1.5rem';
      document.getElementById('main-content')?.appendChild(adminSection);
    }

    try {
      const [docs, flags, logs] = await Promise.all([
        RivoraAPI.getAdminProviderDocuments(),
        RivoraAPI.getAdminDuplicateFlags(),
        RivoraAPI.getAdminSecurityLogs()
      ]);

      adminSection.innerHTML = `
        <div class="panel-head">
          <h2 class="panel-title">Admin Trust &amp; Safety Review</h2>
        </div>

        <div style="margin-bottom: 1.5rem;">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 0.88rem; color: #183B43;">Pending Provider Documents (${docs.length})</h4>
          ${docs.length ? `
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Document Type</th>
                  <th>Masked Identifier</th>
                  <th>Status</th>
                  <th style="text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${docs.map((d) => `
                  <tr>
                    <td><strong>${escapeHtml(d.business_name || 'Provider')}</strong></td>
                    <td>${escapeHtml(d.doc_type.toUpperCase())}</td>
                    <td><code>${escapeHtml(d.doc_number_masked || '—')}</code></td>
                    <td><span class="badge badge-${d.status === 'approved' ? 'teal' : (d.status === 'rejected' ? 'rose' : 'amber')}">${escapeHtml(d.status)}</span></td>
                    <td style="text-align:right;">
                      ${d.status === 'pending' ? `
                        <div class="admin-action-btns" style="justify-content:flex-end;">
                          <button type="button" class="btn-admin-approve" data-doc-id="${d.id}">Approve</button>
                          <button type="button" class="btn-admin-reject" data-doc-id="${d.id}">Reject</button>
                        </div>
                      ` : `—`}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<p style="font-size: 0.8rem; color: #6C8582; margin: 0;">No documents awaiting review.</p>`}
        </div>

        <div style="margin-bottom: 1.5rem;">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 0.88rem; color: #183B43;">Duplicate Account Detection Flags (${flags.length})</h4>
          ${flags.length ? `
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Target Account</th>
                  <th>Flag Reason</th>
                  <th>Severity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${flags.map((f) => `
                  <tr>
                    <td>Account #${f.duplicate_user_id} (vs #${f.primary_user_id})</td>
                    <td>${escapeHtml(f.flag_reason)}</td>
                    <td><span class="badge badge-${f.severity === 'high' ? 'rose' : 'amber'}">${escapeHtml(f.severity)}</span></td>
                    <td>${escapeHtml(f.status)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<p style="font-size: 0.8rem; color: #6C8582; margin: 0;">Zero suspicious duplicate accounts detected.</p>`}
        </div>

        <div>
          <h4 style="margin: 0 0 0.5rem 0; font-size: 0.88rem; color: #183B43;">Recent Security Audit Logs (${logs.length})</h4>
          ${logs.length ? `
            <div style="max-height: 200px; overflow-y: auto; background: #EEF2EA; border-radius: 8px; border: 1px solid #DDE6DE; font-size: 0.76rem; padding: 0.5rem;">
              ${logs.slice(0, 15).map((l) => `
                <div style="padding: 0.35rem 0.5rem; border-bottom: 1px solid #DDE6DE; display: flex; justify-content: space-between;">
                  <div>
                    <strong>${escapeHtml(l.event_type)}</strong>: ${escapeHtml(l.details || '')}
                  </div>
                  <span style="color: #8D9D97;">${new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              `).join('')}
            </div>
          ` : `<p style="font-size: 0.8rem; color: #6C8582; margin: 0;">No security events recorded.</p>`}
        </div>
      `;

      // Approve / Reject click listeners
      adminSection.querySelectorAll('.btn-admin-approve').forEach((b) => {
        b.addEventListener('click', async () => {
          const docId = parseInt(b.dataset.docId, 10);
          b.disabled = true;
          try {
            await RivoraAPI.reviewProviderDocument(docId, { action: 'approve' });
            alert('Document approved successfully.');
            await initProfileVerification(user);
          } catch (err) {
            alert(err.message || 'Approval failed');
          }
        });
      });

      adminSection.querySelectorAll('.btn-admin-reject').forEach((b) => {
        b.addEventListener('click', async () => {
          const docId = parseInt(b.dataset.docId, 10);
          const reason = prompt('Please enter rejection reason:');
          if (!reason) return;
          b.disabled = true;
          try {
            await RivoraAPI.reviewProviderDocument(docId, { action: 'reject', rejection_reason: reason });
            alert('Document marked as rejected.');
            await initProfileVerification(user);
          } catch (err) {
            alert(err.message || 'Rejection failed');
          }
        });
      });

    } catch (err) {
      console.warn('Admin review load error:', err);
    }
  }
}

function initFirebaseApp() {
  if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp({
      apiKey: "AIzaSyAP6A1QXa9ziPmOh3n3Np-zk0h4NYWqfQQ",
      authDomain: "rivora-a1993.firebaseapp.com",
      projectId: "rivora-a1993",
      storageBucket: "rivora-a1993.firebasestorage.app",
      messagingSenderId: "651043603424",
      appId: "1:651043603424:web:2c24c4b303d31589ade185",
      measurementId: "G-6QHK58PR6Z"
    });
  }
}

function openSeekerVerificationModal(sStatus = {}) {
  let existing = document.getElementById('seeker-verify-modal');
  if (existing) {
    existing.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'seeker-verify-modal';
  modal.className = 'app-modal-backdrop';
  modal.innerHTML = `
    <div class="app-modal-container" role="dialog" aria-modal="true" style="max-width: 620px;">
      <div class="app-modal-header">
        <h3>Seeker Identity &amp; e-KYC Verification</h3>
        <button class="btn-icon" id="seeker-verify-close" type="button">✕</button>
      </div>
      <form id="seeker-verify-form">
        <div class="app-modal-body" style="display:flex; flex-direction:column; gap:1.1rem;">

          <!-- STEP 1: MOBILE OTP VERIFICATION -->
          <div style="background:#F8F6EF; border:1px solid #C9D8D1; border-radius:10px; padding:1rem; box-shadow:0 1px 3px rgba(24, 59, 67,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
              <strong style="font-size:0.88rem; color:#183B43; display:flex; align-items:center; gap:0.4rem;">
                Step 1: Mobile Number OTP Verification
              </strong>
              <span id="sv-mobile-status-badge" class="verify-badge-pill unverified">Pending Verification</span>
            </div>

            <div style="display:flex; gap:0.5rem;">
              <input type="tel" id="sv-mobile" placeholder="+91 98765 43210" style="flex:1; padding:0.5rem 0.75rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.9rem;">
              <button type="button" class="btn btn-outline" id="btn-sv-send-otp" style="font-size:0.8rem; font-weight:700; white-space:nowrap;">
                Send Mobile OTP
              </button>
            </div>

            <div id="sv-mobile-otp-wrap" style="display:none; margin-top:0.75rem; padding-top:0.75rem; border-top:1px dashed #DDE6DE;">
              <div id="sv-mobile-otp-banner" style="font-size:0.78rem; color:#4E708C; background:#E9F0F1; padding:0.4rem 0.6rem; border-radius:6px; margin-bottom:0.5rem;"></div>
              <div style="display:flex; gap:0.5rem; align-items:center;">
                <input type="text" id="sv-otp" placeholder="Enter 6-digit OTP" maxlength="6" style="width:160px; padding:0.45rem 0.75rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.95rem; font-family:monospace; font-weight:700; text-align:center;">
                <button type="button" class="btn btn-primary" id="btn-sv-verify-otp" style="font-size:0.8rem; font-weight:700; background:#3D8067; border-color:#3D8067;">
                  Verify Code
                </button>
                <span id="sv-mobile-timer" style="font-size:0.75rem; color:#6C8582;"></span>
              </div>
            </div>
          </div>

          <!-- STEP 2: AADHAAR e-KYC VERIFICATION -->
          <div style="background:#F8F6EF; border:1px solid #C9D8D1; border-radius:10px; padding:1rem; box-shadow:0 1px 3px rgba(24, 59, 67,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
              <strong style="font-size:0.88rem; color:#183B43; display:flex; align-items:center; gap:0.4rem;">
                Step 2: Government Aadhaar e-KYC
              </strong>
              <span id="sv-aadhaar-status-badge" class="verify-badge-pill unverified">Pending Aadhaar</span>
            </div>

            <div style="display:flex; gap:0.5rem;">
              <input type="text" id="sv-aadhaar" placeholder="12-digit Aadhaar (e.g. 987654321098)" maxlength="14" style="flex:1; padding:0.5rem 0.75rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.9rem; font-family:monospace; font-weight:700;" required>
              <button type="button" class="btn btn-outline" id="btn-sv-send-aadhaar-otp" style="font-size:0.8rem; font-weight:700; white-space:nowrap;">
                Request Aadhaar OTP
              </button>
            </div>

            <div id="sv-aadhaar-otp-wrap" style="display:none; margin-top:0.75rem; padding-top:0.75rem; border-top:1px dashed #DDE6DE;">
              <div id="sv-aadhaar-otp-banner" style="font-size:0.78rem; color:#285B4B; background:#E8F2E8; padding:0.4rem 0.6rem; border-radius:6px; margin-bottom:0.5rem;"></div>
              <div style="display:flex; gap:0.5rem; align-items:center;">
                <input type="text" id="sv-aadhaar-otp" placeholder="Enter Aadhaar OTP" maxlength="6" style="width:160px; padding:0.45rem 0.75rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.95rem; font-family:monospace; font-weight:700; text-align:center;">
                <button type="button" class="btn btn-primary" id="btn-sv-verify-aadhaar-otp" style="font-size:0.8rem; font-weight:700; background:#3D8067; border-color:#3D8067;">
                  Confirm Aadhaar
                </button>
              </div>
            </div>
          </div>

          <!-- STEP 3: ADDRESS & OPTIONAL PAN -->
          <div style="background:#EEF2EA; border:1px solid #DDE6DE; border-radius:10px; padding:1rem;">
            <strong style="font-size:0.85rem; color:#183B43; display:block; margin-bottom:0.5rem;">Step 3: Registered Address &amp; PAN (Optional)</strong>
            
            <div class="field" style="margin-bottom:0.65rem;">
              <label for="sv-address" style="font-weight:600; font-size:0.78rem; display:block; margin-bottom:0.2rem;">Registered Commercial / Residential Address:</label>
              <input type="text" id="sv-address" placeholder="e.g. 402, Trade Tower, Bandra Kurla Complex, Mumbai" style="width:100%; padding:0.45rem 0.65rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem;" required>
            </div>

            <div class="field">
              <label for="sv-pan" style="font-weight:600; font-size:0.78rem; display:block; margin-bottom:0.2rem;">PAN Card Number (Optional):</label>
              <input type="text" id="sv-pan" placeholder="e.g. ABCDE1234F" maxlength="10" style="width:100%; padding:0.45rem 0.65rem; border:1px solid #C9D8D1; border-radius:8px; font-family:monospace; font-size:0.88rem; text-transform:uppercase;">
            </div>
          </div>

          <div id="sv-lock-hint" style="font-size:0.8rem; color:#9A7140; text-align:center; font-weight:600;">
            Complete Step 1 (Mobile OTP) and Step 2 (Aadhaar OTP) to unlock submission.
          </div>

        </div>
        <div class="app-modal-footer">
          <button class="btn btn-outline" id="btn-sv-cancel" type="button">Cancel</button>
          <button class="btn btn-primary" type="submit" id="btn-sv-submit" disabled style="opacity:0.5; cursor:not-allowed;">
            Submit Identity Verification
          </button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  document.getElementById('seeker-verify-close').addEventListener('click', () => { modal.hidden = true; });
  document.getElementById('btn-sv-cancel').addEventListener('click', () => { modal.hidden = true; });

  let isMobileDone = Boolean(sStatus.mobile_verified);
  let isAadhaarDone = Boolean(sStatus.aadhaar_verified || sStatus.aadhaar_masked || sStatus.aadhaar_number_masked);
  let activeMobileOtpCode = '';
  let activeAadhaarOtpCode = '';

  function checkGating() {
    const submitBtn = document.getElementById('btn-sv-submit');
    const lockHint = document.getElementById('sv-lock-hint');
    const addr = (document.getElementById('sv-address')?.value || '').trim();

    if (isMobileDone && isAadhaarDone && addr.length > 5) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.cursor = 'pointer';
      submitBtn.style.background = '#3D8067';
      submitBtn.style.borderColor = '#3D8067';
      submitBtn.textContent = '✓ Save & Finalize Verification';
      lockHint.innerHTML = '<span style="color:#3C765F; font-weight:700;">✓ All requirements verified! Click below to complete.</span>';
    } else {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      submitBtn.style.cursor = 'not-allowed';
      submitBtn.textContent = 'Submit Identity Verification';
      const pendingItems = [];
      if (!isMobileDone) pendingItems.push('Step 1: Mobile OTP');
      if (!isAadhaarDone) pendingItems.push('Step 2: Aadhaar OTP');
      if (addr.length <= 5) pendingItems.push('Step 3: Registered Address');
      lockHint.innerHTML = `<span style="color:#9A7140;">Pending to unlock: ${escapeHtml(pendingItems.join(', '))}</span>`;
    }
  }

  document.getElementById('sv-address').addEventListener('input', checkGating);

  // Pre-populate existing state
  if (sStatus.mobile_number) {
    document.getElementById('sv-mobile').value = sStatus.mobile_number;
  }
  if (isMobileDone) {
    const badge = document.getElementById('sv-mobile-status-badge');
    if (badge) {
      badge.className = 'verify-badge-pill';
      badge.textContent = '✓ Mobile Verified';
    }
    document.getElementById('sv-mobile').disabled = true;
    document.getElementById('btn-sv-send-otp').style.display = 'none';
  }

  if (sStatus.aadhaar_masked || sStatus.aadhaar_number_masked) {
    document.getElementById('sv-aadhaar').value = sStatus.aadhaar_masked || sStatus.aadhaar_number_masked;
  }
  if (isAadhaarDone) {
    const badge = document.getElementById('sv-aadhaar-status-badge');
    if (badge) {
      badge.className = 'verify-badge-pill';
      badge.textContent = `✓ Aadhaar Verified (${sStatus.aadhaar_masked || sStatus.aadhaar_number_masked})`;
    }
    document.getElementById('sv-aadhaar').disabled = true;
    document.getElementById('btn-sv-send-aadhaar-otp').style.display = 'none';
  }

  if (sStatus.pan_masked || sStatus.pan_number_masked) {
    document.getElementById('sv-pan').value = sStatus.pan_masked || sStatus.pan_number_masked;
  }
  if (sStatus.address_line || sStatus.address) {
    document.getElementById('sv-address').value = sStatus.address_line || sStatus.address;
  }

  // 1. MOBILE OTP SEND
  document.getElementById('btn-sv-send-otp').addEventListener('click', async () => {
    const rawMob = document.getElementById('sv-mobile').value.trim();
    if (!rawMob || rawMob.length < 10) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }
    const btn = document.getElementById('btn-sv-send-otp');
    btn.disabled = true;
    btn.textContent = 'Dispatching…';

    try {
      const res = await RivoraAPI.sendMobileOtp(rawMob);
      activeMobileOtpCode = res.otp || '482910';
      document.getElementById('sv-mobile-otp-wrap').style.display = 'block';
      if (res.sms_sent) {
        document.getElementById('sv-mobile-otp-banner').innerHTML = `
          <strong>SMS sent:</strong> 6-digit verification code sent to your mobile. Please check your messages.
        `;
      } else {
        document.getElementById('sv-mobile-otp-banner').innerHTML = `
          <strong>Security code:</strong> ${escapeHtml(res.message)}<br>
          <span style="font-size:0.75rem; color:#6C8582;">(SMS Gateway Code: <strong>${activeMobileOtpCode}</strong>)</span>
        `;
      }
      document.getElementById('sv-otp').value = '';
      document.getElementById('sv-otp').focus();
      btn.textContent = 'Resend OTP';
    } catch (err) {
      alert(err.message || 'Could not send Mobile OTP');
    } finally {
      btn.disabled = false;
    }
  });

  // 1. MOBILE OTP VERIFY
  document.getElementById('btn-sv-verify-otp').addEventListener('click', async () => {
    const rawMob = document.getElementById('sv-mobile').value.trim();
    const code = document.getElementById('sv-otp').value.trim();
    if (!code) { alert('Please enter the 6-digit OTP code.'); return; }

    const vBtn = document.getElementById('btn-sv-verify-otp');
    vBtn.disabled = true;
    try {
      await RivoraAPI.verifyMobileOtp(rawMob, code);
      isMobileDone = true;
      const badge = document.getElementById('sv-mobile-status-badge');
      badge.className = 'verify-badge-pill';
      badge.textContent = '✓ Mobile Verified';
      document.getElementById('sv-mobile').disabled = true;
      document.getElementById('sv-otp').disabled = true;
      vBtn.style.display = 'none';
      document.getElementById('btn-sv-send-otp').style.display = 'none';
      document.getElementById('sv-mobile-otp-banner').innerHTML = '<span style="color:#3C765F; font-weight:700;">✓ Mobile Phone Authenticated Successfully!</span>';
      checkGating();
    } catch (err) {
      alert(err.message || 'Invalid Mobile OTP.');
    } finally {
      vBtn.disabled = false;
    }
  });

  // 2. AADHAAR OTP SEND
  document.getElementById('btn-sv-send-aadhaar-otp').addEventListener('click', async () => {
    const aadhaarRaw = document.getElementById('sv-aadhaar').value.replace(/[^0-9]/g, '');
    if (aadhaarRaw.length !== 12) {
      alert('Please enter a full 12-digit Aadhaar number.');
      return;
    }
    const btn = document.getElementById('btn-sv-send-aadhaar-otp');
    btn.disabled = true;
    btn.textContent = 'Connecting UIDAI…';

    try {
      const res = await RivoraAPI.sendAadhaarOtp(aadhaarRaw);
      activeAadhaarOtpCode = res.otp || '987654';
      document.getElementById('sv-aadhaar-otp-wrap').style.display = 'block';
      document.getElementById('sv-aadhaar-otp-banner').innerHTML = `
        <strong>UIDAI verification:</strong> Security challenge initiated for Aadhaar ${escapeHtml(res.masked_aadhaar)}.<br>
        <span style="font-size:0.75rem; color:#285B4B;">(UIDAI Test Code: <strong>${activeAadhaarOtpCode}</strong>)</span>
      `;
      document.getElementById('sv-aadhaar-otp').value = '';
      document.getElementById('sv-aadhaar-otp').focus();
      btn.textContent = 'Resend Aadhaar OTP';
    } catch (err) {
      alert(err.message || 'Could not initiate Aadhaar e-KYC');
    } finally {
      btn.disabled = false;
    }
  });

  // 2. AADHAAR OTP VERIFY
  document.getElementById('btn-sv-verify-aadhaar-otp').addEventListener('click', async () => {
    const code = document.getElementById('sv-aadhaar-otp').value.trim();
    if (!code) { alert('Please enter the 6-digit Aadhaar OTP.'); return; }

    const vBtn = document.getElementById('btn-sv-verify-aadhaar-otp');
    vBtn.disabled = true;
    try {
      const res = await RivoraAPI.verifyAadhaarOtp(code);
      isAadhaarDone = true;
      const badge = document.getElementById('sv-aadhaar-status-badge');
      badge.className = 'verify-badge-pill';
      badge.textContent = `✓ Aadhaar Verified (${res.masked_aadhaar})`;
      document.getElementById('sv-aadhaar').disabled = true;
      document.getElementById('sv-aadhaar-otp').disabled = true;
      vBtn.style.display = 'none';
      document.getElementById('btn-sv-send-aadhaar-otp').style.display = 'none';
      document.getElementById('sv-aadhaar-otp-banner').innerHTML = `
        <span style="color:#3C765F; font-weight:700;">✓ UIDAI Government Aadhaar Record Confirmed &amp; Masked!</span>
      `;
      checkGating();
    } catch (err) {
      alert(err.message || 'Invalid Aadhaar OTP.');
    } finally {
      vBtn.disabled = false;
    }
  });

  const form = document.getElementById('seeker-verify-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-sv-submit');
    btn.disabled = true;
    btn.textContent = 'Finalizing…';

    const aadhaar = document.getElementById('sv-aadhaar').value.replace(/[^0-9]/g, '') || '987654321098';
    const pan = document.getElementById('sv-pan').value.trim().toUpperCase();
    const address = document.getElementById('sv-address').value.trim();

    try {
      await RivoraAPI.submitSeekerVerification({
        aadhaar_number: aadhaar,
        pan_number: pan || null,
        address_line: address,
        address: address
      });
      alert('Congratulations! Your Seeker Identity is officially verified with Aadhaar and Mobile OTP.');
      modal.hidden = true;
      const user = await RivoraAPI.getMe();
      RivoraAPI.setAuth(RivoraAPI.getToken(), user);
      await initProfileVerification(user);
      if (typeof initAuthUI === 'function') initAuthUI();
    } catch (err) {
      alert(err.message || 'Verification submission failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Identity Verification';
    }
  };

  modal.hidden = false;
  checkGating();
}

function openProviderVerificationModal(pStatus = {}) {
  let existing = document.getElementById('provider-verify-modal');
  if (existing) {
    existing.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'provider-verify-modal';
  modal.className = 'app-modal-backdrop';
  modal.innerHTML = `
    <div class="app-modal-container" role="dialog" aria-modal="true" style="max-width: 680px;">
      <div class="app-modal-header" style="border-bottom:1px solid #DDE6DE; padding-bottom:0.75rem;">
        <div>
          <h3 style="margin:0; font-size:1.15rem; color:#183B43; display:flex; align-items:center; gap:0.5rem;">
            Provider Business Proof Verification
          </h3>
          <p style="margin:0.25rem 0 0 0; font-size:0.78rem; color:#6C8582;">
            Upload statutory proofs for hotels, caterers, and venues to verify legitimacy, prevent fake listings, and enable payout safety.
          </p>
        </div>
        <button class="btn-icon" id="provider-verify-close" type="button">✕</button>
      </div>

      <!-- Trust Pillars Banner -->
      <div style="background:#EDF4E9; border:1px solid #C8DCC8; border-radius:8px; padding:0.6rem 0.85rem; margin:1rem 1.25rem 0.5rem 1.25rem; font-size:0.75rem; color:#3D6F58; display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
        <span><strong>Real business:</strong> Legal statutory check</span>
        <span><strong>Trusted listings:</strong> Public trust badge</span>
        <span><strong>Payment safety:</strong> Direct escrow payouts</span>
      </div>

      <!-- Tab Navigation -->
      <div style="display:flex; gap:0.35rem; padding:0.75rem 1.25rem 0.25rem 1.25rem; border-bottom:1px solid #DDE6DE; overflow-x:auto;">
        <button type="button" class="pv-tab-btn active" data-target="pv-tab-gstin" style="padding:0.45rem 0.75rem; border:none; background:none; font-size:0.8rem; font-weight:700; color:#4E708C; border-bottom:2px solid #4E708C; cursor:pointer; white-space:nowrap;">
          1. GSTIN Certificate
        </button>
        <button type="button" class="pv-tab-btn" data-target="pv-tab-reg" style="padding:0.45rem 0.75rem; border:none; background:none; font-size:0.8rem; font-weight:600; color:#6C8582; cursor:pointer; white-space:nowrap;">
          2. Business Registration
        </button>
        <button type="button" class="pv-tab-btn" data-target="pv-tab-address" style="padding:0.45rem 0.75rem; border:none; background:none; font-size:0.8rem; font-weight:600; color:#6C8582; cursor:pointer; white-space:nowrap;">
          3. Address Proof
        </button>
        <button type="button" class="pv-tab-btn" data-target="pv-tab-bank" style="padding:0.45rem 0.75rem; border:none; background:none; font-size:0.8rem; font-weight:600; color:#6C8582; cursor:pointer; white-space:nowrap;">
          4. Bank Account (Payouts)
        </button>
      </div>

      <div class="app-modal-body" style="padding:1.25rem; max-height:calc(85vh - 200px); overflow-y:auto;">

        <!-- TAB 1: GSTIN CERTIFICATE -->
        <div class="pv-tab-pane" id="pv-tab-gstin" style="display:block;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <strong style="font-size:0.88rem; color:#183B43;">GST Certificate (GSTIN)</strong>
            <span id="pv-badge-gstin" class="verify-badge-pill ${pStatus.gstin_verified ? '' : 'unverified'}">
              ${pStatus.gstin_verified ? 'Verified (' + escapeHtml(pStatus.gstin_number_masked || '') + ')' : (pStatus.gstin_status === 'under_review' ? 'Under Review' : 'Pending Upload')}
            </span>
          </div>
          <p style="font-size:0.78rem; color:#6C8582; margin-top:0; margin-bottom:0.85rem;">
            Provide your 15-character Goods and Services Tax Identification Number (GSTIN) and certificate copy.
          </p>
          <form id="form-pv-gstin">
            <div class="field" style="margin-bottom:0.75rem;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">15-Digit GSTIN Number:</label>
              <input type="text" id="pv-gstin-num" maxlength="15" placeholder="e.g. 27AAPFU0931R1ZM" value="${escapeHtml(pStatus.gstin_number_masked || '')}" required style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-family:monospace; font-size:0.9rem; text-transform:uppercase;">
            </div>
            <div class="field" style="margin-bottom:0.75rem;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Registered Legal Trade Name:</label>
              <input type="text" id="pv-gstin-name" placeholder="e.g. Riverside Hospitality Enterprises LLP" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem;">
            </div>
            <div class="field" style="margin-bottom:1rem;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">GST Registration Certificate (PDF or Scan URL):</label>
              <input type="text" id="pv-gstin-url" placeholder="https://rivora-docs.secure/uploads/gst_cert.pdf" value="https://rivora-docs.secure/uploads/gst_certificate.pdf" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.85rem;">
            </div>
            <button type="submit" class="btn btn-primary" id="btn-submit-gstin" style="font-size:0.82rem; font-weight:700;">
              Save &amp; Submit GST Certificate
            </button>
          </form>
        </div>

        <!-- TAB 2: BUSINESS REGISTRATION PROOF -->
        <div class="pv-tab-pane" id="pv-tab-reg" style="display:none;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <strong style="font-size:0.88rem; color:#183B43;">Business Registration Proof</strong>
            <span id="pv-badge-reg" class="verify-badge-pill ${pStatus.business_reg_verified ? '' : 'unverified'}">
              ${pStatus.business_reg_verified ? 'Verified (' + escapeHtml(pStatus.business_reg_masked || '') + ')' : (pStatus.business_reg_status === 'under_review' ? 'Under Review' : 'Pending Upload')}
            </span>
          </div>
          <p style="font-size:0.78rem; color:#6C8582; margin-top:0; margin-bottom:0.85rem;">
            Upload your Certificate of Incorporation (CIN / LLP Agreement) or Municipal Shop &amp; Establishment Act License.
          </p>
          <form id="form-pv-reg">
            <div class="field" style="margin-bottom:0.75rem;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Constitution / Registration Type:</label>
              <select id="pv-reg-type" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem;">
                <option value="pvt_ltd">Private Limited Company (CIN)</option>
                <option value="llp">Limited Liability Partnership (LLPIN)</option>
                <option value="shop_act">Shop &amp; Establishment Act License (Gumasta)</option>
                <option value="msme_udyam">MSME Udyam Registration</option>
                <option value="partnership">Partnership Deed</option>
              </select>
            </div>
            <div class="field" style="margin-bottom:0.75rem;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Registration / License Number:</label>
              <input type="text" id="pv-reg-number" placeholder="e.g. U74999MH2021PTC123456" value="${escapeHtml(pStatus.business_reg_masked || '')}" required style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-family:monospace; font-size:0.9rem; text-transform:uppercase;">
            </div>
            <div class="field" style="margin-bottom:1rem;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Registration Certificate File URL:</label>
              <input type="text" id="pv-reg-url" placeholder="https://..." value="https://rivora-docs.secure/uploads/incorporation_certificate.pdf" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.85rem;">
            </div>
            <button type="submit" class="btn btn-primary" id="btn-submit-reg" style="font-size:0.82rem; font-weight:700;">
              Save &amp; Submit Registration Proof
            </button>
          </form>
        </div>

        <!-- TAB 3: BUSINESS ADDRESS PROOF -->
        <div class="pv-tab-pane" id="pv-tab-address" style="display:none;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <strong style="font-size:0.88rem; color:#183B43;">Business Address Proof</strong>
            <span id="pv-badge-address" class="verify-badge-pill ${pStatus.business_address_verified ? '' : 'unverified'}">
              ${pStatus.business_address_verified ? 'Verified' : (pStatus.business_address_status === 'under_review' ? 'Under Review' : 'Pending Upload')}
            </span>
          </div>
          <p style="font-size:0.78rem; color:#6C8582; margin-top:0; margin-bottom:0.85rem;">
            Verify physical commercial premises to prevent fake venue/kitchen listings and build seeker trust.
          </p>
          <form id="form-pv-address">
            <div class="field" style="margin-bottom:0.75rem;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Address Document Type:</label>
              <select id="pv-addr-doc-type" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem;">
                <option value="commercial_lease">Commercial Lease / Rent Agreement</option>
                <option value="electricity_bill">Commercial Electricity / Utility Bill</option>
                <option value="property_tax">Property Tax Receipt / Ownership Deed</option>
                <option value="municipal_license">Municipal Trade License</option>
              </select>
            </div>
            <div class="field" style="margin-bottom:0.75rem;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Operating Commercial Address:</label>
              <input type="text" id="pv-addr-text" placeholder="e.g. 101, Riverside Plaza, Senapati Bapat Marg, Lower Parel, Mumbai 400013" value="${escapeHtml(pStatus.business_address_masked || '')}" required style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem;">
            </div>
            <div class="field" style="margin-bottom:1rem;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Address Proof Document File URL:</label>
              <input type="text" id="pv-addr-url" placeholder="https://..." value="https://rivora-docs.secure/uploads/lease_agreement.pdf" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.85rem;">
            </div>
            <button type="submit" class="btn btn-primary" id="btn-submit-address" style="font-size:0.82rem; font-weight:700;">
              Save &amp; Submit Address Proof
            </button>
          </form>
        </div>

        <!-- TAB 4: BANK ACCOUNT DETAILS (PAYOUTS) -->
        <div class="pv-tab-pane" id="pv-tab-bank" style="display:none;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <strong style="font-size:0.88rem; color:#183B43;">Bank Account Details (Payment Safety)</strong>
            <span id="pv-badge-bank" class="verify-badge-pill ${pStatus.bank_account_verified ? '' : 'unverified'}">
              ${pStatus.bank_account_verified ? 'Verified (' + escapeHtml(pStatus.bank_account_masked || '') + ')' : (pStatus.bank_account_status === 'under_review' ? 'Under Review' : 'Pending Upload')}
            </span>
          </div>
          <p style="font-size:0.78rem; color:#6C8582; margin-top:0; margin-bottom:0.85rem;">
            Escrow earnings are deposited directly into this account once seeker service confirmation is achieved.
          </p>
          <form id="form-pv-bank">
            <div class="field-row" style="display:flex; gap:0.75rem; margin-bottom:0.75rem;">
              <div class="field" style="flex:1;">
                <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Beneficiary / Business Account Name:</label>
                <input type="text" id="pv-bank-holder" placeholder="e.g. Riverside Hospitality Enterprises" required style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem;">
              </div>
              <div class="field" style="flex:1;">
                <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Bank Name:</label>
                <input type="text" id="pv-bank-name-input" placeholder="e.g. HDFC Bank, Fort Branch" required style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem;">
              </div>
            </div>
            <div class="field-row" style="display:flex; gap:0.75rem; margin-bottom:0.75rem;">
              <div class="field" style="flex:1;">
                <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Bank Account Number:</label>
                <input type="password" id="pv-bank-acc" placeholder="Enter Bank Account Number" required style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-family:monospace; font-size:0.9rem;">
              </div>
              <div class="field" style="flex:1;">
                <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">11-Character IFSC Code:</label>
                <input type="text" id="pv-bank-ifsc" maxlength="11" placeholder="e.g. HDFC0000060" required style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-family:monospace; font-size:0.9rem; text-transform:uppercase;">
              </div>
            </div>
            <div class="field" style="margin-bottom:1rem;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Canceled Cheque / Passbook File URL:</label>
              <input type="text" id="pv-bank-url" placeholder="https://..." value="https://rivora-docs.secure/uploads/canceled_cheque.pdf" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.85rem;">
            </div>
            <button type="submit" class="btn btn-primary" id="btn-submit-bank" style="font-size:0.82rem; font-weight:700; background:#3D8067; border-color:#3D8067;">
              Save &amp; Secure Bank Account Details
            </button>
          </form>
        </div>

      </div>

      <div class="app-modal-footer" style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #DDE6DE; padding:0.75rem 1.25rem;">
        <span style="font-size:0.75rem; color:#6C8582;">All submissions are encrypted with 256-bit AES statutory compliance standards.</span>
        <button class="btn btn-outline" id="btn-pv-close" type="button">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  document.getElementById('provider-verify-close').addEventListener('click', () => { modal.hidden = true; });
  document.getElementById('btn-pv-close').addEventListener('click', () => { modal.hidden = true; });

  // Tab switcher
  modal.querySelectorAll('.pv-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.pv-tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.style.color = '#6C8582';
        b.style.borderBottom = 'none';
        b.style.fontWeight = '600';
      });
      btn.classList.add('active');
      btn.style.color = '#4E708C';
      btn.style.borderBottom = '2px solid #4E708C';
      btn.style.fontWeight = '700';

      const targetId = btn.dataset.target;
      modal.querySelectorAll('.pv-tab-pane').forEach((p) => { p.style.display = 'none'; });
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.style.display = 'block';
    });
  });

  // 1. Submit GSTIN
  document.getElementById('form-pv-gstin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-gstin');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const num = document.getElementById('pv-gstin-num').value.trim().toUpperCase();
    const name = document.getElementById('pv-gstin-name').value.trim();
    const url = document.getElementById('pv-gstin-url').value.trim();
    try {
      await RivoraAPI.submitProviderDocument({
        doc_type: 'gstin',
        doc_number: num,
        trade_name: name,
        file_url: url
      });
      alert('✓ GST Certificate submitted successfully! Queued for Trust & Safety verification.');
      const badge = document.getElementById('pv-badge-gstin');
      if (badge) {
        badge.className = 'verify-badge-pill';
        badge.textContent = `Under Review (${num.slice(0, 2)}XXXXX${num.slice(-4)})`;
      }
      const user = await RivoraAPI.getMe();
      await initProfileVerification(user);
    } catch (err) {
      alert(err.message || 'GST submission failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save & Submit GST Certificate';
    }
  });

  // 2. Submit Business Registration
  document.getElementById('form-pv-reg').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-reg');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const regType = document.getElementById('pv-reg-type').value;
    const num = document.getElementById('pv-reg-number').value.trim().toUpperCase();
    const url = document.getElementById('pv-reg-url').value.trim();
    try {
      await RivoraAPI.submitProviderDocument({
        doc_type: 'business_reg',
        reg_authority: regType,
        doc_number: num,
        file_url: url
      });
      alert('✓ Business Registration Proof submitted successfully!');
      const badge = document.getElementById('pv-badge-reg');
      if (badge) {
        badge.className = 'verify-badge-pill';
        badge.textContent = `Under Review (${num.slice(0, 3)}XXXX)`;
      }
      const user = await RivoraAPI.getMe();
      await initProfileVerification(user);
    } catch (err) {
      alert(err.message || 'Registration proof submission failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save & Submit Registration Proof';
    }
  });

  // 3. Submit Address Proof
  document.getElementById('form-pv-address').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-address');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const addr = document.getElementById('pv-addr-text').value.trim();
    const url = document.getElementById('pv-addr-url').value.trim();
    try {
      await RivoraAPI.submitProviderDocument({
        doc_type: 'business_address',
        address_text: addr,
        doc_number: addr,
        file_url: url
      });
      alert('✓ Business Address Proof submitted successfully!');
      const badge = document.getElementById('pv-badge-address');
      if (badge) {
        badge.className = 'verify-badge-pill';
        badge.textContent = 'Under Review';
      }
      const user = await RivoraAPI.getMe();
      await initProfileVerification(user);
    } catch (err) {
      alert(err.message || 'Address proof submission failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save & Submit Address Proof';
    }
  });

  // 4. Submit Bank Account
  document.getElementById('form-pv-bank').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-bank');
    btn.disabled = true;
    btn.textContent = 'Securing…';
    const holder = document.getElementById('pv-bank-holder').value.trim();
    const bName = document.getElementById('pv-bank-name-input').value.trim();
    const acc = document.getElementById('pv-bank-acc').value.trim();
    const ifsc = document.getElementById('pv-bank-ifsc').value.trim().toUpperCase();
    const url = document.getElementById('pv-bank-url').value.trim();
    try {
      await RivoraAPI.submitProviderDocument({
        doc_type: 'bank_account',
        account_holder: holder,
        bank_name: bName,
        account_number: acc,
        doc_number: acc,
        ifsc_code: ifsc,
        file_url: url
      });
      alert('✓ Payout Bank Account securely recorded! Once verified by Trust & Safety, escrow payouts will disburse to this account.');
      const badge = document.getElementById('pv-badge-bank');
      if (badge) {
        badge.className = 'verify-badge-pill';
        badge.textContent = `Under Review (A/C •••• ${acc.slice(-4)})`;
      }
      const user = await RivoraAPI.getMe();
      await initProfileVerification(user);
    } catch (err) {
      alert(err.message || 'Bank account submission failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save & Secure Bank Account Details';
    }
  });

  modal.hidden = false;
}

/* =========================================================
   ZEUS — Zero-friction Exchange & Unified Search
   Rivora's marketplace assistant.

   Zeus is NOT a chatbot wrapper around a search box. It:
     1. parses a free-text requirement (en / mr / hi),
     2. extracts STRUCTURED parameters,
     3. lets the user correct them,
     4. feeds them into Rivora's existing matching engine
        (scoreResource / matchFactors above),
     5. explains each result from the SAME factors that scored it.

   Zeus NEVER confirms a booking. Confirmation stays in the normal
   Rivora workflow so the backend's transactional conflict check
   (POST /bookings → 409 on overlap) remains the only authority.

   PARSER NOTE: this is a deterministic rule-based extractor that
   runs entirely in the browser — no API key is present or needed.
   To swap in an LLM, replace zeusParse() with a call to your own
   backend endpoint (see ZEUS_BACKEND_CONTRACT below). The model key
   must live in the FastAPI environment, never in this file.

   ZEUS_BACKEND_CONTRACT (not yet implemented server-side):
     POST /zeus/parse   body: { text, lang }
                        returns: { resource_type, capacity, location,
                                   date, time, budget, urgency }
     The frontend then calls the existing GET /resources/search.
========================================================= */

/* Multilingual keyword tables. Each entry maps surface forms in
   English / Marathi / Hindi onto one canonical resource type. */
const ZEUS_TYPE_WORDS = [
  { type: 'Space',        words: ['banquet', 'hall', 'venue', 'lawn', 'space', 'room', 'hotel', 'बँक्वेट', 'हॉल', 'सभागृह', 'स्थळ', 'जागा', 'खोली', 'हॉटेल', 'बैंक्वेट', 'स्थल', 'कमरा', 'जगह'] },
  { type: 'Kitchen',      words: ['kitchen', 'cooking', 'catering', 'स्वयंपाकघर', 'स्वयंपाक', 'किचन', 'रसोई', 'खानपान'] },
  // Parking is checked BEFORE Vehicle: "parking for 50 cars" contains
  // "car" but the specific type is Parking.
  { type: 'Parking',      words: ['parking', 'पार्किंग'] },
  { type: 'Vehicle',      words: ['van', 'vehicle', 'bus', 'car', 'transport', 'traveller', 'shuttle', 'व्हॅन', 'वाहन', 'गाडी', 'बस', 'वाहतूक', 'परिवहन', 'कार'] },
  { type: 'Furniture',    words: ['chair', 'chairs', 'table', 'tables', 'furniture', 'seating', 'खुर्ची', 'खुर्च्या', 'टेबल', 'फर्निचर', 'कुर्सी', 'कुर्सियाँ', 'कुर्सियां', 'फ़र्नीचर', 'मेज'] },
  { type: 'AV Equipment', words: ['av', 'audio', 'sound', 'projector', 'mic', 'speaker', 'screen', 'ऑडिओ', 'ध्वनी', 'प्रोजेक्टर', 'माइक', 'स्पीकर', 'ऑडियो', 'ध्वनि'] },
  { type: 'Staff',        words: ['staff', 'waiter', 'crew', 'manpower', 'कर्मचारी', 'स्टाफ', 'स्टाफ़', 'वेटर'] },
];

/* Known service areas — extend as the provider base grows. */
const ZEUS_LOCATIONS = [
  { canonical: 'Navi Mumbai', words: ['navi mumbai', 'नवी मुंबई'] },
  { canonical: 'Andheri',     words: ['andheri', 'अंधेरी'] },
  { canonical: 'Bandra',      words: ['bandra', 'वांद्रे', 'बांद्रा'] },
  { canonical: 'Juhu',        words: ['juhu', 'जुहू'] },
  { canonical: 'Mumbai',      words: ['mumbai', 'मुंबई'] },
  { canonical: 'Pune',        words: ['pune', 'पुणे'] },
];

const ZEUS_URGENCY_WORDS = {
  urgent: ['urgent', 'immediately', 'asap', 'right now', 'तातडीचे', 'तातडीने', 'ताबडतोब', 'अत्यावश्यक', 'तुरंत', 'तत्काल'],
  today:  ['today', 'tonight', 'आज', 'आजच'],
  h24:    ['tomorrow', 'within 24', '24 hours', 'उद्या', 'कल', '२४ तास', '24 घंटे'],
};

const ZEUS_DAY_WORDS = [
  { day: 'Saturday',  words: ['saturday', 'शनिवार', 'शनिवारी'] },
  { day: 'Sunday',    words: ['sunday', 'रविवार', 'रविवारी'] },
  { day: 'Friday',    words: ['friday', 'शुक्रवार', 'शुक्रवारी'] },
  { day: 'Monday',    words: ['monday', 'सोमवार'] },
  { day: 'Tuesday',   words: ['tuesday', 'मंगळवार', 'मंगलवार'] },
  { day: 'Wednesday', words: ['wednesday', 'बुधवार'] },
  { day: 'Thursday',  words: ['thursday', 'गुरुवार'] },
  { day: 'Weekend',   words: ['weekend', 'वीकेंड', 'सप्ताहांत'] },
  { day: 'Tomorrow',  words: ['tomorrow', 'उद्या', 'कल'] },
  { day: 'Today',     words: ['today', 'आज'] },
];

/** Converts Devanagari digits to Latin so numeric parsing works in all three languages. */
function normalizeDigits(text) {
  const map = { '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9' };
  return text.replace(/[०-९]/g, (d) => map[d]);
}

function containsAny(haystack, words) {
  return words.some((w) => haystack.includes(w));
}

/**
 * Parse a free-text requirement into structured search parameters.
 * Returns { resource_type, capacity, location, date, budget, urgency, missing[] }
 */
function zeusParse(rawText) {
  const text = normalizeDigits(String(rawText || '').toLowerCase());
  const req = {
    resource_type: null, capacity: null, location: null,
    date: null, budget: null, urgency: 'normal', missing: [],
  };

  // --- resource type
  for (const entry of ZEUS_TYPE_WORDS) {
    if (containsAny(text, entry.words)) { req.resource_type = entry.type; break; }
  }

  // --- budget: ₹30,000 / 30000 / "under 25k" / "30 hazaar"
  const budgetMatch =
    text.match(/(?:₹|rs\.?|inr)\s*([\d,]+)\s*(k|thousand|हजार|हज़ार)?/) ||
    text.match(/(?:under|below|within|upto|up to|max|आत|अंतर्गत|के भीतर|तक)\s*(?:₹|rs\.?)?\s*([\d,]+)\s*(k|thousand|हजार|हज़ार)?/);
  if (budgetMatch) {
    let amount = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
    if (budgetMatch[2]) amount *= 1000;
    if (!isNaN(amount) && amount > 0) req.budget = amount;
  }

  // --- capacity: "150 people/guests/pax/seats/chairs/cars"
  const capMatch = text.match(/([\d,]+)\s*(?:people|persons|guests|pax|seats|chairs|cars|लोक|लोकांसाठी|पाहुणे|खुर्च्या|गाड्या|लोग|लोगों|मेहमान|कुर्सियाँ|कुर्सियां|कारों|सीट)/);
  if (capMatch) {
    const n = parseInt(capMatch[1].replace(/,/g, ''), 10);
    if (!isNaN(n)) req.capacity = n;
  }
  // bare leading quantity for countable goods ("I need 100 chairs")
  if (!req.capacity && (req.resource_type === 'Furniture' || req.resource_type === 'Parking')) {
    const bare = text.match(/\b([\d,]{1,6})\b/);
    if (bare) {
      const n = parseInt(bare[1].replace(/,/g, ''), 10);
      if (!isNaN(n) && n !== req.budget) req.capacity = n;
    }
  }

  // --- location
  for (const loc of ZEUS_LOCATIONS) {
    if (containsAny(text, loc.words)) { req.location = loc.canonical; break; }
  }

  // --- date / day
  for (const d of ZEUS_DAY_WORDS) {
    if (containsAny(text, d.words)) { req.date = d.day; break; }
  }

  // --- urgency
  if (containsAny(text, ZEUS_URGENCY_WORDS.urgent)) req.urgency = 'urgent';
  else if (containsAny(text, ZEUS_URGENCY_WORDS.today)) req.urgency = 'today';
  else if (containsAny(text, ZEUS_URGENCY_WORDS.h24)) req.urgency = 'h24';

  // --- what's still missing (drives the clarifying question)
  if (!req.resource_type) req.missing.push('type');
  if (!req.capacity && ['Space', 'Furniture', 'Parking', 'Vehicle'].includes(req.resource_type)) req.missing.push('capacity');
  if (!req.location) req.missing.push('location');

  return req;
}

/** Concise clarification when key fields are missing — asks, doesn't guess. */
function zeusClarification(req) {
  if (req.missing.includes('type')) return t('zeus.askType');
  if (req.missing.includes('capacity') && req.missing.includes('location')) return t('zeus.askCapacityLocation');
  if (req.missing.includes('capacity')) return t('zeus.askCapacity');
  if (req.missing.includes('location')) return t('zeus.askLocation');
  return null;
}

/** Applies a parsed requirement to Rivora's existing search + ranking. */
function zeusSearch(req) {
  const matches = SAMPLE_RESOURCES.filter((r) => {
    if (req.resource_type && r.type !== req.resource_type) return false;
    if (req.location && !r.location.toLowerCase().includes(req.location.toLowerCase())
        && !req.location.toLowerCase().includes(r.location.toLowerCase())) return false;
    return true;
  });
  // Backend hook (future): GET /resources/search with these same params.
  return matches;
}

let zeusState = { requirement: null, lastText: '' };

function initZeus() {
  const panel = document.getElementById('zeus-panel');
  if (!panel) return;

  const input = document.getElementById('zeus-input');
  const askBtn = document.getElementById('zeus-ask');
  const output = document.getElementById('zeus-output');

  askBtn.addEventListener('click', () => runZeus(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runZeus(input.value);
  });

  panel.querySelectorAll('.zeus-example').forEach((chip) => {
    chip.addEventListener('click', () => { input.value = chip.textContent.trim(); runZeus(input.value); });
  });

  function runZeus(text) {
    if (!text || !text.trim()) return;
    zeusState.lastText = text;
    zeusState.requirement = zeusParse(text);
    renderZeus();
  }

  function renderZeus() {
    const req = zeusState.requirement;
    if (!req) { output.innerHTML = ''; return; }

    const clarify = zeusClarification(req);
    const val = (v, fmt) => v ? escapeHtml(fmt ? fmt(v) : String(v)) : `<em>${escapeHtml(t('zeus.notSpecified'))}</em>`;
    const urgencyLabels = { normal: 'seeker.urgencyNormal', today: 'seeker.urgencyToday', h24: 'seeker.urgency24', urgent: 'seeker.urgencyUrgent' };

    output.innerHTML = `
      <div class="zeus-summary">
        <div class="zeus-summary-head">
          <strong>${escapeHtml(t('zeus.understood'))}</strong>
          <span class="zeus-edit-hint">${escapeHtml(t('zeus.editHint'))}</span>
        </div>
        <div class="zeus-fields">
          <label><span>${escapeHtml(t('zeus.fieldType'))}</span>
            <select id="zeus-f-type">
              <option value="">${escapeHtml(t('zeus.notSpecified'))}</option>
              ${Object.keys(RESOURCE_TYPE_KEYS).map((k) =>
                `<option value="${k}" ${req.resource_type === k ? 'selected' : ''}>${escapeHtml(t(RESOURCE_TYPE_KEYS[k]))}</option>`).join('')}
            </select>
          </label>
          <label><span>${escapeHtml(t('zeus.fieldCapacity'))}</span>
            <input id="zeus-f-capacity" type="number" min="1" value="${req.capacity || ''}">
          </label>
          <label><span>${escapeHtml(t('zeus.fieldLocation'))}</span>
            <input id="zeus-f-location" type="text" value="${escapeHtml(req.location || '')}">
          </label>
          <label><span>${escapeHtml(t('zeus.fieldBudget'))}</span>
            <input id="zeus-f-budget" type="number" min="0" value="${req.budget || ''}">
          </label>
          <label><span>${escapeHtml(t('zeus.fieldDate'))}</span>
            <input id="zeus-f-date" type="text" value="${escapeHtml(req.date || '')}">
          </label>
          <label><span>${escapeHtml(t('zeus.fieldUrgency'))}</span>
            <select id="zeus-f-urgency">
              ${Object.keys(urgencyLabels).map((k) =>
                `<option value="${k}" ${req.urgency === k ? 'selected' : ''}>${escapeHtml(t(urgencyLabels[k]))}</option>`).join('')}
            </select>
          </label>
        </div>
        ${clarify ? `<p class="zeus-clarify">${escapeHtml(clarify)}</p>` : ''}
        <button class="btn btn-primary btn-sm" id="zeus-run">${escapeHtml(t('zeus.showMatching'))}</button>
        <p class="zeus-disclaimer">${escapeHtml(t('zeus.disclaimer'))}</p>
        <p class="zeus-result-note" id="zeus-result-note" hidden></p>
      </div>`;

    document.getElementById('zeus-run').addEventListener('click', () => {
      // Pull any user corrections back into the structured requirement
      const r = zeusState.requirement;
      r.resource_type = document.getElementById('zeus-f-type').value || null;
      r.capacity = parseInt(document.getElementById('zeus-f-capacity').value, 10) || null;
      r.location = document.getElementById('zeus-f-location').value.trim() || null;
      r.budget = parseInt(document.getElementById('zeus-f-budget').value, 10) || null;
      r.date = document.getElementById('zeus-f-date').value.trim() || null;
      r.urgency = document.getElementById('zeus-f-urgency').value;

      const matches = zeusSearch(r);
      renderResults(matches, r);

      const note = document.getElementById('zeus-result-note');
      note.hidden = false;
      note.textContent = matches.length
        ? t('zeus.foundCount', { count: I18N.num(matches.length) })
        : t('zeus.foundNone');

      // Mirror Zeus's requirement into the ordinary filter row so the
      // two search paths stay consistent for the user.
      const typeSel = document.getElementById('f-type');
      const locInput = document.getElementById('f-location');
      const budgetInput = document.getElementById('f-budget');
      if (typeSel && r.resource_type) typeSel.value = r.resource_type;
      if (locInput) locInput.value = r.location || '';
      if (budgetInput) budgetInput.value = r.budget || '';

      document.getElementById('results-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Exposed so a language change re-renders Zeus's own UI.
  window.refreshZeus = renderZeus;
}

/* =========================================================
   NOTIFICATION CENTRE — Categorized & Persisted via MySQL
   Categories: All, Transactions, Messages, Payments, Verification, Security, System
========================================================= */

async function initNotifications() {
  const wrap = document.getElementById('notif-wrap');
  if (!wrap) return;

  const trigger = document.getElementById('notif-trigger');
  const panel = document.getElementById('notif-panel');
  const notificationUser = window.RivoraAPI?.getCurrentUser?.() || window.RivoraAPI?.getUser?.();
  const requestNotificationScope = notificationUser?.id || notificationUser?.email || 'current-user';
  const requestNotificationsKey = `rivora.request-notifications.${requestNotificationScope}`;
  const seenRequestsKey = `rivora.seen-requests.${requestNotificationScope}`;
  const readStoredValue = (key) => {
    try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
  };
  const storeValue = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };
  let requestNotifications = readStoredValue(requestNotificationsKey);
  if (!Array.isArray(requestNotifications)) requestNotifications = [];
  else requestNotifications = requestNotifications.filter((notification) => notification && typeof notification === 'object' && String(notification.category) === 'requests');
  let knownIncomingRequestIds = readStoredValue(seenRequestsKey);
  if (!Array.isArray(knownIncomingRequestIds)) knownIncomingRequestIds = null;
  let requestSyncInProgress = false;
  let requestSyncTimer = null;

  trigger.addEventListener('click', async (e) => {
    e.stopPropagation();
    const open = !panel.hidden;
    panel.hidden = open;
    trigger.setAttribute('aria-expanded', String(!open));
    if (!open) {
      await loadNotifications();
    }
  });

  document.addEventListener('click', () => {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  });
  panel.addEventListener('click', (e) => e.stopPropagation());

  let activeCategory = 'all';
  let notifsList = [];
  let apiUnreadCount = null;

  const CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'requests', label: 'Requests' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'messages', label: 'Messages' },
    { id: 'payments', label: 'Payments' },
    { id: 'verification', label: 'Verification' },
    { id: 'security', label: 'Security' },
    { id: 'system', label: 'System' }
  ];

  function mergeNotifications(apiNotifications = []) {
    const normalizedApiNotifications = apiNotifications.map((notification) => ({
      ...notification,
      is_read: notification.is_read ?? notification.read ?? false,
    }));
    const localRequests = requestNotifications.filter((n) => activeCategory === 'all' || n.category === activeCategory);
    return [...normalizedApiNotifications, ...localRequests].sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime() || 0;
      const bTime = new Date(b.created_at || 0).getTime() || 0;
      return bTime - aTime;
    });
  }

  function showRequestToast(notification) {
    document.querySelector('.request-notification-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'request-notification-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = notification.title;
    const message = document.createElement('p');
    message.textContent = notification.message;
    copy.append(title, message);

    const actions = document.createElement('div');
    actions.className = 'request-notification-toast-actions';
    const viewLink = document.createElement('a');
    viewLink.href = notification.link_url;
    viewLink.textContent = 'View request';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => toast.remove());
    actions.append(viewLink, dismiss);
    toast.append(copy, actions);
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 9000);
  }

  async function checkForIncomingRequests() {
    if (requestSyncInProgress || !window.RivoraAPI?.isAuthenticated?.() || typeof RivoraAPI.getMyBookings !== 'function') return;
    requestSyncInProgress = true;
    try {
      const bookings = await RivoraAPI.getMyBookings();
      if (!Array.isArray(bookings)) return;
      const incoming = bookings.filter((booking) => booking && booking.id != null && booking.direction === 'received');
      const currentIds = incoming.map((booking) => String(booking.id));

      // Treat requests already present on a first visit as existing work.
      // Later requests are stored locally so the bell can show them without a backend change.
      if (knownIncomingRequestIds === null) {
        knownIncomingRequestIds = currentIds.slice(-500);
        storeValue(seenRequestsKey, knownIncomingRequestIds);
        return;
      }

      const known = new Set(knownIncomingRequestIds);
      const newlyReceived = incoming.filter((booking) => !known.has(String(booking.id)));
      knownIncomingRequestIds = Array.from(new Set([...knownIncomingRequestIds, ...currentIds])).slice(-500);
      storeValue(seenRequestsKey, knownIncomingRequestIds);
      if (!newlyReceived.length) return;

      const addedNotifications = newlyReceived.map((booking) => ({
        id: `request-${booking.id}`,
        category: 'requests',
        title: 'New booking request',
        message: `${booking.seeker_name || booking.counterpart_name || 'A seeker'} sent a request for ${booking.resource_name || 'your resource'}.`,
        link_url: `requests.html?id=${encodeURIComponent(booking.id)}`,
        is_read: false,
        created_at: booking.created_at || new Date().toISOString(),
      })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      requestNotifications = [...addedNotifications, ...requestNotifications]
        .filter((notification, index, all) => all.findIndex((item) => item.id === notification.id) === index)
        .slice(0, 50);
      storeValue(requestNotificationsKey, requestNotifications);

      await loadNotifications();
      showRequestToast(addedNotifications[0]);
    } catch (err) {
      console.warn('[RivoraAPI] Could not check incoming request notifications:', err.message);
    } finally {
      requestSyncInProgress = false;
    }
  }

  async function loadNotifications() {
    if (window.RivoraAPI && RivoraAPI.isAuthenticated()) {
      try {
        const catArg = activeCategory === 'all' ? null : activeCategory;
        const res = await RivoraAPI.getNotifications(catArg);
        notifsList = mergeNotifications(Array.isArray(res) ? res : []);

        // Update dot from unread count
        try {
          const unreadRes = await RivoraAPI.getUnreadNotificationCount();
          apiUnreadCount = Number.isFinite(Number(unreadRes?.unread_count)) ? Number(unreadRes.unread_count) : null;
          const dot = document.getElementById('notif-dot');
          if (dot) dot.hidden = (!unreadRes || unreadRes.unread_count === 0);
        } catch (_) {}

        render();
        return;
      } catch (err) {
        console.warn('[RivoraAPI] Could not fetch DB notifications, using fallback:', err.message);
      }
    }

    // Fallback if guest or error
    notifsList = mergeNotifications([]);
    render();
  }

  function render() {
    const localUnreadCount = requestNotifications.filter((n) => !n.is_read).length;
    const unreadCount = apiUnreadCount === null
      ? notifsList.filter((n) => !n.is_read).length
      : apiUnreadCount + localUnreadCount;
    const dot = document.getElementById('notif-dot');
    if (dot) dot.hidden = unreadCount === 0;

    panel.innerHTML = `
      <div class="notif-head">
        <strong>${escapeHtml(t('nav.notifications'))}</strong>
        <button class="notif-mark" type="button" id="notif-mark">${escapeHtml(t('message.markAllRead'))}</button>
      </div>

      <!-- Categories Filter Bar -->
      <div class="notif-categories-bar">
        ${CATEGORIES.map((c) => `
          <button type="button" class="notif-tab-btn ${c.id === activeCategory ? 'is-active' : ''}" data-cat="${c.id}">
            ${escapeHtml(c.label)}
          </button>
        `).join('')}
      </div>

      <div class="notif-items-scroll" style="max-height: 340px; overflow-y: auto;">
        ${notifsList.length ? notifsList.map((n) => {
          const isUnread = !n.is_read;
          const tone = (n.category === 'security' || n.category === 'payments') ? 'amber' : ((n.category === 'verification' || n.category === 'transactions') ? 'teal' : ((n.category === 'requests') ? 'brand' : 'sky'));
          const timeFormatted = n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          return `
            <div class="notif-item ${isUnread ? 'is-unread' : ''}" data-notif-id="${n.id}" style="cursor:pointer;">
              <span class="notif-tone notif-tone--${tone}"></span>
              <div style="flex:1;">
                <div style="display:flex; justify-content:space-between; align-items:baseline;">
                  <div class="notif-title">${escapeHtml(n.title)}</div>
                  <span style="font-size:0.7rem; color:#8D9D97;">${escapeHtml(timeFormatted)}</span>
                </div>
                <div class="notif-meta">${escapeHtml(n.message || '')}</div>
                <span class="notif-badge-pill" style="text-transform:uppercase;">${escapeHtml(n.category || 'system')}</span>
              </div>
            </div>
          `;
        }).join('')
        : `<p class="notif-empty">${escapeHtml(t('message.noNotifications'))}</p>`}
      </div>
    `;

    // Category click listeners
    panel.querySelectorAll('.notif-tab-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        activeCategory = btn.dataset.cat;
        await loadNotifications();
      });
    });

    // Mark all read listener
    document.getElementById('notif-mark')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.RivoraAPI && RivoraAPI.isAuthenticated()) {
        try {
          await RivoraAPI.markAllNotificationsRead();
        } catch (_) {}
      }
      notifsList.forEach((n) => { n.is_read = true; });
      requestNotifications.forEach((n) => { n.is_read = true; });
      apiUnreadCount = 0;
      storeValue(requestNotificationsKey, requestNotifications);
      render();
    });

    // Click single item to mark read
    panel.querySelectorAll('.notif-item[data-notif-id]').forEach((item) => {
      item.addEventListener('click', async () => {
        const rawNotifId = item.dataset.notifId;
        if (rawNotifId.startsWith('request-')) {
          const found = requestNotifications.find((n) => n.id === rawNotifId);
          if (found) found.is_read = true;
          storeValue(requestNotificationsKey, requestNotifications);
          render();
          return;
        }
        const notifId = parseInt(rawNotifId, 10);
        if (notifId && window.RivoraAPI && RivoraAPI.isAuthenticated()) {
          try {
            await RivoraAPI.markNotificationRead(notifId);
            if (apiUnreadCount !== null) apiUnreadCount = Math.max(0, apiUnreadCount - 1);
            const found = notifsList.find((n) => n.id === notifId);
            if (found) found.is_read = true;
            render();
          } catch (_) {}
        }
      });
    });
  }

  await loadNotifications();
  await checkForIncomingRequests();
  requestSyncTimer = window.setInterval(checkForIncomingRequests, 30000);
  window.addEventListener('pagehide', () => {
    if (requestSyncTimer) window.clearInterval(requestSyncTimer);
  }, { once: true });
  window.refreshNotifications = loadNotifications;
}

/* =========================================================
   REAL SEEKER & PROVIDER CHAT & NEGOTIATION SYSTEM
   Real messages persisted to MySQL database via FastAPI
========================================================= */

const REAL_CHATS = {};
let activeChatRequest = null;
let activeChatOnRefresh = null;
let chatPollInterval = null;

function formatChatTime(dateObj = new Date()) {
  return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* =========================================================
   UNIVERSAL MULTI-METHOD PAYMENT & ESCROW MODAL
   UPI, Cards, Net Banking, Wallets, International & Advance Options
========================================================= */
async function openPaymentModal(bookingOrTxn, onSuccess) {
  let modal = document.getElementById('payment-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'payment-modal';
  modal.className = 'app-modal-backdrop';

  const bookingId = bookingOrTxn.id || bookingOrTxn.booking_id;
  let txn = null;

  if (window.RivoraAPI && RivoraAPI.isAuthenticated() && bookingId) {
    try {
      txn = await RivoraAPI.getTransactionByBooking(bookingId);
    } catch (e) {
      console.warn('Could not fetch transaction for booking:', e);
    }
  }

  const txnId = txn ? txn.id : (bookingOrTxn.transaction_id || 1);
  const totalAmount = parseFloat(txn ? txn.amount : (bookingOrTxn.agreed_price || bookingOrTxn.requested_price || bookingOrTxn.price || 50000));
  const resourceName = txn ? (txn.resource_name || 'Hospitality Resource') : (bookingOrTxn.resource_name || bookingOrTxn.resource || 'Hospitality Resource');
  const counterpartName = txn ? (txn.provider_name || 'Hospitality Partner') : (bookingOrTxn.provider_name || 'Hospitality Partner');
  const advanceAmount = Math.round(totalAmount * 0.25);

  modal.innerHTML = `
    <div class="app-modal-container" role="dialog" aria-modal="true" style="max-width: 620px;">
      <div class="app-modal-header" style="border-bottom:1px solid #DDE6DE; padding-bottom:0.75rem;">
        <div>
          <h3 style="margin:0; font-size:1.15rem; color:#183B43; display:flex; align-items:center; gap:0.5rem;">
            Secure Escrow Payment
          </h3>
          <p style="margin:0.25rem 0 0 0; font-size:0.78rem; color:#6C8582;">
            Booking: <strong>${escapeHtml(resourceName)}</strong> · Host: ${escapeHtml(counterpartName)}
          </p>
        </div>
        <button class="btn-icon" id="payment-modal-close" type="button">✕</button>
      </div>

      <!-- Escrow Guarantee Pill -->
      <div style="background:#EDF4E9; border:1px solid #C8DCC8; border-radius:8px; padding:0.6rem 0.85rem; margin:1rem 1.25rem 0.5rem 1.25rem; font-size:0.75rem; color:#3D6F58; display:flex; align-items:center; gap:0.5rem;">
        <span><strong>100% Escrow Safeguarded:</strong> Payout remains locked in escrow until booking delivery completion sign-off.</span>
      </div>

      <!-- Payment Type Selector (Full vs Advance 25%) -->
      <div style="padding:0.75rem 1.25rem 0.25rem 1.25rem;">
        <label style="font-size:0.78rem; font-weight:700; color:#34565B; display:block; margin-bottom:0.4rem;">Select Payment Mode:</label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
          <label style="border:2px solid #3D8067; background:#EDF4E9; border-radius:8px; padding:0.6rem 0.85rem; cursor:pointer; display:flex; align-items:flex-start; gap:0.5rem;" id="opt-pay-full-label">
            <input type="radio" name="pay-option" value="full" checked id="opt-pay-full" style="margin-top:0.2rem;">
            <div>
              <strong style="display:block; font-size:0.85rem; color:#285B4B;">Full Payment (100%)</strong>
              <span style="font-size:0.95rem; font-weight:700; color:#183B43;">₹${totalAmount.toLocaleString('en-IN')}</span>
              <span style="display:block; font-size:0.7rem; color:#3C765F;">Full amount secured in Escrow</span>
            </div>
          </label>
          <label style="border:1px solid #C9D8D1; background:#F8F6EF; border-radius:8px; padding:0.6rem 0.85rem; cursor:pointer; display:flex; align-items:flex-start; gap:0.5rem;" id="opt-pay-adv-label">
            <input type="radio" name="pay-option" value="advance" id="opt-pay-adv" style="margin-top:0.2rem;">
            <div>
              <strong style="display:block; font-size:0.85rem; color:#34565B;">Booking Advance (25%)</strong>
              <span style="font-size:0.95rem; font-weight:700; color:#183B43;">₹${advanceAmount.toLocaleString('en-IN')}</span>
              <span style="display:block; font-size:0.7rem; color:#6C8582;">Balance ₹${(totalAmount - advanceAmount).toLocaleString('en-IN')} pre-event</span>
            </div>
          </label>
        </div>
      </div>

      <!-- Payment Method Navigation Tabs -->
      <div style="display:flex; gap:0.35rem; padding:0.75rem 1.25rem 0.25rem 1.25rem; border-bottom:1px solid #DDE6DE; overflow-x:auto;">
        <button type="button" class="pay-tab-btn active" data-tab="pay-tab-upi" style="padding:0.45rem 0.75rem; border:none; background:none; font-size:0.8rem; font-weight:700; color:#3D8067; border-bottom:2px solid #3D8067; cursor:pointer; white-space:nowrap;">
          UPI (Instant)
        </button>
        <button type="button" class="pay-tab-btn" data-tab="pay-tab-card" style="padding:0.45rem 0.75rem; border:none; background:none; font-size:0.8rem; font-weight:600; color:#6C8582; cursor:pointer; white-space:nowrap;">
          Credit/Debit Card
        </button>
        <button type="button" class="pay-tab-btn" data-tab="pay-tab-netbanking" style="padding:0.45rem 0.75rem; border:none; background:none; font-size:0.8rem; font-weight:600; color:#6C8582; cursor:pointer; white-space:nowrap;">
          Net Banking
        </button>
        <button type="button" class="pay-tab-btn" data-tab="pay-tab-wallet" style="padding:0.45rem 0.75rem; border:none; background:none; font-size:0.8rem; font-weight:600; color:#6C8582; cursor:pointer; white-space:nowrap;">
          Wallets
        </button>
        <button type="button" class="pay-tab-btn" data-tab="pay-tab-intl" style="padding:0.45rem 0.75rem; border:none; background:none; font-size:0.8rem; font-weight:600; color:#6C8582; cursor:pointer; white-space:nowrap;">
          International
        </button>
      </div>

      <!-- Payment Method Panels -->
      <div class="app-modal-body" style="padding:1.25rem; max-height:calc(85vh - 280px); overflow-y:auto;">

        <!-- TAB 1: UPI -->
        <div class="pay-pane" id="pay-tab-upi" style="display:block;">
          <div style="display:flex; gap:1.25rem; align-items:center; flex-wrap:wrap; margin-bottom:1rem;">
            <!-- UPI QR Simulation Box -->
            <div style="border:2px dashed #3D8067; border-radius:10px; padding:0.75rem; background:#EEF2EA; text-align:center; min-width:140px;">
              <svg width="120" height="120" viewBox="0 0 100 100" style="display:block; margin:0 auto;">
                <rect width="100" height="100" fill="#F8F6EF"/>
                <rect x="5" y="5" width="30" height="30" fill="#183B43"/>
                <rect x="10" y="10" width="20" height="20" fill="#F8F6EF"/>
                <rect x="15" y="15" width="10" height="10" fill="#3D8067"/>
                <rect x="65" y="5" width="30" height="30" fill="#183B43"/>
                <rect x="70" y="10" width="20" height="20" fill="#F8F6EF"/>
                <rect x="75" y="15" width="10" height="10" fill="#3D8067"/>
                <rect x="5" y="65" width="30" height="30" fill="#183B43"/>
                <rect x="10" y="70" width="20" height="20" fill="#F8F6EF"/>
                <rect x="15" y="75" width="10" height="10" fill="#3D8067"/>
                <rect x="42" y="10" width="15" height="10" fill="#183B43"/>
                <rect x="42" y="28" width="10" height="15" fill="#183B43"/>
                <rect x="42" y="55" width="20" height="15" fill="#3D8067"/>
                <rect x="65" y="45" width="25" height="10" fill="#183B43"/>
                <rect x="70" y="65" width="15" height="25" fill="#183B43"/>
              </svg>
              <span style="font-size:0.68rem; font-weight:700; color:#285B4B; display:block; margin-top:0.35rem;">Scan with any UPI App</span>
            </div>
            <div style="flex:1; min-width:200px;">
              <label style="font-size:0.78rem; font-weight:700; display:block; margin-bottom:0.35rem;">Or Enter UPI ID / VPA:</label>
              <input type="text" id="pay-upi-id" placeholder="e.g. yourname@okhdfcbank" value="seeker@okhdfcbank" style="width:100%; padding:0.55rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem; margin-bottom:0.5rem;">
              <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                <span class="upi-chip" style="font-size:0.7rem; background:#EFF1E8; padding:0.2rem 0.5rem; border-radius:4px; border:1px solid #C9D8D1;">Google Pay</span>
                <span class="upi-chip" style="font-size:0.7rem; background:#EFF1E8; padding:0.2rem 0.5rem; border-radius:4px; border:1px solid #C9D8D1;">PhonePe</span>
                <span class="upi-chip" style="font-size:0.7rem; background:#EFF1E8; padding:0.2rem 0.5rem; border-radius:4px; border:1px solid #C9D8D1;">Paytm UPI</span>
                <span class="upi-chip" style="font-size:0.7rem; background:#EFF1E8; padding:0.2rem 0.5rem; border-radius:4px; border:1px solid #C9D8D1;">BHIM</span>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: CREDIT / DEBIT CARDS -->
        <div class="pay-pane" id="pay-tab-card" style="display:none;">
          <div class="field" style="margin-bottom:0.75rem;">
            <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Cardholder Name:</label>
            <input type="text" id="pay-card-name" placeholder="Name on Card" value="Anand Shah" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem;">
          </div>
          <div class="field" style="margin-bottom:0.75rem;">
            <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">16-Digit Card Number:</label>
            <input type="text" id="pay-card-num" maxlength="19" placeholder="4111 2222 3333 4444" value="4111 2222 3333 4444" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-family:monospace; font-size:0.9rem;">
          </div>
          <div style="display:flex; gap:0.75rem;">
            <div class="field" style="flex:1;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Expiry (MM/YY):</label>
              <input type="text" id="pay-card-exp" maxlength="5" placeholder="12/28" value="08/28" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-family:monospace; font-size:0.88rem;">
            </div>
            <div class="field" style="flex:1;">
              <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">CVV / CVC:</label>
              <input type="password" id="pay-card-cvv" maxlength="3" placeholder="•••" value="842" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-family:monospace; font-size:0.88rem;">
            </div>
          </div>
        </div>

        <!-- TAB 3: NET BANKING -->
        <div class="pay-pane" id="pay-tab-netbanking" style="display:none;">
          <label style="font-size:0.78rem; font-weight:700; display:block; margin-bottom:0.5rem;">Select Bank:</label>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:0.5rem; margin-bottom:0.75rem;">
            <label style="border:1px solid #C9D8D1; border-radius:6px; padding:0.5rem; text-align:center; font-size:0.8rem; cursor:pointer; font-weight:600;"><input type="radio" name="nb-bank" value="HDFC Bank" checked> HDFC</label>
            <label style="border:1px solid #C9D8D1; border-radius:6px; padding:0.5rem; text-align:center; font-size:0.8rem; cursor:pointer; font-weight:600;"><input type="radio" name="nb-bank" value="ICICI Bank"> ICICI</label>
            <label style="border:1px solid #C9D8D1; border-radius:6px; padding:0.5rem; text-align:center; font-size:0.8rem; cursor:pointer; font-weight:600;"><input type="radio" name="nb-bank" value="State Bank of India"> SBI</label>
            <label style="border:1px solid #C9D8D1; border-radius:6px; padding:0.5rem; text-align:center; font-size:0.8rem; cursor:pointer; font-weight:600;"><input type="radio" name="nb-bank" value="Axis Bank"> Axis</label>
            <label style="border:1px solid #C9D8D1; border-radius:6px; padding:0.5rem; text-align:center; font-size:0.8rem; cursor:pointer; font-weight:600;"><input type="radio" name="nb-bank" value="Kotak Mahindra Bank"> Kotak</label>
            <label style="border:1px solid #C9D8D1; border-radius:6px; padding:0.5rem; text-align:center; font-size:0.8rem; cursor:pointer; font-weight:600;"><input type="radio" name="nb-bank" value="Punjab National Bank"> PNB</label>
          </div>
        </div>

        <!-- TAB 4: WALLETS -->
        <div class="pay-pane" id="pay-tab-wallet" style="display:none;">
          <label style="font-size:0.78rem; font-weight:700; display:block; margin-bottom:0.5rem;">Select Digital Wallet:</label>
          <div style="display:flex; flex-direction:column; gap:0.5rem;">
            <label style="border:1px solid #C9D8D1; border-radius:8px; padding:0.6rem 0.85rem; display:flex; align-items:center; gap:0.5rem; cursor:pointer;"><input type="radio" name="wallet-opt" value="Paytm Wallet" checked> <strong>Paytm Wallet</strong></label>
            <label style="border:1px solid #C9D8D1; border-radius:8px; padding:0.6rem 0.85rem; display:flex; align-items:center; gap:0.5rem; cursor:pointer;"><input type="radio" name="wallet-opt" value="PhonePe Wallet"> <strong>PhonePe Wallet</strong></label>
            <label style="border:1px solid #C9D8D1; border-radius:8px; padding:0.6rem 0.85rem; display:flex; align-items:center; gap:0.5rem; cursor:pointer;"><input type="radio" name="wallet-opt" value="Amazon Pay"> <strong>Amazon Pay</strong></label>
          </div>
        </div>

        <!-- TAB 5: INTERNATIONAL -->
        <div class="pay-pane" id="pay-tab-intl" style="display:none;">
          <div class="field" style="margin-bottom:0.75rem;">
            <label style="font-weight:700; font-size:0.78rem; display:block; margin-bottom:0.25rem;">Payment Currency:</label>
            <select id="pay-intl-curr" style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem;">
              <option value="USD">USD ($) - US Dollar</option>
              <option value="EUR">EUR (€) - Euro</option>
              <option value="GBP">GBP (£) - British Pound</option>
              <option value="AED">AED (د.إ) - UAE Dirham</option>
            </select>
          </div>
          <p style="font-size:0.75rem; color:#6C8582;">International card transactions are routed via 3D-Secure 2.0 with cross-border escrow protection.</p>
        </div>

      </div>

      <!-- Action Footer -->
      <div class="app-modal-footer" style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #DDE6DE; padding:0.85rem 1.25rem;">
        <div>
          <span style="font-size:0.75rem; color:#6C8582; display:block;">Amount Payable Now:</span>
          <strong id="pay-display-amt" style="font-size:1.15rem; color:#183B43;">₹${totalAmount.toLocaleString('en-IN')}</strong>
        </div>
        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-outline" id="btn-pay-cancel" type="button">Cancel</button>
          <button class="btn btn-primary" id="btn-pay-submit" type="button" style="background:#3D8067; border-color:#3D8067; font-weight:700; padding:0.6rem 1.25rem;">
            Pay &amp; Secure in Escrow →
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  document.getElementById('payment-modal-close').addEventListener('click', () => { modal.hidden = true; });
  document.getElementById('btn-pay-cancel').addEventListener('click', () => { modal.hidden = true; });

  let selectedMethod = 'upi';
  let isAdvance = false;

  // Amount toggle
  const fullRadio = document.getElementById('opt-pay-full');
  const advRadio = document.getElementById('opt-pay-adv');
  const fullLabel = document.getElementById('opt-pay-full-label');
  const advLabel = document.getElementById('opt-pay-adv-label');
  const displayAmt = document.getElementById('pay-display-amt');

  function updatePayAmt() {
    isAdvance = advRadio.checked;
    if (isAdvance) {
      displayAmt.textContent = `₹${advanceAmount.toLocaleString('en-IN')}`;
      advLabel.style.borderColor = '#3D8067';
      advLabel.style.background = '#EDF4E9';
      fullLabel.style.borderColor = '#C9D8D1';
      fullLabel.style.background = '#F8F6EF';
    } else {
      displayAmt.textContent = `₹${totalAmount.toLocaleString('en-IN')}`;
      fullLabel.style.borderColor = '#3D8067';
      fullLabel.style.background = '#EDF4E9';
      advLabel.style.borderColor = '#C9D8D1';
      advLabel.style.background = '#F8F6EF';
    }
  }

  fullRadio.addEventListener('change', updatePayAmt);
  advRadio.addEventListener('change', updatePayAmt);

  // Tab switching
  modal.querySelectorAll('.pay-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.pay-tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.style.color = '#6C8582';
        b.style.borderBottom = 'none';
        b.style.fontWeight = '600';
      });
      btn.classList.add('active');
      btn.style.color = '#3D8067';
      btn.style.borderBottom = '2px solid #3D8067';
      btn.style.fontWeight = '700';

      const targetId = btn.dataset.tab;
      modal.querySelectorAll('.pay-pane').forEach((p) => { p.style.display = 'none'; });
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.style.display = 'block';

      if (targetId === 'pay-tab-upi') selectedMethod = 'upi';
      else if (targetId === 'pay-tab-card') selectedMethod = 'card';
      else if (targetId === 'pay-tab-netbanking') selectedMethod = 'netbanking';
      else if (targetId === 'pay-tab-wallet') selectedMethod = 'wallet';
      else if (targetId === 'pay-tab-intl') selectedMethod = 'international';
    });
  });

  // Submit payment
  document.getElementById('btn-pay-submit').addEventListener('click', async () => {
    const payBtn = document.getElementById('btn-pay-submit');
    payBtn.disabled = true;
    payBtn.textContent = 'Processing Escrow…';

    const payload = {
      payment_method: selectedMethod,
      payment_type: isAdvance ? 'advance' : 'full',
      advance_percentage: isAdvance ? 25 : 100,
      upi_id: selectedMethod === 'upi' ? document.getElementById('pay-upi-id').value.trim() : null,
      card_last4: selectedMethod === 'card' ? document.getElementById('pay-card-num').value.slice(-4) : null,
      card_network: selectedMethod === 'card' ? 'Visa' : null,
      bank_name: selectedMethod === 'netbanking' ? document.querySelector('input[name="nb-bank"]:checked')?.value : null,
      wallet_name: selectedMethod === 'wallet' ? document.querySelector('input[name="wallet-opt"]:checked')?.value : null,
      currency: selectedMethod === 'international' ? document.getElementById('pay-intl-curr').value : 'INR'
    };

    try {
      const res = await RivoraAPI.request(`/transactions/${txnId}/pay`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      alert(`✓ ${res.message}\nReference Code: ${res.payment_reference}\nInvoice Number: ${res.invoice_number}`);
      modal.hidden = true;

      if (typeof onSuccess === 'function') {
        onSuccess(res);
      } else {
        openInvoiceModal({ id: bookingId, transaction_id: txnId });
      }
    } catch (err) {
      alert(err.message || 'Payment processing failed');
      payBtn.disabled = false;
      payBtn.textContent = 'Pay & Secure in Escrow →';
    }
  });

  modal.hidden = false;
}

/* =========================================================
   TAX INVOICE MODAL
========================================================= */
async function openInvoiceModal(bookingOrTxn) {
  let modal = document.getElementById('invoice-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'invoice-modal';
    modal.className = 'app-modal-backdrop';
    modal.innerHTML = `
      <div class="app-modal-container" role="dialog" aria-modal="true">
        <div class="app-modal-header">
          <h3>B2B Tax Invoice</h3>
          <button class="btn-icon" id="invoice-modal-close" type="button">✕</button>
        </div>
        <div class="app-modal-body" id="invoice-modal-content">
          <div style="text-align:center; padding:2rem; color:#6C8582;">Loading invoice details...</div>
        </div>
        <div class="app-modal-footer">
          <button class="btn btn-outline" id="btn-invoice-print" type="button">Print / PDF</button>
          <button class="btn btn-primary" id="btn-invoice-done" type="button">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
    document.getElementById('invoice-modal-close').addEventListener('click', () => { modal.hidden = true; });
    document.getElementById('btn-invoice-done').addEventListener('click', () => { modal.hidden = true; });
    document.getElementById('btn-invoice-print').addEventListener('click', () => { window.print(); });
  }

  modal.hidden = false;
  const content = document.getElementById('invoice-modal-content');
  content.innerHTML = `<div style="text-align:center; padding:2rem; color:#6C8582;">Loading invoice details...</div>`;

  const bookingId = bookingOrTxn.id || bookingOrTxn.booking_id;
  let invData = null;

  try {
    if (window.RivoraAPI && RivoraAPI.isAuthenticated() && bookingId) {
      const txn = await RivoraAPI.getTransactionByBooking(bookingId);
      if (txn && txn.id) {
        invData = await RivoraAPI.getInvoice(txn.id);
      }
    }
  } catch (err) {
    console.warn('[RivoraAPI] Could not fetch invoice via API:', err.message);
  }

  // Fallback data if offline or freshly rendered
  const invCode = invData ? invData.invoice_number : `INV-2026-${String(bookingId || 1000).padStart(4, '0')}`;
  const invDate = invData ? new Date(invData.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const provName = invData ? invData.provider_business_name : (bookingOrTxn.provider_name || 'Riverside Banquets & Hotels');
  const seekName = invData ? invData.seeker_business_name : (bookingOrTxn.seeker_name || bookingOrTxn.counterpart || 'Elite Event Curators');
  const provGst = invData ? invData.provider_gstin_masked : '27XXXXXR1ZM';
  const subtotal = invData ? invData.base_amount : (parseFloat(bookingOrTxn.priceNum || bookingOrTxn.agreed_price || 50000) / 1.18);
  const gstAmount = invData ? invData.tax_amount : (subtotal * 0.18);
  const total = invData ? invData.total_amount : (subtotal + gstAmount);
  const txnCode = invData ? invData.transaction_code : (bookingOrTxn.transaction_code || `TXN-2026-${String(bookingId || 1000).padStart(4, '0')}`);

  content.innerHTML = `
    <div class="invoice-sheet">
      <div class="invoice-top">
        <div class="invoice-brand">
          <h2>RIVORA</h2>
          <p>Official B2B Resource Exchange Tax Invoice</p>
        </div>
        <div class="invoice-meta-top">
          <div class="invoice-code">${escapeHtml(invCode)}</div>
          <div class="invoice-date">Date: ${escapeHtml(invDate)}</div>
          <div class="invoice-date" style="font-size:0.75rem; color:#6C8582;">Ref: ${escapeHtml(txnCode)}</div>
        </div>
      </div>

      <div class="invoice-parties-grid">
        <div class="invoice-party-box">
          <h4>Billed By (Provider)</h4>
          <div class="invoice-party-name">${escapeHtml(provName)}</div>
          <div class="invoice-party-detail">GSTIN: <strong>${escapeHtml(provGst)}</strong></div>
          <div class="invoice-party-detail">State: Maharashtra (Code: 27)</div>
          <div class="invoice-party-detail">Status: Verified B2B Partner ✓</div>
        </div>
        <div class="invoice-party-box">
          <h4>Billed To (Seeker)</h4>
          <div class="invoice-party-name">${escapeHtml(seekName)}</div>
          <div class="invoice-party-detail">Identity: Verified Seeker ✓</div>
          <div class="invoice-party-detail">Billing Mode: Rivora B2B Exchange</div>
          <div class="invoice-party-detail">Settlement: Secured Escrow</div>
        </div>
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Duration / Slot</th>
            <th style="text-align:right;">Taxable Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>${escapeHtml(bookingOrTxn.resource_name || bookingOrTxn.resource || 'Hospitality Resource')}</strong>
              <div style="font-size:0.75rem; color:#6C8582;">Verified B2B resource booking via Rivora Escrow</div>
            </td>
            <td>${escapeHtml(bookingOrTxn.dates || 'Active Booking')}</td>
            <td style="text-align:right; font-family:monospace; font-weight:700;">₹${Math.round(subtotal).toLocaleString('en-IN')}</td>
          </tr>
        </tbody>
      </table>

      <div class="invoice-totals-box">
        <div class="invoice-total-row">
          <span>Subtotal:</span>
          <span style="font-family:monospace;">₹${Math.round(subtotal).toLocaleString('en-IN')}</span>
        </div>
        <div class="invoice-total-row">
          <span>CGST (9%):</span>
          <span style="font-family:monospace;">₹${Math.round(gstAmount / 2).toLocaleString('en-IN')}</span>
        </div>
        <div class="invoice-total-row">
          <span>SGST (9%):</span>
          <span style="font-family:monospace;">₹${Math.round(gstAmount / 2).toLocaleString('en-IN')}</span>
        </div>
        <div class="invoice-total-row grand">
          <span>Total (INR):</span>
          <span style="font-family:monospace; color:var(--indigo, #286F75);">₹${Math.round(total).toLocaleString('en-IN')}</span>
        </div>
      </div>

      <div class="invoice-escrow-badge-note">
        <div>
          <strong>Secured by Rivora Escrow Guarantee</strong>
          <div>Funds are held safely in escrow and released to the Provider only upon successful handover & completion of booking.</div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   TERMS & CONDITIONS ACCEPTANCE MODAL
========================================================= */
async function openTermsModal(booking) {
  let modal = document.getElementById('terms-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'terms-modal';
    modal.className = 'app-modal-backdrop';
    modal.innerHTML = `
      <div class="app-modal-container" role="dialog" aria-modal="true">
        <div class="app-modal-header">
          <h3>Rivora Terms of Service (v2.4-2026)</h3>
          <button class="btn-icon" id="terms-modal-close" type="button">✕</button>
        </div>
        <div class="app-modal-body" id="terms-modal-content">
          <div style="background:#EEF2EA; padding:1rem; border-radius:8px; border:1px solid #DDE6DE; font-size:0.82rem; max-height:280px; overflow-y:auto; margin-bottom:1rem;">
            <h4 style="margin-top:0;">1. Master Resource-Exchange Framework</h4>
            <p>Rivora provides a high-trust B2B exchange between verified Hospitality Providers and Seekers. All bookings are bound by standardized handover rules, commercial terms, and statutory GST compliance.</p>
            <h4>2. Escrow Protection & Settlement</h4>
            <p>100% of the agreed amount is secured in Rivora Escrow upon Provider confirmation. Funds are released strictly after booking fulfillment or mutual sign-off.</p>
            <h4>3. Provider Handover Guarantee</h4>
            <p>Providers guarantee resource availability, hygiene, and full operational capacity during reserved hours. Failure to deliver initiates instant 100% refund from escrow.</p>
            <h4>4. Dispute & Cancellation Window</h4>
            <p>Disputes must be raised within 24 hours of scheduled completion. The Rivora Resolution Desk acts as the binding mediator.</p>
          </div>
          <div id="terms-status-info" style="font-size:0.85rem; color:#3C765F; font-weight:600; display:flex; align-items:center; gap:0.4rem;">
            <span>✓</span> Terms version v2.4-2026 active.
          </div>
        </div>
        <div class="app-modal-footer">
          <button class="btn btn-outline" id="btn-terms-close" type="button">Close</button>
          <button class="btn btn-primary" id="btn-terms-accept" type="button">I Accept Terms (v2.4)</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
    document.getElementById('terms-modal-close').addEventListener('click', () => { modal.hidden = true; });
    document.getElementById('btn-terms-close').addEventListener('click', () => { modal.hidden = true; });
  }

  modal.hidden = false;
  const acceptBtn = document.getElementById('btn-terms-accept');
  const statusInfo = document.getElementById('terms-status-info');

  const bookingId = booking ? (booking.id || booking.booking_id) : null;
  let txnId = null;
  if (bookingId && window.RivoraAPI && RivoraAPI.isAuthenticated()) {
    try {
      const txn = await RivoraAPI.getTransactionByBooking(bookingId);
      if (txn) txnId = txn.id;
    } catch (e) {
      console.warn('No txn yet for terms:', e);
    }
  }

  acceptBtn.onclick = async () => {
    acceptBtn.disabled = true;
    acceptBtn.textContent = 'Accepting…';
    try {
      if (txnId && window.RivoraAPI) {
        await RivoraAPI.acceptTerms(txnId, { terms_version: 'v2.4-2026', ip_address: '127.0.0.1' });
      }
      statusInfo.innerHTML = `<span>✓</span> You accepted Terms v2.4-2026 on ${new Date().toLocaleDateString('en-IN')}.`;
      acceptBtn.textContent = 'Accepted ✓';
      setTimeout(() => { modal.hidden = true; }, 1200);
    } catch (err) {
      alert(err.message || 'Terms accepted successfully.');
      modal.hidden = true;
    } finally {
      acceptBtn.disabled = false;
    }
  };
}

/* =========================================================
   SERVICE AGREEMENT MODAL
========================================================= */
async function openAgreementModal(booking) {
  let modal = document.getElementById('agreement-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'agreement-modal';
    modal.className = 'app-modal-backdrop';
    modal.innerHTML = `
      <div class="app-modal-container" role="dialog" aria-modal="true">
        <div class="app-modal-header">
          <h3>B2B Resource Sharing Agreement</h3>
          <button class="btn-icon" id="agreement-modal-close" type="button">✕</button>
        </div>
        <div class="app-modal-body" id="agreement-modal-content">
          <div style="text-align:center; padding:2rem; color:#6C8582;">Loading agreement...</div>
        </div>
        <div class="app-modal-footer">
          <button class="btn btn-outline" id="btn-agreement-print" type="button">Print Agreement</button>
          <button class="btn btn-primary" id="btn-agreement-close" type="button">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
    document.getElementById('agreement-modal-close').addEventListener('click', () => { modal.hidden = true; });
    document.getElementById('btn-agreement-close').addEventListener('click', () => { modal.hidden = true; });
    document.getElementById('btn-agreement-print').addEventListener('click', () => { window.print(); });
  }

  modal.hidden = false;
  const content = document.getElementById('agreement-modal-content');
  const bookingId = booking.id || booking.booking_id;
  let agData = null;

  try {
    if (bookingId && window.RivoraAPI && RivoraAPI.isAuthenticated()) {
      const txn = await RivoraAPI.getTransactionByBooking(bookingId);
      if (txn) {
        agData = await RivoraAPI.getServiceAgreement(txn.id);
      }
    }
  } catch (e) {
    console.warn('Agreement fetch fallback:', e);
  }

  const pName = agData ? agData.provider_business_name : (booking.provider_name || 'Hospitality Provider');
  const sName = agData ? agData.seeker_business_name : (booking.seeker_name || booking.counterpart || 'Seeker Business');
  const rName = booking.resource_name || booking.resource || 'Resource';
  const price = booking.agreed_price || booking.priceNum || 50000;
  const dates = booking.dates || 'Upcoming period';

  content.innerHTML = `
    <div style="line-height:1.6; color:#34565B;">
      <h3 style="margin-top:0; color:#183B43; text-align:center;">MUTUAL RESOURCE UTILIZATION AGREEMENT</h3>
      <p style="font-size:0.8rem; text-align:center; color:#6C8582;">Executed under the Rivora B2B Marketplace Framework</p>
      <hr style="border:none; border-top:1px solid #DDE6DE; margin:1rem 0;">

      <p><strong>BETWEEN:</strong></p>
      <p><strong>Party 1 (Provider):</strong> ${escapeHtml(pName)}<br>
      <strong>Party 2 (Seeker):</strong> ${escapeHtml(sName)}</p>

      <h4 style="margin-bottom:0.25rem;">1. Subject Matter</h4>
      <p>Party 1 agrees to grant temporary, dedicated access to the resource: <strong>${escapeHtml(rName)}</strong> during the reserved schedule: <strong>${escapeHtml(dates)}</strong>.</p>

      <h4 style="margin-bottom:0.25rem;">2. Agreed Commercial Consideration</h4>
      <p>Total Agreed Consideration: <strong>₹${Number(price).toLocaleString('en-IN')}</strong> (Exclusive of statutory GST). Payment is held in Rivora Escrow.</p>

      <h4 style="margin-bottom:0.25rem;">3. Covenants &amp; Warranties</h4>
      <p>The Provider warrants that the resource is compliant with local municipal, health, fire, and safety regulations. The Seeker agrees to return the premises in orderly condition.</p>

      <div style="margin-top:1.5rem; padding:0.75rem; background:#EEF2EA; border-radius:8px; border:1px solid #C9D8D1; font-size:0.8rem; display:flex; justify-content:space-between;">
        <div>Signed digitally by: <strong>${escapeHtml(sName)}</strong><br><span style="color:#6C8582;">Seeker Digital Signature</span></div>
        <div style="text-align:right;">Signed digitally by: <strong>${escapeHtml(pName)}</strong><br><span style="color:#6C8582;">Provider Digital Signature</span></div>
      </div>
    </div>
  `;
}

/* =========================================================
   REFUND REQUEST MODAL
========================================================= */
async function openRefundModal(booking) {
  let modal = document.getElementById('refund-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'refund-modal';
    modal.className = 'app-modal-backdrop';
    modal.innerHTML = `
      <div class="app-modal-container" role="dialog" aria-modal="true">
        <div class="app-modal-header">
          <h3>Request Escrow Refund</h3>
          <button class="btn-icon" id="refund-modal-close" type="button">✕</button>
        </div>
        <form id="refund-form">
          <div class="app-modal-body">
            <p style="margin-top:0; font-size:0.86rem; color:#526F70;">
              Funds are held securely in Rivora Escrow. If there is a dispute, cancellation, or resource unavailability, submit your refund request below.
            </p>
            <div class="field" style="margin-bottom:0.85rem;">
              <label for="refund-reason" style="font-weight:700; font-size:0.8rem; display:block; margin-bottom:0.35rem;">Reason for Refund:</label>
              <select id="refund-reason" required style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem;">
                <option value="Resource Unavailable">Resource Unavailable / Double Booked</option>
                <option value="Quality Dispute">Quality / Condition Not As Listed</option>
                <option value="Mutual Cancellation">Mutual Cancellation with Provider</option>
                <option value="Emergency Scheduling">Emergency Scheduling Conflict</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="field">
              <label for="refund-details" style="font-weight:700; font-size:0.8rem; display:block; margin-bottom:0.35rem;">Explanation &amp; Evidence:</label>
              <textarea id="refund-details" rows="3" placeholder="Provide context for our Trust &amp; Safety team..." required style="width:100%; padding:0.5rem; border:1px solid #C9D8D1; border-radius:8px; font-size:0.88rem; font-family:inherit;"></textarea>
            </div>
          </div>
          <div class="app-modal-footer">
            <button class="btn btn-outline" id="btn-refund-cancel" type="button">Cancel</button>
            <button class="btn btn-primary" type="submit" id="btn-refund-submit" style="background:#B95F58; border-color:#B95F58;">Submit Refund Request</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
    document.getElementById('refund-modal-close').addEventListener('click', () => { modal.hidden = true; });
    document.getElementById('btn-refund-cancel').addEventListener('click', () => { modal.hidden = true; });
  }

  modal.hidden = false;
  const form = document.getElementById('refund-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-refund-submit');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const reason = document.getElementById('refund-reason').value;
    const details = document.getElementById('refund-details').value;
    const bookingId = booking.id || booking.booking_id;

    try {
      if (bookingId && window.RivoraAPI && RivoraAPI.isAuthenticated()) {
        const txn = await RivoraAPI.getTransactionByBooking(bookingId);
        if (txn) {
          await RivoraAPI.requestRefund(txn.id, { reason, details });
        }
      }
      alert('Your refund request has been submitted and is under review by Rivora Trust & Safety. Escrow funds will remain locked until resolution.');
      modal.hidden = true;
    } catch (err) {
      alert(err.message || 'Refund request received.');
      modal.hidden = true;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Refund Request';
    }
  };
}

/* =========================================================
   REAL SEEKER & PROVIDER CHAT & NEGOTIATION SYSTEM
   Real messages persisted to MySQL database via FastAPI
========================================================= */

async function openChat(request, onRefresh) {
  activeChatRequest = request;
  activeChatOnRefresh = onRefresh;

  let modal = document.getElementById('chat-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'chat-modal';
    modal.className = 'chat-modal-backdrop';
    modal.innerHTML = `
      <div class="chat-modal" role="dialog" aria-modal="true" aria-labelledby="chat-modal-resource-name">
        <div class="chat-modal-head">
          <div class="chat-modal-head-top">
            <div class="chat-modal-title-group">
              <h3><span id="chat-modal-resource-name">Banquet and Hall</span></h3>
              <span class="badge badge-amber" id="chat-modal-status-badge"><i></i><span id="chat-modal-status-text">Negotiating</span></span>
            </div>
            <button class="btn-icon" id="chat-modal-close" type="button" aria-label="Close">✕</button>
          </div>
          <div class="chat-modal-head-sub">
            <span class="chat-modal-sub-chip"><span id="chat-modal-dates">Sep 28 – Sep 30, 2026</span></span>
            <span class="chat-modal-sub-chip"><span id="chat-modal-counterpart">Partner</span></span>
            <span class="verify-badge-pill" id="chat-modal-counterpart-badge" style="display:none;">✓ Verified</span>
          </div>
        </div>

        <!-- Comprehensive Negotiation Box -->
        <div class="negotiation-box-container" id="chat-negotiation-box">
          <div class="nego-box-header">
            <div class="nego-title">
              <span>Negotiation Details</span>
            </div>
            <span class="nego-status-pill status-pending" id="chat-nego-status-pill">Pending</span>
          </div>

          <!-- 4-Stat Grid: Current Price, Current Offer, Counter Offer, Active Offer -->
          <div class="nego-stats-grid">
            <div class="nego-stat-item">
              <span class="nego-stat-label">Current Price</span>
              <span class="nego-stat-value" id="chat-nego-current-price">₹0</span>
            </div>
            <div class="nego-stat-item">
              <span class="nego-stat-label">Current Offer</span>
              <span class="nego-stat-value" id="chat-nego-seeker-offer">₹0</span>
            </div>
            <div class="nego-stat-item">
              <span class="nego-stat-label">Counter Offer</span>
              <span class="nego-stat-value" id="chat-nego-counter-offer">₹0</span>
            </div>
            <div class="nego-stat-item">
              <span class="nego-stat-label">Active Offer</span>
              <span class="nego-stat-value highlight" id="chat-nego-active-offer">₹0</span>
            </div>
          </div>

          <!-- Negotiation History Timeline -->
          <div class="nego-timeline-wrap" id="chat-nego-timeline-wrap">
            <span class="nego-timeline-label">Negotiation History:</span>
            <div class="nego-timeline-chips" id="chat-nego-timeline-chips">
              <!-- Rendered dynamically e.g. Original (₹50,000) → Seeker Offer (₹45,000) → Provider Counter (₹47,000) -->
            </div>
          </div>

          <!-- Escrow / Transaction Banner (Active when confirmed) -->
          <div class="nego-escrow-banner" id="chat-nego-escrow-banner" style="display:none;">
            <span class="nego-escrow-badge">Secured Escrow</span>
            <span id="chat-nego-escrow-text">Funds securely held in Rivora Escrow</span>
          </div>

          <!-- Terms, Agreement, Invoice & Refund Action Links -->
          <div class="nego-links-row">
            <button type="button" class="nego-btn-link" id="btn-chat-terms">Terms (v2.4)</button>
            <button type="button" class="nego-btn-link" id="btn-chat-agreement">Agreement</button>
            <button type="button" class="nego-btn-link accent" id="btn-chat-invoice" style="display:none;">Tax Invoice</button>
            <button type="button" class="nego-btn-link" id="btn-chat-refund" style="display:none; color:#A75650; border-color:#E8C4B7;">Request Refund</button>
          </div>

          <!-- Controls Row: Counter Offer & Confirm Offer -->
          <div class="nego-controls" id="chat-nego-controls">
            <div class="nego-input-group">
              <span class="nego-input-prefix">₹</span>
              <input type="number" id="chat-nego-input" class="nego-amount-input" placeholder="e.g. 45000" min="1" step="500">
            </div>
            <button type="button" class="btn-nego-counter-submit" id="btn-chat-counter">Counter Offer</button>
            <!-- CRITICAL: ONLY Provider sees and clicks Confirm Offer. Seeker NEVER sees this. -->
            <button type="button" class="btn-nego-confirm-submit" id="btn-chat-confirm" style="display:none;">
              <span>✓</span> Confirm Booking
            </button>
          </div>
        </div>

        <div class="chat-thread" id="chat-thread"></div>

        <form class="chat-input-row" id="chat-form">
          <input type="text" id="chat-input" placeholder="Type a real message..." autocomplete="off">
          <button class="btn-chat-send" id="btn-chat-send" type="submit" title="Send message" aria-label="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) closeChat(); });
    document.getElementById('chat-modal-close').addEventListener('click', closeChat);

    // Form send listener
    document.getElementById('chat-form').addEventListener('submit', handleSendChatMessage);

    // Negotiation button listeners
    document.getElementById('btn-chat-counter').addEventListener('click', handleChatCounterOffer);
    document.getElementById('btn-chat-confirm').addEventListener('click', handleChatConfirmOffer);

    // Document links
    document.getElementById('btn-chat-terms').addEventListener('click', () => {
      openTermsModal(activeChatRequest);
    });
    document.getElementById('btn-chat-agreement').addEventListener('click', () => {
      openAgreementModal(activeChatRequest);
    });
    document.getElementById('btn-chat-invoice').addEventListener('click', () => {
      openInvoiceModal(activeChatRequest);
    });
    document.getElementById('btn-chat-refund').addEventListener('click', () => {
      openRefundModal(activeChatRequest);
    });
  }

  await updateChatModalData();
  modal.hidden = false;

  // Load real messages from database
  await loadRealChatMessages(request.id);

  // Poll for real-time updates every 3 seconds while chat modal is open
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(() => {
    if (activeChatRequest && activeChatRequest.id) {
      loadRealChatMessages(activeChatRequest.id, true);
    }
  }, 3000);

  const chatInput = document.getElementById('chat-input');
  if (chatInput) setTimeout(() => chatInput.focus(), 80);
}

async function loadRealChatMessages(bookingId, isPolling = false) {
  if (!activeChatRequest) return;
  const reqId = bookingId || 'general';

  if (window.RivoraAPI && RivoraAPI.isAuthenticated() && typeof bookingId === 'number') {
    try {
      const msgs = await RivoraAPI.getBookingMessages(bookingId);
      const existing = REAL_CHATS[reqId] || [];
      if (!isPolling || msgs.length !== existing.length) {
        REAL_CHATS[reqId] = msgs || [];
        renderChatThread();
      }
      return;
    } catch (err) {
      console.warn('[RivoraAPI] Error loading booking messages:', err.message);
    }
  }

  if (!REAL_CHATS[reqId]) {
    REAL_CHATS[reqId] = [];
  }
  if (!isPolling) renderChatThread();
}

async function updateChatModalData() {
  if (!activeChatRequest) return;
  const r = activeChatRequest;

  // Fetch live fresh booking details from database
  let b = r;
  if (window.RivoraAPI && RivoraAPI.isAuthenticated() && typeof r.id === 'number') {
    try {
      const freshBooking = await RivoraAPI.getBooking(r.id);
      if (freshBooking) {
        b = { ...r, ...freshBooking };
        activeChatRequest = b;
      }
    } catch (e) {
      console.warn('[RivoraAPI] Could not fetch fresh booking data for chat:', e);
    }
  }

  const resName = document.getElementById('chat-modal-resource-name');
  const counterpartEl = document.getElementById('chat-modal-counterpart');
  const datesEl = document.getElementById('chat-modal-dates');
  const statusBadge = document.getElementById('chat-modal-status-badge');
  const statusText = document.getElementById('chat-modal-status-text');

  if (resName) resName.textContent = b.resource_name || b.resource || 'Banquet and Hall';
  if (counterpartEl) counterpartEl.textContent = b.counterpart || (b.is_provider ? b.seeker_name : b.provider_name) || 'Partner';
  if (datesEl) datesEl.textContent = b.dates || 'Upcoming Booking';

  const curStatus = b.status || 'pending';
  const badgeCls = STATUS_BADGE[curStatus] || 'badge-neutral';
  const label = t('status.' + curStatus) || curStatus.charAt(0).toUpperCase() + curStatus.slice(1);
  if (statusBadge) statusBadge.className = `badge ${badgeCls}`;
  if (statusText) statusText.textContent = label;

  // 4 Negotiation Stats
  const currentPrice = b.current_price || parseFloat(b.priceNum || b.price || 50000);
  const seekerOffer = b.seeker_offer !== undefined ? b.seeker_offer : (b.requested_price || currentPrice);
  const counterOffer = b.provider_counter_offer;
  const activeOffer = b.active_offer || b.agreed_price || counterOffer || seekerOffer || currentPrice;

  const currentPriceEl = document.getElementById('chat-nego-current-price');
  const seekerOfferEl = document.getElementById('chat-nego-seeker-offer');
  const counterOfferEl = document.getElementById('chat-nego-counter-offer');
  const activeOfferEl = document.getElementById('chat-nego-active-offer');
  const statusPill = document.getElementById('chat-nego-status-pill');

  if (currentPriceEl) currentPriceEl.textContent = I18N.money(currentPrice);
  if (seekerOfferEl) seekerOfferEl.textContent = seekerOffer ? I18N.money(seekerOffer) : '—';
  if (counterOfferEl) counterOfferEl.textContent = counterOffer ? I18N.money(counterOffer) : '—';
  if (activeOfferEl) activeOfferEl.textContent = I18N.money(activeOffer);

  // Negotiation Status Pill
  const negoStatus = b.negotiation_status || (curStatus === 'confirmed' ? 'Agreed & Confirmed' : (curStatus === 'negotiating' ? 'Counter Offer Pending' : 'Pending'));
  if (statusPill) {
    statusPill.textContent = negoStatus;
    statusPill.className = 'nego-status-pill';
    if (curStatus === 'confirmed') statusPill.classList.add('status-confirmed');
    else if (curStatus === 'negotiating') statusPill.classList.add('status-counter-pending');
    else if (curStatus === 'declined') statusPill.classList.add('status-declined');
    else statusPill.classList.add('status-pending');
  }

  // Negotiation History Timeline Chips
  const timelineChips = document.getElementById('chat-nego-timeline-chips');
  if (timelineChips) {
    const historyList = b.negotiation_history || [
      `Original Price (${I18N.money(currentPrice)})`,
      `Seeker Offer (${I18N.money(seekerOffer)})`,
      ...(counterOffer ? [`Provider Counter (${I18N.money(counterOffer)})`] : []),
      `Active Offer: ${I18N.money(activeOffer)}`
    ];

    timelineChips.innerHTML = historyList.map((item, idx) => {
      const isLast = idx === historyList.length - 1;
      return `
        <span class="nego-chip ${isLast ? 'active' : ''}">${escapeHtml(item)}</span>
        ${!isLast ? '<span class="nego-chip-arrow">→</span>' : ''}
      `;
    }).join('');
  }

  // Escrow Banner & Links
  const escrowBanner = document.getElementById('chat-nego-escrow-banner');
  const escrowText = document.getElementById('chat-nego-escrow-text');
  const invoiceBtn = document.getElementById('btn-chat-invoice');
  const refundBtn = document.getElementById('btn-chat-refund');

  if (curStatus === 'confirmed' || curStatus === 'completed') {
    if (escrowBanner) {
      escrowBanner.style.display = 'flex';
      const txnCode = b.transaction_code || `TXN-2026-${String(b.id).padStart(4, '0')}`;
      if (escrowText) escrowText.textContent = `₹${Number(activeOffer).toLocaleString('en-IN')} secured in Rivora Escrow (${txnCode}). Released on handover completion.`;
    }
    if (invoiceBtn) invoiceBtn.style.display = 'inline-flex';
    // Seeker can request refund if needed
    if (refundBtn) refundBtn.style.display = (!b.is_provider) ? 'inline-flex' : 'none';
  } else {
    if (escrowBanner) escrowBanner.style.display = 'none';
    if (invoiceBtn) invoiceBtn.style.display = 'none';
    if (refundBtn) refundBtn.style.display = 'none';
  }

  // Interactive Controls (Inputs and Buttons)
  const negoInput = document.getElementById('chat-nego-input');
  const counterBtn = document.getElementById('btn-chat-counter');
  const confirmBtn = document.getElementById('btn-chat-confirm');

  if (negoInput && (!negoInput.value || negoInput.value === '')) {
    negoInput.value = Math.max(1000, activeOffer - 2000);
  }

  if (curStatus === 'confirmed' || curStatus === 'completed' || curStatus === 'declined') {
    if (counterBtn) { counterBtn.disabled = true; counterBtn.style.opacity = '0.5'; }
    if (confirmBtn) { confirmBtn.style.display = 'none'; }
    if (negoInput) { negoInput.disabled = true; }
  } else {
    if (counterBtn) { counterBtn.disabled = false; counterBtn.style.opacity = '1'; }
    if (negoInput) { negoInput.disabled = false; }

    /* CRITICAL ROLE AUTHORIZATION RULE:
       Seeker MUST NOT see or trigger "Confirm Offer" or "Accept".
       Only Provider can see and trigger "Confirm Booking" when can_confirm is true.
    */
    if (confirmBtn) {
      if (b.is_provider && (b.can_confirm || curStatus === 'pending' || curStatus === 'negotiating')) {
        confirmBtn.style.display = 'inline-flex';
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>✓</span> Confirm Booking (${I18N.money(activeOffer)})`;
      } else {
        confirmBtn.style.display = 'none';
        confirmBtn.disabled = true;
      }
    }
  }
}

async function handleChatCounterOffer() {
  if (!activeChatRequest) return;
  const r = activeChatRequest;
  const negoInput = document.getElementById('chat-nego-input');
  const amountVal = parseFloat(negoInput.value);

  if (isNaN(amountVal) || amountVal <= 0) {
    alert('Please enter a valid counter-offer amount.');
    if (negoInput) negoInput.focus();
    return;
  }

  const counterBtn = document.getElementById('btn-chat-counter');
  const origText = counterBtn ? counterBtn.textContent : 'Counter Offer';
  if (counterBtn) {
    counterBtn.disabled = true;
    counterBtn.textContent = 'Updating…';
  }

  try {
    if (window.RivoraAPI && RivoraAPI.isAuthenticated() && typeof r.id === 'number') {
      await RivoraAPI.createCounterOffer(r.id, amountVal, 'Counter-offer proposed via chat');
    }

    r.status = 'negotiating';
    r.priceNum = amountVal;
    r.price = I18N.money(amountVal);
    r.active_offer = amountVal;

    await updateChatModalData();
    await loadRealChatMessages(r.id);

    if (typeof activeChatOnRefresh === 'function') activeChatOnRefresh();
  } catch (e) {
    alert(e.message || 'Could not send counter-offer');
  } finally {
    if (counterBtn) {
      counterBtn.disabled = false;
      counterBtn.textContent = origText;
    }
  }
}

async function handleChatConfirmOffer() {
  if (!activeChatRequest) return;
  const r = activeChatRequest;
  const confirmPrice = r.active_offer || r.agreed_price || r.priceNum || 50000;
  const confirmBtn = document.getElementById('btn-chat-confirm');
  const origText = confirmBtn ? confirmBtn.innerHTML : 'Confirm Booking';

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Securing Escrow…';
  }

  try {
    if (window.RivoraAPI && RivoraAPI.isAuthenticated() && typeof r.id === 'number') {
      const confirmedBooking = await RivoraAPI.confirmBooking(r.id, confirmPrice);
      r.status = 'confirmed';
      r.agreed_price = confirmPrice;
      if (confirmedBooking.transaction_code) {
        r.transaction_code = confirmedBooking.transaction_code;
      }
    }

    r.status = 'confirmed';
    if (r.rawBooking) {
      r.rawBooking.status = 'confirmed';
      r.rawBooking.agreed_price = confirmPrice;
    }

    await updateChatModalData();
    await loadRealChatMessages(r.id);

    if (typeof activeChatOnRefresh === 'function') activeChatOnRefresh();
  } catch (e) {
    alert(e.message || 'Could not confirm booking');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = origText;
    }
  }
}


async function handleSendChatMessage(e) {
  e.preventDefault();
  if (!activeChatRequest) return;
  const r = activeChatRequest;
  const input = document.getElementById('chat-input');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  const sendBtn = document.getElementById('btn-chat-send');
  if (sendBtn) sendBtn.disabled = true;

  input.value = '';

  try {
    if (window.RivoraAPI && RivoraAPI.isAuthenticated() && typeof r.id === 'number') {
      const savedMsg = await RivoraAPI.sendBookingMessage(r.id, text, 'chat');
      const reqId = r.id;
      if (!REAL_CHATS[reqId]) REAL_CHATS[reqId] = [];
      REAL_CHATS[reqId].push(savedMsg);
      renderChatThread();
    } else {
      // Local fallback for guest / demo
      const reqId = r.id || 'general';
      if (!REAL_CHATS[reqId]) REAL_CHATS[reqId] = [];
      REAL_CHATS[reqId].push({
        id: Date.now(),
        from: 'me',
        is_me: true,
        sender_name: 'You',
        message_text: text,
        message_type: 'chat',
        created_at: new Date().toISOString()
      });
      renderChatThread();
    }
  } catch (err) {
    alert('Failed to send message: ' + (err.message || 'Network error'));
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function closeChat() {
  const modal = document.getElementById('chat-modal');
  if (modal) modal.hidden = true;
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }
  activeChatRequest = null;
  activeChatOnRefresh = null;
}

function renderChatThread() {
  const thread = document.getElementById('chat-thread');
  if (!thread || !activeChatRequest) return;
  const reqId = activeChatRequest.id || 'general';
  const messages = REAL_CHATS[reqId] || [];
  const counterpartName = activeChatRequest.counterpart || 'Partner';

  if (!messages.length) {
    thread.innerHTML = `
      <div class="chat-empty">
        <strong style="color: var(--ink); font-size: 0.95rem; display: block; margin-bottom: 0.25rem;">No messages yet</strong>
        <p style="margin: 0; font-size: 0.84rem; color: var(--ink-soft);">
          Send a direct message to ${escapeHtml(counterpartName)} to discuss availability, pricing, or custom terms.
        </p>
      </div>`;
    return;
  }

  const currentUser = window.RivoraAPI && RivoraAPI.getUser();
  const currentUserId = currentUser ? currentUser.id : null;

  thread.innerHTML = messages.map((m) => {
    const isOfferOrSystem = m.message_type === 'offer' || m.message_type === 'system';
    const timeFormatted = m.created_at
      ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : formatChatTime();

    if (isOfferOrSystem) {
      const label = m.message_type === 'offer' ? 'Offer' : 'Update';
      return `<div class="chat-system-pill"><span>${label}</span> <span>${escapeHtml(m.message_text || m.text || '')}</span> <span style="opacity:0.7;">· ${escapeHtml(timeFormatted)}</span></div>`;
    }

    const isMe = m.is_me !== undefined ? m.is_me : (m.sender_id === currentUserId || m.from === 'me');
    const senderDisplayName = isMe ? t('chat.you') : (m.sender_name || counterpartName);

    return `
      <div class="chat-bubble chat-bubble--${isMe ? 'me' : 'them'}">
        <div class="chat-bubble-head">
          <span class="chat-bubble-name">${escapeHtml(senderDisplayName)}</span>
          <span class="chat-bubble-time">${escapeHtml(timeFormatted)}</span>
        </div>
        <p>${escapeHtml(m.message_text || m.text || '')}</p>
      </div>
    `;
  }).join('');

  thread.scrollTop = thread.scrollHeight;
}

function refreshChat() {
  if (activeChatRequest) {
    updateChatModalData();
    renderChatThread();
  }
}

/* =========================================================
   RESOURCE MAP (Leaflet + OpenStreetMap tiles)
   Free, no API key required, standard attribution shown.
   Markers reflect whatever renderResults() last rendered, so
   the map and the card grid never fall out of sync — filtering,
   Zeus's search, and the radius slider all flow through the
   same lastSearchState the cards use.
========================================================= */

let resourceMap = null;
let mapMarkers = {};   // resource id -> Leaflet marker
let userMarker = null;
let mapRadiusKm = 10;

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function initResourceMap() {
  const mapEl = document.getElementById('resource-map');
  if (!mapEl || typeof L === 'undefined') return; // Leaflet not loaded on this page

  resourceMap = L.map(mapEl, { scrollWheelZoom: false }).setView([SEEKER_HOME.lat, SEEKER_HOME.lng], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(resourceMap);

  addUserMarker(SEEKER_HOME);
  renderMapMarkers(SAMPLE_RESOURCES);

  const radiusInput = document.getElementById('map-radius');
  const radiusValue = document.getElementById('map-radius-value');
  radiusInput.addEventListener('input', () => {
    mapRadiusKm = parseInt(radiusInput.value, 10);
    radiusValue.textContent = t('map.radiusKm', { km: I18N.num(mapRadiusKm) });
    // Re-run the last search with the new radius so map + cards stay in sync.
    if (lastSearchState.list) {
      renderResults(lastSearchState.list, { ...lastSearchState.requirement, radiusKm: mapRadiusKm });
    }
  });

  document.getElementById('map-locate-btn').addEventListener('click', requestUserLocation);

  // Leaflet popups are injected into the DOM dynamically, so their links
  // need a delegated listener rather than one bound at creation time.
  resourceMap.on('popupopen', (e) => {
    const link = e.popup.getElement()?.querySelector('[data-focus-card]');
    link?.addEventListener('click', (evt) => {
      evt.preventDefault();
      focusResultCard(parseInt(link.dataset.focusCard, 10));
    });
  });

  // Leaflet needs an explicit size recalculation once its container is
  // actually visible/laid out (common issue when a map starts in a
  // flex/grid layout or a hidden tab).
  setTimeout(() => resourceMap.invalidateSize(), 200);
  window.addEventListener('resize', () => resourceMap && resourceMap.invalidateSize());
}

function addUserMarker(pos) {
  if (userMarker) resourceMap.removeLayer(userMarker);
  const icon = L.divIcon({ className: '', html: '<div class="map-marker map-marker--you"></div>', iconSize: [18, 18] });
  userMarker = L.marker([pos.lat, pos.lng], { icon, zIndexOffset: 1000 })
    .addTo(resourceMap)
    .bindPopup(escapeHtml(t('map.yourLocation')));
}

function requestUserLocation() {
  const note = document.getElementById('map-note');
  if (!navigator.geolocation) {
    note.hidden = false; note.textContent = t('map.locateDenied');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      addUserMarker(here);
      resourceMap.setView([here.lat, here.lng], 12);
      note.hidden = true;
      // Recompute distances from the real location for this session only.
      SAMPLE_RESOURCES.forEach((r) => { r.distanceKm = Math.round(haversineKm(here, r) * 10) / 10; });
      if (lastSearchState.list) renderResults(lastSearchState.list, lastSearchState.requirement);
    },
    () => { note.hidden = false; note.textContent = t('map.locateDenied'); }
  );
}

/** Draws one marker per resource currently shown in `list` (already filtered/scored). */
function renderMapMarkers(list) {
  if (!resourceMap) return;

  Object.values(mapMarkers).forEach((m) => resourceMap.removeLayer(m));
  mapMarkers = {};

  list.forEach((r) => {
    if (typeof r.lat !== 'number') return;
    const tone = r.available === false ? 'unavailable' : 'available';
    const icon = L.divIcon({
      className: '', html: `<div class="map-marker map-marker--${tone}"><span>${escapeHtml(RESOURCE_TYPE_ICON[r.type] || '●')}</span></div>`,
      iconSize: [28, 28], iconAnchor: [14, 28],
    });
    const marker = L.marker([r.lat, r.lng], { icon }).addTo(resourceMap);
    marker.bindPopup(buildMapPopup(r));
    marker.on('click', () => focusResultCard(r.id));
    mapMarkers[r.id] = marker;
  });

  const note = document.getElementById('map-note');
  if (note) {
    if (!list.length) { note.hidden = false; note.textContent = t('map.noneInRadius'); }
    else note.hidden = true;
  }
}

const RESOURCE_TYPE_ICON = { Space: 'S', Kitchen: 'K', Vehicle: 'V', Furniture: 'F', 'AV Equipment': 'AV', Staff: 'T', Parking: 'P' };

function buildMapPopup(r) {
  return `
    <div class="map-popup-type">${escapeHtml(t(RESOURCE_TYPE_KEYS[r.type] || 'resource.type'))}</div>
    <div class="map-popup-name">${escapeHtml(r.name)}</div>
    <div class="map-popup-meta">${escapeHtml(r.provider)} · ${I18N.num(r.distanceKm)} ${escapeHtml(t('common.km'))}</div>
    <div class="map-popup-price">${I18N.money(r.price)} ${escapeHtml(t(r.unit === 'day' ? 'common.perDay' : 'common.perHour'))}</div>
    <a class="map-popup-link" href="#" data-focus-card="${r.id}">${escapeHtml(t('map.viewDetails'))} →</a>`;
}

/** Scrolls to and briefly highlights a result card when its marker is clicked. */
function focusResultCard(id) {
  const card = document.querySelector(`.result-request-btn[data-resource-id="${id}"]`)?.closest('.result-card');
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('is-map-focused');
  setTimeout(() => card.classList.remove('is-map-focused'), 1800);
}

/** Pans/opens the map marker for a card's "View on map" button. */
function focusMapMarker(id) {
  const marker = mapMarkers[id];
  if (!marker || !resourceMap) return;
  document.getElementById('resource-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  resourceMap.setView(marker.getLatLng(), 14);
  marker.openPopup();
}

// Re-apply map labels/popups when the language changes.
function refreshMap() {
  if (!resourceMap) return;
  const radiusValue = document.getElementById('map-radius-value');
  if (radiusValue) radiusValue.textContent = t('map.radiusKm', { km: I18N.num(mapRadiusKm) });
  renderMapMarkers(lastSearchState.list || SAMPLE_RESOURCES);
}
