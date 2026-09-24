import urllib.request
import urllib.error
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

BASE = 'http://127.0.0.1:8000'

def req(path, method='GET', data=None, headers=None):
    url = f"{BASE}{path}"
    req_headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    if headers:
        req_headers.update(headers)
    encoded_data = json.dumps(data).encode('utf-8') if data is not None else None
    request = urllib.request.Request(url, data=encoded_data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            body = response.read().decode('utf-8')
            return response.status, json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = body
        return e.code, parsed

def run_tests():
    print("=== STARTING FULL SYSTEM VERIFICATION ===")

    # 1. Login Seeker & Provider
    st, res_seeker = req('/auth/login', 'POST', {'email': 'seeker@test.com', 'password': 'password123'})
    assert st == 200, res_seeker
    seeker_token = res_seeker['access_token']
    seeker_headers = {'Authorization': f'Bearer {seeker_token}'}

    st, res_prov = req('/auth/login', 'POST', {'email': 'provider@test.com', 'password': 'password123'})
    assert st == 200, res_prov
    prov_token = res_prov['access_token']
    prov_headers = {'Authorization': f'Bearer {prov_token}'}

    print("[PASS] 1. Auth successful: Seeker & Provider tokens acquired.")

    import random, datetime
    offset_days = random.randint(30, 300)
    offset_hours = random.randint(1, 100)
    dt_start = datetime.datetime(2026, 1, 1) + datetime.timedelta(days=offset_days, hours=offset_hours)
    dt_end = dt_start + datetime.timedelta(days=2)
    start_time = dt_start.isoformat()
    end_time = dt_end.isoformat()
    st, b_data = req('/bookings', 'POST', {
        'resource_id': 27,
        'start_time': start_time,
        'end_time': end_time,
        'requested_price': 45000.0,
        'notes': 'Negotiation verification request'
    }, seeker_headers)
    assert st in [200, 201], b_data
    booking_id = b_data['id']
    print(f"[PASS] 2. Booking created: ID {booking_id} (Status: {b_data['status']}, Requested: ₹{b_data['requested_price']})")
    assert b_data['can_confirm'] is False, "Seeker should not be able to confirm!"

    # 3. Security: Attempt Seeker confirmation via PATCH -> expect 403
    st_patch, res_patch = req(f'/bookings/{booking_id}', 'PATCH', {'status': 'confirmed'}, seeker_headers)
    assert st_patch == 403, f"Expected 403, got {st_patch}: {res_patch}"
    print("[PASS] 3. Security Check: Seeker PATCH /confirm returned HTTP 403 Forbidden:", res_patch['detail'])

    # 4. Security: Attempt Seeker confirmation via POST /confirm -> expect 403
    st_post, res_post = req(f'/bookings/{booking_id}/confirm', 'POST', None, seeker_headers)
    assert st_post == 403, f"Expected 403, got {st_post}: {res_post}"
    print("[PASS] 4. Security Check: Seeker POST /confirm returned HTTP 403 Forbidden:", res_post['detail'])

    # 5. Provider views booking -> verify negotiation fields
    st_prov, prov_view = req(f'/bookings/{booking_id}', 'GET', None, prov_headers)
    assert st_prov == 200, prov_view
    assert prov_view['current_price'] == 50000.0, f"Expected 50000.0, got {prov_view['current_price']}"
    assert prov_view['seeker_offer'] == 45000.0, f"Expected 45000.0, got {prov_view['seeker_offer']}"
    assert prov_view['provider_counter_offer'] is None, "Counter-offer should be None initially"
    assert prov_view['can_confirm'] is True, "Provider should be able to confirm"
    print(f"[PASS] 5. Provider booking inspection: Current Price: ₹{prov_view['current_price']}, Seeker Offer: ₹{prov_view['seeker_offer']}, Counter Offer: {prov_view['provider_counter_offer']}, can_confirm: {prov_view['can_confirm']}")

    # 6. Provider makes counter-offer of ₹47,000
    st_counter, c_data = req(f'/bookings/{booking_id}/counter', 'POST', {'amount': 47000.0, 'notes': 'Including sound system'}, prov_headers)
    assert st_counter == 200, c_data
    assert c_data['status'] == 'negotiating'
    assert c_data['active_offer'] == 47000.0
    assert c_data['provider_counter_offer'] == 47000.0
    print(f"[PASS] 6. Provider counter-offer: Active Offer is now ₹{c_data['active_offer']} (Status: {c_data['status']})")

    # 7. Seeker views updated negotiation
    st_sk, seeker_view = req(f'/bookings/{booking_id}', 'GET', None, seeker_headers)
    assert st_sk == 200, seeker_view
    assert seeker_view['provider_counter_offer'] == 47000.0
    assert seeker_view['can_confirm'] is False, "Seeker must still have can_confirm = False"
    print(f"[PASS] 7. Seeker view updated: Counter Offer is ₹{seeker_view['provider_counter_offer']}, can_confirm: {seeker_view['can_confirm']}")

    # 8. Provider confirms the final offer
    st_conf, conf_data = req(f'/bookings/{booking_id}/confirm', 'POST', None, prov_headers)
    assert st_conf == 200, conf_data
    assert conf_data['status'] == 'confirmed'
    assert conf_data['agreed_price'] == 47000.0
    assert conf_data['can_confirm'] is False, "Once confirmed, further confirmation is closed"
    assert conf_data['can_counter'] is False, "Once confirmed, further countering is closed"
    print(f"[PASS] 8. Provider confirmed booking at ₹{conf_data['agreed_price']} (Status: {conf_data['status']})")

    # 9. Verification flow: Seeker identity & mobile
    st_v, verif_out = req('/verification/seeker/submit', 'POST', {
        'aadhaar_number': '987654321098',
        'pan_number': 'ABCDE1234F',
        'address_line': 'Suite 402, Trade Tower',
        'city': 'Mumbai',
        'pincode': '400001'
    }, seeker_headers)
    assert st_v == 200, verif_out
    assert verif_out['aadhaar_masked'] == 'XXXX-XXXX-1098'
    assert verif_out['pan_masked'] == 'ABXXXXXX4F'
    print(f"[PASS] 9. Seeker Verification: Masked Aadhaar: {verif_out['aadhaar_masked']}, Masked PAN: {verif_out['pan_masked']}")

    # 10. Provider verification: GSTIN & Bank
    st_d, doc_out = req('/verification/provider/document', 'POST', {
        'doc_type': 'gstin',
        'doc_number': '27AABCU9603R1ZM'
    }, prov_headers)
    assert st_d == 200, doc_out
    assert 'XXXXX' in doc_out['doc_number_masked']
    print(f"[PASS] 10. Provider Document submitted: {doc_out['doc_type']} -> {doc_out['doc_number_masked']} (Status: {doc_out['status']})")

    # 11. Transaction & Invoice
    st_tx, txns = req('/transactions/mine', 'GET', None, seeker_headers)
    assert st_tx == 200, txns
    assert len(txns) > 0
    txn_id = txns[0]['id']
    st_inv, inv = req(f'/transactions/{txn_id}/invoice', 'GET', None, seeker_headers)
    assert st_inv == 200, inv
    assert inv['total_amount'] > 0
    assert 'INV-2026-' in inv['invoice_number']
    print(f"[PASS] 11. Invoice generated: Number: {inv['invoice_number']}, Total: ₹{inv['total_amount']}")

    # 12. Terms Acceptance
    st_t, terms = req(f'/transactions/{txn_id}/terms/accept', 'POST', {
        'terms_version': 'v2.4-2026',
        'service_agreement': True,
        'cancellation_policy': True
    }, seeker_headers)
    assert st_t == 200, terms
    assert terms['terms_version'] == 'v2.4-2026'
    print(f"[PASS] 12. Terms & Conditions accepted: Version: {terms['terms_version']}")

    # 13. Notifications
    st_n, notifs = req('/notifications', 'GET', None, seeker_headers)
    assert st_n == 200, notifs
    assert len(notifs) > 0
    print(f"[PASS] 13. Notification Center verified: {len(notifs)} real notification items retrieved.")

    print("\n========================================================")
    print("ALL 13 VERIFICATION & TRUST INTEGRATION CHECKS PASSED!")
    print("========================================================")

if __name__ == '__main__':
    run_tests()
