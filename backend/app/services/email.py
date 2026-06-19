import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class EmailService:
    def send_email(self, to_emails: list[str], subject: str, body: str) -> bool:
        recipients = [e.strip() for e in to_emails if e and e.strip()]
        if not recipients:
            logger.warning("[email] send_email called with no valid recipients — skipping")
            return False

        settings = get_settings()

        if not settings.smtp_host or not settings.smtp_username:
            logger.warning(
                "[email:dry-run] SMTP not configured (SMTP_HOST/SMTP_USERNAME missing).\n"
                "  To=%s\n  Subject=%s\n%s",
                recipients, subject, body,
            )
            return False

        try:
            message = EmailMessage()
            message["From"] = str(settings.smtp_from)
            message["To"] = ", ".join(recipients)
            message["Subject"] = subject
            message.set_content(body)

            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                if settings.smtp_tls:
                    smtp.starttls()
                if settings.smtp_username and settings.smtp_password:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)

            logger.info("[email:sent] To=%s  Subject=%s", recipients, subject)
            return True

        except smtplib.SMTPAuthenticationError as exc:
            logger.error("[email:error] Authentication failed — check SMTP_USERNAME/SMTP_PASSWORD: %s", exc)
        except smtplib.SMTPConnectError as exc:
            logger.error("[email:error] Cannot connect to SMTP server %s:%s — %s", settings.smtp_host, settings.smtp_port, exc)
        except Exception as exc:
            logger.error("[email:error] Unexpected error sending to %s: %s", recipients, exc)

        return False


email_service = EmailService()
