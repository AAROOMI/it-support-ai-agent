import asyncio
import json
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

from livekit.agents import RunContext, ToolError, function_tool, get_job_context

THIS_DIR = Path(__file__).parent
BLOCK_FILE = THIS_DIR / "generic_corporate_app" / "public" / "blockusers.txt"


async def _notify_frontend(notification_type: str, **payload: str) -> None:
    """Send an RPC notification to the browser so it can show a visual cue."""
    try:
        room = get_job_context().room
        if not room.remote_participants:
            logging.warning("No remote participant to notify")
            return
        participant_identity = next(iter(room.remote_participants))
        await asyncio.sleep(3)
        response = await room.local_participant.perform_rpc(
            destination_identity=participant_identity,
            method="client.showNotification",
            payload=json.dumps({"type": notification_type, **payload}),
            response_timeout=30.0,
        )
        logging.info("unblock_user response: %s", response)
    except Exception as rpc_error:
        logging.error("RPC error: %s", rpc_error)


@function_tool()
async def unblock_user(context: RunContext, username: str) -> str:
    """
    Unblock users so they can log in again.

    Args:
        username: The username of the user who is blocked.
    """
    try:
        if not BLOCK_FILE.exists():
            logging.error("Block file not found at %s", BLOCK_FILE)
            return "Unblock failed: blockusers.txt file not found"

        BLOCK_FILE.write_text("")
        logging.info("Successfully cleared blockusers.txt")

        await _notify_frontend("unblock_user", username=username)
        return f"User {username} has been unblocked successfully."
    except Exception as e:
        logging.error("Error clearing block file: %s", e)
        raise ToolError("Unable to use tool unblock_user at this time.") from e


def _send_email_sync(
    to_email: str, subject: str, message: str, cc_email: Optional[str]
) -> None:
    gmail_user = os.getenv("GMAIL_USER")
    gmail_password = os.getenv("GMAIL_APP_PASSWORD")
    if not gmail_user or not gmail_password:
        raise RuntimeError("Gmail credentials not configured.")

    msg = MIMEMultipart()
    msg["From"] = gmail_user
    msg["To"] = to_email
    msg["Subject"] = subject

    recipients = [to_email]
    if cc_email:
        msg["Cc"] = cc_email
        recipients.append(cc_email)

    msg.attach(MIMEText(message, "plain"))

    server = smtplib.SMTP("smtp.gmail.com", 587)
    try:
        server.starttls()
        server.login(gmail_user, gmail_password)
        server.sendmail(gmail_user, recipients, msg.as_string())
    finally:
        server.quit()


@function_tool()
async def send_email(
    context: RunContext,  # type: ignore
    to_email: str,
    subject: str,
    message: str,
    cc_email: Optional[str] = None,
) -> str:
    """
    Send an email through Gmail.

    Args:
        to_email: Recipient email address
        subject: Email subject line
        message: Email body content
        cc_email: Optional CC email address
    """
    try:
        await asyncio.to_thread(_send_email_sync, to_email, subject, message, cc_email)
        logging.info("Email sent successfully to %s", to_email)
    except smtplib.SMTPAuthenticationError:
        logging.error("Gmail authentication failed")
        return "Email sending failed: Authentication error. Please check your Gmail credentials."
    except smtplib.SMTPException as e:
        logging.error("SMTP error occurred: %s", e)
        return f"Email sending failed: SMTP error - {e}"
    except Exception as e:
        logging.error("Error sending email: %s", e)
        return f"An error occurred while sending email: {e}"

    await _notify_frontend("send_email", email_address=to_email)
    return f"The email was sent to {to_email} and the notification was shown."
