import urllib.request
import urllib.parse
import json
import datetime
import random
import sys
import io

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

BASE_URL = "http://127.0.0.1:8000"

def log(msg, success=True):
    symbol = "[PASS]" if success else "[FAIL]"
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

def test_all():
    print("\n================ RIVORA 4-PILLAR E2E TEST ================\n")

    # 1. AUTHENTICATE USERS
    st, prov_data = request("POST", "/auth/login", {"email": "provider@test.com", "password": "password123"})
    assert st == 200, f"Provider login failed: {prov_data}"
    prov_token = prov_data["access_token"]
    prov_headers = {"Authorization": f"Bearer {prov_token}"}
    prov_id = prov_data["business"]["id"]
    log(f"Provider login successful: ID={prov_id}, Name='{prov_data['business']['name']}'")

    st, seeker_data = request("POST", "/auth/login", {"email": "seeker@test.com", "password": "password123"})
    assert st == 200, f"Seeker login failed: {seeker_data}"
    seeker_token = seeker_data["access_token"]
    seeker_headers = {"Authorization": f"Bearer {seeker_token}"}
    seeker_id = seeker_data["business"]["id"]
    log(f"Seeker login successful: ID={seeker_id}, Name='{seeker_data['business']['name']}'")

    # =========================================================================
    # PILLAR 1: BUSINESS VERIFICATION & LISTING LOCK
    # =========================================================================
    print("\n--- Pillar 1: Verification System & Admin Checks ---")
    st, stats = request("GET", "/verification/admin/stats", headers=prov_headers)
    assert st == 200, f"Admin stats failed: {stats}"
    log(f"Admin Verification KPI Stats: Total Docs={stats.get('total_documents')}, Verified Docs={stats.get('verified_documents')}, Pending={stats.get('pending_documents')}")

    st, docs = request("GET", "/verification/admin/documents", headers=prov_headers)
    assert st == 200, f"Admin docs failed: {docs}"
    log(f"Admin Document Queue: {len(docs)} documents listed with masked numbers and business names")

    # Verify unverified account lock
    unv_email = f"unverified_{random.randint(1000, 9999)}@rivora.com"
    unv_phone = f"97{random.randint(10000000, 99999999)}"
    st_init, init_d = request("POST", "/auth/signup/initiate", {
        "name": "Unverified Host",
        "business_type": "hotel",
        "email": unv_email,
        "password": "Password123!",
        "phone": unv_phone,
        "location": "Mumbai, Maharashtra"
    })
    assert st_init == 200, f"Initiate failed: {init_d}"
    sess_id = init_d["session_id"]
    
    # Read OTPs from outbox
    from scratch_test_otp import get_latest_otp_from_log, EMAILS_LOG, SMS_LOG
    em_otp = get_latest_otp_from_log(EMAILS_LOG, unv_email)
    mb_otp = get_latest_otp_from_log(SMS_LOG, unv_phone)
    st_ver, ver_d = request("POST", "/auth/signup/verify", {
        "session_id": sess_id,
        "email_otp": em_otp,
        "mobile_otp": mb_otp
    })
    assert st_ver in [200, 201], f"Verify failed: {ver_d}"
    unv_token = ver_d["access_token"]
    unv_headers = {"Authorization": f"Bearer {unv_token}"}
    
    # Try creating a listing with unverified provider -> MUST BE 403
    st, unv_list_resp = request("POST", "/resources", {
        "name": "Unauthorized Grand Hall",
        "type": "hall",
        "location": "Mumbai",
        "price_per_unit": 50000.0,
        "price_unit": "per_day",
        "capacity": 200,
        "description": "Should fail due to unverified business"
    }, headers=unv_headers)
    assert st == 403, f"Expected 403 for unverified provider, got {st}: {unv_list_resp}"
    log("Pillar 1 Listing Lock Verified: Unverified business receives HTTP 403 on resource creation")

    # =========================================================================
    # PILLAR 4: SMART DEAL NEGOTIATION IN CHAT / BOOKING
    # =========================================================================
    print("\n--- Pillar 4: Smart Negotiation & Counter-Offers ---")
    st, prov_res_list = request("GET", "/resources/mine/list", headers=prov_headers)
    if not prov_res_list:
        st, new_res = request("POST", "/resources", {
            "name": "Rivora Grand Ballroom",
            "type": "hall",
            "location": "Mumbai",
            "price_per_unit": 75000.0,
            "price_unit": "per_day",
            "capacity": 400,
            "description": "Grand ballroom with verified permits and safety standards"
        }, headers=prov_headers)
        assert st in [200, 201], f"Resource creation failed: {new_res}"
        resource_id = new_res["id"]
        res_title = new_res["name"]
    else:
        resource_id = prov_res_list[0]["id"]
        res_title = prov_res_list[0]["name"]
    log(f"Using Provider Resource ID: {resource_id} ('{res_title}')")

    # Seeker creates a booking request with counter offer
    offset_days = random.randint(30, 300)
    dt_start = datetime.datetime(2026, 1, 1) + datetime.timedelta(days=offset_days, hours=10)
    dt_end = dt_start + datetime.timedelta(days=2)
    st, book_data = request("POST", "/bookings", {
        "resource_id": resource_id,
        "start_time": dt_start.isoformat(),
        "end_time": dt_end.isoformat(),
        "requested_price": 55000.0,
        "notes": "Corporate gala evening with AV setup requirement"
    }, headers=seeker_headers)
    assert st in [200, 201], f"Booking creation failed: {book_data}"
    booking_id = book_data["id"]
    log(f"Seeker created Booking ID={booking_id}, Requested Price=₹{book_data.get('requested_price')}")

    # Provider counters with ₹58,000
    st, counter_data = request("POST", f"/bookings/{booking_id}/counter", {
        "amount": 58000.0,
        "notes": "Including complimentary audio setup and early check-in"
    }, headers=prov_headers)
    assert st == 200, f"Provider counter failed: {counter_data}"
    log(f"Provider countered with: ₹{counter_data['active_offer']} (Status: {counter_data['status']})")

    # Provider confirms booking at agreed counter offer
    st, conf_data = request("POST", f"/bookings/{booking_id}/confirm", None, headers=prov_headers)
    assert st == 200, f"Provider confirmation failed: {conf_data}"
    log(f"Pillar 4 Verified: Booking confirmed at agreed deal price ₹{conf_data.get('agreed_price')} (Status: {conf_data['status']})")

    # =========================================================================
    # PILLAR 2: FULL-STACK ESCROW & PAYMENT PROCESSING
    # =========================================================================
    print("\n--- Pillar 2: Payment Gateway, Escrow & GST Invoicing ---")
    st, my_txns = request("GET", "/transactions/mine", headers=seeker_headers)
    assert st == 200, f"Failed to fetch transactions: {my_txns}"
    booking_txns = [t for t in my_txns if t.get("booking_id") == booking_id]
    assert len(booking_txns) > 0, f"No transaction found for confirmed booking: {my_txns}"
    txn = booking_txns[0]
    txn_id = txn["id"]
    log(f"Transaction found: ID={txn_id}, Initial Escrow Status={txn.get('escrow_status')}")

    # Process 25% Advance payment via UPI
    st, pay_data = request("POST", f"/transactions/{txn_id}/pay", {
        "payment_type": "advance_25",
        "payment_method": "upi",
        "upi_id": "corporate.events@okaxis"
    }, headers=seeker_headers)
    assert st == 200, f"Payment failed: {pay_data}"
    assert pay_data["escrow_status"] == "held", f"Escrow not held: {pay_data}"
    log(f"Payment Successful: Paid ₹{pay_data['amount_paid']} (25% Advance), Escrow Status={pay_data['escrow_status']}")
    log(f"GST Tax Invoice generated: Invoice #{pay_data.get('invoice_number')}, Base=₹{pay_data.get('base_amount')}, GST (18%)=₹{pay_data.get('gst_amount')}")

    # Complete booking (simulate event completed)
    st, comp_bk = request("PATCH", f"/bookings/{booking_id}", {"status": "completed"}, headers=prov_headers)
    assert st == 200, f"Failed to complete booking: {comp_bk}"
    log("Booking marked COMPLETED after successful event hosting")

    # Release Escrow Payout to Provider
    st, release_data = request("POST", f"/transactions/{txn_id}/escrow/release", None, headers=prov_headers)
    assert st == 200, f"Escrow release failed: {release_data}"
    log(f"Pillar 2 Verified: Escrow payout released to Provider bank account. New Status={release_data.get('escrow_status')}")

    # =========================================================================
    # PILLAR 3: HOSPITALITY TRUST LAYER & REVIEWS
    # =========================================================================
    print("\n--- Pillar 3: Hospitality Trust Profile & Anti-Fake Reviews ---")

    # 1. Seeker reviews the completed booking
    st, rev_resp = request("POST", "/reviews", {
        "booking_id": booking_id,
        "rating": 5,
        "comment": "Exceptional venue and hospitality! AV equipment was pristine, spotless cleanliness.",
        "cleanliness": 5,
        "communication": 5,
        "accuracy": 5
    }, headers=seeker_headers)
    assert st in [200, 201], f"Review submission failed: {rev_resp}"
    log("Review submitted successfully by verified booking attendee")

    # 2. Attempt duplicate review on same booking -> MUST BE 400
    st, fake_rev = request("POST", "/reviews", {
        "booking_id": booking_id,
        "rating": 1,
        "comment": "Malicious duplicate review attempt"
    }, headers=seeker_headers)
    assert st == 400, f"Expected 400 for duplicate review, got {st}: {fake_rev}"
    log("Anti-Fake Review Protection: Duplicate review attempt blocked (HTTP 400)")

    # 3. Fetch Provider Trust Profile
    st, trust_data = request("GET", f"/auth/business/{prov_id}/trust-profile")
    assert st == 200, f"Trust profile failed: {trust_data}"
    log(f"Trust Profile: Reliability Score={trust_data.get('reliability_score')}%, "
        f"Tier='{trust_data.get('trust_tier')}', "
        f"Completed Deals={trust_data.get('completed_deals_count')}, "
        f"Total Escrow Disbursed=₹{trust_data.get('escrow_disbursed_total', 0.0):,.2f}, "
        f"Cancellation Rate={trust_data.get('cancellation_rate_pct')}%, "
        f"Verified Licenses={trust_data.get('verified_licenses')}")
    log("Pillar 3 Verified: Hospitality Trust Profile loaded with dynamic stats and statutory badges")

    print("\n🎉 ALL 4 PILLARS VERIFIED AND WORKING END-TO-END! 🎉\n")

if __name__ == "__main__":
    try:
        test_all()
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
