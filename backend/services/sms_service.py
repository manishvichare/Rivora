import json
import os
import urllib.error
import urllib.request
from datetime import datetime


def send_verification_sms(phone: str, otp: str, expires_at: datetime) -> dict:
    """Send an SMS through Fast2SMS without persisting or logging the OTP."""
    clean_digits = "".join(c for c in phone if c.isdigit())[-10:]
    valid_until = expires_at.strftime("%Y-%m-%d %H:%M:%S UTC")
    phone_masked = f"+91 ••••• •{clean_digits[-4:]}" if len(clean_digits) >= 4 else "••••"
    api_key = (os.getenv("FAST2SMS_API_KEY") or "").strip()

    if not api_key:
        return {
            "success": False,
            "phone_masked": phone_masked,
            "delivered_via_gateway": False,
            "gateway_error": "SMS provider is not configured",
            "valid_until": valid_until,
        }
    if len(clean_digits) != 10:
        return {
            "success": False,
            "phone_masked": phone_masked,
            "delivered_via_gateway": False,
            "gateway_error": "Invalid 10-digit phone number",
            "valid_until": valid_until,
        }

    message_text = (
        f"Your Rivora verification code is {otp}. Valid for 10 minutes "
        f"(until {valid_until}). Do not share this code."
    )
    data = json.dumps({
        "message": message_text,
        "language": "english",
        "route": "q",
        "numbers": clean_digits,
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://www.fast2sms.com/dev/bulkV2",
        data=data,
        headers={
            "authorization": api_key,
            "Content-Type": "application/json",
            "User-Agent": "Rivora/1.0",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            result = json.loads(response.read().decode("utf-8"))
        delivered = result.get("return") is True
        error = None if delivered else "SMS provider did not accept the message"
        return {
            "success": delivered,
            "phone_masked": phone_masked,
            "delivered_via_gateway": delivered,
            "gateway_error": error,
            "valid_until": valid_until,
        }
    except urllib.error.HTTPError as error:
        print(f"[SMSService] Fast2SMS returned HTTP {error.code}.")
        message = f"SMS provider returned HTTP {error.code}"
    except Exception as error:
        print(f"[SMSService] SMS delivery failed ({type(error).__name__}).")
        message = "SMS provider could not be reached"

    return {
        "success": False,
        "phone_masked": phone_masked,
        "delivered_via_gateway": False,
        "gateway_error": message,
        "valid_until": valid_until,
    }