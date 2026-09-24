import os
import json
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

OUTBOX_DIR = Path(__file__).resolve().parent.parent / "outbox"
OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
SMS_LOG = OUTBOX_DIR / "sms.log"

FAST2SMS_DEFAULT_KEY = "ScaGXIfMxLAzHE4QNJoseqFghp9Pi6BrvWZ8k17CRtDmnTj0KyyOPFafRbzBtqKc9DinwplYGIs3hgEZ"

def send_verification_sms(phone: str, otp: str, expires_at: datetime) -> dict:
    """
    Dispatches real SMS using Fast2SMS API.
    Always records dispatched OTP with valid-till details to backend outbox.
    """
    clean_digits = "".join(c for c in phone if c.isdigit())[-10:]
    valid_until_str = expires_at.strftime("%Y-%m-%d %H:%M:%S UTC")
    message_text = f"Your Rivora verification code is {otp}. Valid for 10 minutes (until {valid_until_str}). Do not share this code."

    # Always log to local outbox for auditing and development inspection
    log_entry = (
        f"[{datetime.utcnow().isoformat()}] TO: +91{clean_digits} | "
        f"OTP: {otp} | VALID_UNTIL: {valid_until_str}\n"
    )
    try:
        with open(SMS_LOG, "a", encoding="utf-8") as f:
            f.write(log_entry)
    except Exception as e:
        print(f"[SMSService] Log error: {e}")

    api_key = os.getenv("FAST2SMS_API_KEY", FAST2SMS_DEFAULT_KEY)
    delivered_via_gateway = False
    gateway_response = None
    gateway_error = None

    if clean_digits and len(clean_digits) == 10:
        # Fast2SMS bulkV2 call
        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            headers = {
                "authorization": api_key,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0"
            }
            # Try Quick route (q)
            data_q = json.dumps({
                "message": message_text,
                "language": "english",
                "route": "q",
                "numbers": clean_digits
            }).encode("utf-8")
            req = urllib.request.Request(url, data=data_q, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as resp:
                resp_json = json.loads(resp.read().decode("utf-8"))
                gateway_response = resp_json
                if resp_json.get("return") is True:
                    delivered_via_gateway = True
                    print(f"[SMSService] SMS delivered successfully via Fast2SMS to +91{clean_digits}")
        except urllib.error.HTTPError as he:
            err_body = he.read().decode("utf-8")
            gateway_error = f"HTTP {he.code}: {err_body}"
            print(f"[SMSService] Fast2SMS gateway returned HTTP error: {gateway_error}")
        except Exception as ex:
            gateway_error = str(ex)
            print(f"[SMSService] Error calling Fast2SMS: {gateway_error}")
    else:
        gateway_error = "Invalid 10-digit phone number"

    return {
        "success": True,
        "phone_masked": f"+91 ••••• •{clean_digits[-4:]}" if len(clean_digits) >= 4 else phone,
        "delivered_via_gateway": delivered_via_gateway,
        "gateway_error": gateway_error,
        "outbox_path": str(SMS_LOG),
        "valid_until": valid_until_str
    }
