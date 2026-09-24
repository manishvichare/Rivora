import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

def send_verification_email(to_email: str, business_name: str, otp: str, expires_at: datetime) -> dict:
    """
    Sends verification email through configured SMTP; reports delivery failure to the caller.
    """
    valid_until_str = expires_at.strftime("%Y-%m-%d %H:%M:%S UTC")
    
    subject = f"{otp} is your Rivora verification code"
    
    # Text fallback
    text_content = (
        f"Hello {business_name},\n\n"
        f"Your Rivora verification code is: {otp}\n"
        f"This code is valid until: {valid_until_str} (10 minutes).\n\n"
        f"Do not share this code with anyone. Rivora support will never ask for your code.\n\n"
        f"— Rivora Hospitality Exchange"
    )

    # Branded HTML email
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
        .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
        .header {{ background: #0f172a; padding: 28px; text-align: center; color: #ffffff; }}
        .brand {{ font-size: 22px; font-weight: 800; letter-spacing: 0.1em; color: #f8fafc; margin: 0; }}
        .brand-sub {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #94a3b8; margin-top: 4px; }}
        .content {{ padding: 32px 28px; }}
        .greeting {{ font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }}
        .desc {{ font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px; }}
        .otp-box {{ background: #f1f5f9; border: 1.5px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }}
        .otp-code {{ font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0f172a; font-family: monospace; }}
        .validity {{ font-size: 12px; color: #64748b; margin-top: 8px; font-weight: 500; }}
        .validity-time {{ color: #0284c7; font-weight: 600; }}
        .security {{ background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 12px; color: #92400e; margin-top: 20px; line-height: 1.5; }}
        .footer {{ padding: 20px 28px; background: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="brand">RIVORA</div>
          <div class="brand-sub">Hospitality Resource Exchange</div>
        </div>
        <div class="content">
          <div class="greeting">Welcome to Rivora, {business_name}</div>
          <div class="desc">Please use the following 6-digit One-Time Password (OTP) to verify your work email address and complete your account creation.</div>
          
          <div class="otp-box">
            <div class="otp-code">{otp}</div>
            <div class="validity">Valid for 10 minutes (Expires: <span class="validity-time">{valid_until_str}</span>)</div>
          </div>

          <div class="security">
            <strong>Security Notice:</strong> Never share this code with anyone. Rivora staff will never contact you requesting your verification code.
          </div>
        </div>
        <div class="footer">
          &copy; 2026 Rivora Technologies Inc. · All rights reserved.<br>
          This is an automated security verification message.
        </div>
      </div>
    </body>
    </html>
    """

    return _send_smtp_email(to_email, subject, text_content, html_content, valid_until_str)


def _send_smtp_email(to_email: str, subject: str, text_content: str, html_content: str, valid_until: str) -> dict:
    """Deliver OTP over SMTP. Never write OTPs to a local outbox."""
    # Always reload .env with override=True to ensure runtime changes are immediately picked up
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=True)
    alt_path = Path(__file__).resolve().parent.parent.parent / "backend" / ".env"
    if alt_path.exists():
        load_dotenv(dotenv_path=alt_path, override=True)

    gmail_user = (os.getenv("GMAIL_USER") or "").strip().strip('"').strip("'")
    gmail_app_password = (os.getenv("GMAIL_APP_PASSWORD") or "").strip().strip('"').strip("'")
    if gmail_user and gmail_app_password:
        smtp_host = "smtp.gmail.com"
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = gmail_user
        smtp_pass = "".join(gmail_app_password.split())
        smtp_from = gmail_user
    else:
        smtp_host = (os.getenv("SMTP_HOST") or "").strip()
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = (os.getenv("SMTP_USER") or "").strip()
        smtp_pass = (os.getenv("SMTP_PASSWORD") or "").strip()
        smtp_from = (os.getenv("SMTP_FROM_EMAIL") or smtp_user or "noreply@rivora.com").strip()

    if not all((smtp_host, smtp_user, smtp_pass, smtp_from)):
        print(f"[EmailService] Incomplete SMTP config: host={smtp_host}, user={smtp_user}, has_pass={bool(smtp_pass)}, from={smtp_from}")
        return {
            "success": False,
            "delivered_via_smtp": False,
            "delivery_message": "Gmail email is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in backend/.env.",
            "valid_until": valid_until,
        }

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Rivora Security <{smtp_from}>"
    msg["To"] = to_email
    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))
    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=20) as server:
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_from, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_from, [to_email], msg.as_string())
        print(f"[EmailService] OTP email accepted by SMTP for {to_email}")
        return {"success": True, "delivered_via_smtp": True, "valid_until": valid_until}
    except smtplib.SMTPAuthenticationError:
        print("[EmailService] Gmail rejected SMTP authentication (535-class error).")
        return {
            "success": False,
            "delivered_via_smtp": False,
            "delivery_message": "Gmail rejected the configured app password. Replace GMAIL_APP_PASSWORD in backend/.env with a fresh Google App Password.",
            "valid_until": valid_until,
        }
    except Exception as err:
        print(f"[EmailService] SMTP delivery failed ({type(err).__name__}).")
        return {
            "success": False,
            "delivered_via_smtp": False,
            "delivery_message": "Gmail could not be reached. Check the backend network connection and try again.",
            "valid_until": valid_until,
        }


def send_login_otp_email(to_email: str, business_name: str, otp: str, expires_at: datetime) -> dict:
    """
    Sends login verification email through configured SMTP; reports delivery failure to the caller.
    """
    # Ensure fresh env values
    load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

    valid_until_str = expires_at.strftime("%Y-%m-%d %H:%M:%S UTC")
    subject = f"{otp} is your Rivora Login Verification Code"
    
    text_content = (
        f"Hello {business_name},\n\n"
        f"Your Rivora login verification code is: {otp}\n"
        f"This code is valid until: {valid_until_str} (10 minutes).\n\n"
        f"If you did not request this login code, please secure your account immediately.\n\n"
        f"— Rivora Security Team"
    )

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
        .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
        .header {{ background: #0f172a; padding: 28px; text-align: center; color: #ffffff; }}
        .brand {{ font-size: 22px; font-weight: 800; letter-spacing: 0.1em; color: #f8fafc; margin: 0; }}
        .brand-sub {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #94a3b8; margin-top: 4px; }}
        .content {{ padding: 32px 28px; }}
        .greeting {{ font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }}
        .desc {{ font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px; }}
        .otp-box {{ background: #f1f5f9; border: 1.5px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }}
        .otp-code {{ font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0f172a; font-family: monospace; }}
        .validity {{ font-size: 12px; color: #64748b; margin-top: 8px; font-weight: 500; }}
        .validity-time {{ color: #0284c7; font-weight: 600; }}
        .security {{ background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 12px; color: #92400e; margin-top: 20px; line-height: 1.5; }}
        .footer {{ padding: 20px 28px; background: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="brand">RIVORA</div>
          <div class="brand-sub">Hospitality Resource Exchange</div>
        </div>
        <div class="content">
          <div class="greeting">Login Verification for {business_name}</div>
          <div class="desc">A login attempt was initiated for your Rivora account. Please enter the following 6-digit One-Time Password (OTP) to complete sign-in:</div>
          
          <div class="otp-box">
            <div class="otp-code">{otp}</div>
            <div class="validity">Valid for 10 minutes (Expires: <span class="validity-time">{valid_until_str}</span>)</div>
          </div>

          <div class="security">
            <strong>Security Alert:</strong> If you did not attempt to sign in to your Rivora account, please change your password immediately. Never share this code with anyone.
          </div>
        </div>
        <div class="footer">
          &copy; 2026 Rivora Technologies Inc. · All rights reserved.<br>
          This is an automated security login verification message.
        </div>
      </div>
    </body>
    </html>
    """

    return _send_smtp_email(to_email, subject, text_content, html_content, valid_until_str)
