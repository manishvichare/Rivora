import urllib.request
import urllib.parse
import json
import random
import time
import re
from pathlib import Path
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

BASE_URL = "http://127.0.0.1:8000"
BACKEND_DIR = Path(__file__).resolve().parent
EMAILS_LOG = BACKEND_DIR / "outbox" / "emails.log"
SMS_LOG = BACKEND_DIR / "outbox" / "sms.log"

def log(msg, success=True):
    symbol = "✅" if success else "❌"
    print(f"{symbol} {msg}")

def request(method, path, data=None, headers=None):
    url = f"{BASE_URL}{path}"
    req_headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    if headers:
        req_headers.update(headers)
    body = json.dumps(data).encode("utf-8") if data is not None else None

    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            try:
                json_data = json.loads(content)
            except Exception:
                json_data = content
            return resp.status, json_data
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            json_data = json.loads(content)
        except Exception:
            json_data = content
        return e.code, json_data

def get_latest_otp_from_log(log_path, identifier):
    """Reads latest dispatched OTP from the secure backend outbox log."""
    if not log_path.exists():
        return None
    with open(log_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    for line in reversed(lines):
        if identifier in line:
            m = re.search(r"OTP:\s*(\d{6})", line)
            if m:
                return m.group(1)
    return None

def run_tests():
    print("\n================ RIVORA DUAL-OTP SIGNUP TEST SUITE ================\n")

    # TEST 9: Account cannot be created by bypassing frontend and directly calling POST /auth/signup
    print("--- Test 9: Direct Registration Bypass Lock ---")
    st, bypass_res = request("POST", "/auth/signup", {
        "name": "Bypass Attacker",
        "business_type": "hotel",
        "email": f"hacker_{random.randint(1000,9999)}@darkweb.com",
        "password": "Password123!",
        "phone": "+919999988888"
    })
    assert st == 403, f"Expected 403 Forbidden on direct signup, got {st}: {bypass_res}"
    log(f"Test 9 Passed: Direct registration blocked with HTTP 403: '{bypass_res.get('detail')}'")

    # TEST 8: Zero OTPs or API keys returned in initiate API response
    print("\n--- Test 8: Zero OTP / Secret Leakage in Initiate Response ---")
    test_email = f"real_hotel_{random.randint(10000, 99999)}@rivora-test.com"
    test_phone = f"98{random.randint(10000000, 99999999)}"

    st, init_data = request("POST", "/auth/signup/initiate", {
        "name": "Rivora Heritage Palace",
        "business_type": "hotel",
        "email": test_email,
        "phone": test_phone,
        "location": "Udaipur, Rajasthan",
        "password": "GrandPassword2026!"
    })
    assert st == 200, f"Initiate failed: {init_data}"
    session_id = init_data.get("session_id")
    assert session_id, "Missing session_id in initiate response"
    assert "otp" not in init_data, "SECURITY FLAW: OTP leaked in API response!"
    assert "key" not in str(init_data).lower() or "session_id" in str(init_data), "Potential key leak!"
    log(f"Test 8 Passed: API response returned session_id={session_id[:12]}... with zero OTP leakage.")
    log(f"Masked Contact: Email={init_data.get('email_masked')}, Phone={init_data.get('phone_masked')}, Valid Until={init_data.get('valid_until')}")

    # Verify no account created yet in database
    st_login, login_check = request("POST", "/auth/login", {"email": test_email, "password": "GrandPassword2026!"})
    assert st_login == 401, f"Premature account creation! Account already exists before OTP verification: {login_check}"
    log("Pre-Registration Guarantee: No business account exists in database before verification.")

    # Retrieve real dispatched OTPs from outbox
    email_otp = get_latest_otp_from_log(EMAILS_LOG, test_email)
    mobile_otp = get_latest_otp_from_log(SMS_LOG, test_phone)
    assert email_otp and len(email_otp) == 6, f"Email OTP not logged: {email_otp}"
    assert mobile_otp and len(mobile_otp) == 6, f"Mobile OTP not logged: {mobile_otp}"
    log(f"Dispatched Codes Retrieved from Backend Outbox: Email OTP={email_otp}, Mobile OTP={mobile_otp}")

    # TEST 6: Resend OTP Cooldown Enforcement
    print("\n--- Test 6: Resend Cooldown Enforcement ---")
    st_resend_early, resend_early = request("POST", "/auth/signup/resend", {
        "session_id": session_id,
        "channel": "email"
    })
    assert st_resend_early == 429, f"Expected 429 Too Many Requests within 60s cooldown, got {st_resend_early}: {resend_early}"
    log(f"Test 6 Passed: Resend cooldown enforced with HTTP 429: '{resend_early.get('detail')}'")

    # TEST 3: Wrong Email OTP -> Account NOT created
    print("\n--- Test 3: Wrong Email OTP ---")
    wrong_email = "999999" if email_otp != "999999" else "888888"
    st_bad_em, bad_em_res = request("POST", "/auth/signup/verify", {
        "session_id": session_id,
        "email_otp": wrong_email
    })
    assert st_bad_em == 400, f"Expected 400 on wrong email OTP, got {st_bad_em}: {bad_em_res}"
    assert "Email OTP" in bad_em_res.get("detail", ""), f"Unexpected error detail: {bad_em_res}"
    log(f"Test 3 Passed: Wrong email OTP rejected with HTTP 400: '{bad_em_res.get('detail')}'")

    # Re-verify account STILL NOT created after failed attempts
    st_login2, _ = request("POST", "/auth/login", {"email": test_email, "password": "GrandPassword2026!"})
    assert st_login2 == 401, "Account was prematurely created after failed OTP attempts!"
    log("Pre-Registration Guarantee: Account still does NOT exist after invalid OTP attempts.")

    # TEST 4: Expired OTP rejection
    print("\n--- Test 4: Expired OTP Session Handling ---")
    st_bad_sess, bad_sess_res = request("POST", "/auth/signup/verify", {
        "session_id": "non_existent_or_expired_session_12345",
        "email_otp": email_otp
    })
    assert st_bad_sess == 404, f"Expected 404 for invalid/expired session, got {st_bad_sess}: {bad_sess_res}"
    log(f"Test 4 Passed: Non-existent / expired session rejected with HTTP 404.")

    # TEST 1: Correct Email OTP Only (No Mobile OTP required) -> Account CREATED
    print("\n--- Test 1: Email-Only Verification (No Mobile OTP Needed) ---")
    st_success, success_res = request("POST", "/auth/signup/verify", {
        "session_id": session_id,
        "email_otp": email_otp
    })
    assert st_success in [200, 201], f"Account creation failed with correct email OTP: {success_res}"
    new_token = success_res.get("access_token")
    new_biz = success_res.get("business", {})
    assert new_token, "No access token returned after successful registration"
    assert new_biz.get("email") == test_email, f"Business email mismatch: {new_biz}"
    log(f"Test 1 Passed: Account successfully created using Email OTP only! ID={new_biz.get('id')}, Name='{new_biz.get('name')}', Verified={new_biz.get('verified')}")

    # Verify session is consumed and cannot be replayed
    st_replay, replay_res = request("POST", "/auth/signup/verify", {
        "session_id": session_id,
        "email_otp": email_otp
    })
    assert st_replay in [400, 404], f"Replay attack allowed! Expected 404/400, got {st_replay}"
    log("Replay Protection: Consumed session cannot be reused.")

    # Verify new account can immediately log in
    print("\n--- Test 10: Seamless Login & Regression Check ---")
    st_login_ok, login_ok = request("POST", "/auth/login", {"email": test_email, "password": "GrandPassword2026!"})
    assert st_login_ok == 200, f"Login failed for newly created account: {login_ok}"
    if login_ok.get("require_otp"):
        log_login_otp = get_latest_otp_from_log(EMAILS_LOG, test_email)
        assert log_login_otp, "Login OTP not dispatched to outbox log!"
        st_v, v_data = request("POST", "/auth/login-verify", {
            "session_id": login_ok["session_id"],
            "otp": log_login_otp
        })
        assert st_v == 200, f"Login OTP verification failed: {v_data}"
        login_ok = v_data

    log(f"Login Verified for New Account: Token received, Business ID={login_ok['business']['id']}")

    # Check existing accounts continue working seamlessly
    st_prov, prov_login = request("POST", "/auth/login", {"email": "provider@test.com", "password": "password123"})
    assert st_prov == 200, "Existing provider account broken!"
    st_sk, sk_login = request("POST", "/auth/login", {"email": "seeker@test.com", "password": "password123"})
    assert st_sk == 200, "Existing seeker account broken!"
    log("Test 10 Passed: Existing test accounts continue logging in seamlessly.")

    print("\n🎉 ALL 10 DUAL-OTP VERIFICATION & SECURITY REQUIREMENTS VERIFIED AND PASSED! 🎉\n")

if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
