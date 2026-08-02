"""
Alerts for hazardous AQI levels - checks the latest forecast and, if any
horizon crosses config.HAZARD_ALERT_THRESHOLD, sends an email and/or Slack
webhook notification (both optional; alert always logged either way).
"""
import logging
import smtplib
from email.mime.text import MIMEText

import requests

import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("alerts")


def aqi_category(aqi: float) -> tuple:
    for lo, hi, label, color in config.AQI_LEVELS:
        if lo <= aqi <= hi:
            return label, color
    return "Hazardous", "#7e0023"


def check_and_alert(forecast: dict):
    triggered = []
    for entry in forecast["forecast"]:
        aqi = entry["predicted_aqi"]
        if aqi is not None and aqi >= config.HAZARD_ALERT_THRESHOLD:
            label, _ = aqi_category(aqi)
            triggered.append((entry["horizon"], entry["target_time"], aqi, label))

    if not triggered:
        logger.info("No hazardous AQI levels forecast. All clear.")
        return []

    message_lines = [f"⚠️ Hazardous AQI forecast for {config.CITY_NAME.title()}:"]
    for horizon, target_time, aqi, label in triggered:
        message_lines.append(f"  - In {horizon} ({target_time}): AQI {aqi} ({label})")
    message = "\n".join(message_lines)
    logger.warning(message)

    _send_email(message)
    _send_slack(message)
    return triggered


def _send_email(message: str):
    if not (config.ALERT_EMAIL_FROM and config.ALERT_EMAIL_TO and config.ALERT_EMAIL_APP_PASSWORD):
        return
    try:
        msg = MIMEText(message)
        msg["Subject"] = f"AQI Alert - {config.CITY_NAME.title()}"
        msg["From"] = config.ALERT_EMAIL_FROM
        msg["To"] = config.ALERT_EMAIL_TO
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(config.ALERT_EMAIL_FROM, config.ALERT_EMAIL_APP_PASSWORD)
            server.send_message(msg)
        logger.info("Alert email sent to %s", config.ALERT_EMAIL_TO)
    except Exception as e:  # noqa: BLE001
        logger.error("Failed to send alert email: %s", e)


def _send_slack(message: str):
    if not config.SLACK_WEBHOOK_URL:
        return
    try:
        requests.post(config.SLACK_WEBHOOK_URL, json={"text": message}, timeout=10)
        logger.info("Alert posted to Slack webhook.")
    except Exception as e:  # noqa: BLE001
        logger.error("Failed to post Slack alert: %s", e)
