"""
Real API clients for:
  - AQICN (World Air Quality Index) : https://aqicn.org/api/
  - OpenWeather Air Pollution + Weather + Historical Air Pollution APIs
      https://openweathermap.org/api/air-pollution
      https://openweathermap.org/current

Both are free-tier, real, production APIs (no mocking / no fake data).
"""
import time
import logging
import requests

import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api_client")

AQICN_BASE = "https://api.waqi.info"
OWM_BASE = "https://api.openweathermap.org/data/2.5"


class APIError(Exception):
    pass


def _get(url, params, retries=3, backoff=2):
    last_err = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=15)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:  # noqa: BLE001
            last_err = e
            logger.warning("Request failed (attempt %s/%s): %s", attempt + 1, retries, e)
            time.sleep(backoff * (attempt + 1))
    raise APIError(f"Failed after {retries} retries: {last_err}")


def get_aqicn_current(city: str = None) -> dict:
    """
    Real-time AQI + pollutant readings from AQICN for a given city station.
    Docs: https://aqicn.org/json-api/doc/
    """
    if not config.AQICN_TOKEN:
        raise APIError("AQICN_TOKEN missing. Get a free token at https://aqicn.org/data-platform/token/")

    city = city or config.CITY_NAME
    url = f"{AQICN_BASE}/feed/{city}/"
    data = _get(url, {"token": config.AQICN_TOKEN})

    if data.get("status") != "ok":
        raise APIError(f"AQICN error: {data}")

    d = data["data"]
    iaqi = d.get("iaqi", {})

    return {
        "source": "aqicn",
        "aqi": d.get("aqi"),
        "station": d.get("city", {}).get("name"),
        "timestamp": d.get("time", {}).get("iso"),
        "pm25": iaqi.get("pm25", {}).get("v"),
        "pm10": iaqi.get("pm10", {}).get("v"),
        "o3": iaqi.get("o3", {}).get("v"),
        "no2": iaqi.get("no2", {}).get("v"),
        "so2": iaqi.get("so2", {}).get("v"),
        "co": iaqi.get("co", {}).get("v"),
        "temperature": iaqi.get("t", {}).get("v"),
        "humidity": iaqi.get("h", {}).get("v"),
        "pressure": iaqi.get("p", {}).get("v"),
        "wind": iaqi.get("w", {}).get("v"),
    }


def get_owm_air_pollution_current(lat: float = None, lon: float = None) -> dict:
    """Current pollutant concentrations + OWM's own AQI index (1-5 scale)."""
    if not config.OPENWEATHER_API_KEY:
        raise APIError("OPENWEATHER_API_KEY missing. Get a free key at https://openweathermap.org/api")

    lat = lat or config.LATITUDE
    lon = lon or config.LONGITUDE
    url = f"{OWM_BASE}/air_pollution"
    data = _get(url, {"lat": lat, "lon": lon, "appid": config.OPENWEATHER_API_KEY})
    item = data["list"][0]
    return {
        "source": "openweather",
        "timestamp": item["dt"],
        "owm_aqi_index": item["main"]["aqi"],
        **{f"comp_{k}": v for k, v in item["components"].items()},
    }


def get_owm_air_pollution_forecast(lat: float = None, lon: float = None) -> list:
    """OWM provides an official 4-day hourly pollution forecast for free."""
    if not config.OPENWEATHER_API_KEY:
        raise APIError("OPENWEATHER_API_KEY missing.")

    lat = lat or config.LATITUDE
    lon = lon or config.LONGITUDE
    url = f"{OWM_BASE}/air_pollution/forecast"
    data = _get(url, {"lat": lat, "lon": lon, "appid": config.OPENWEATHER_API_KEY})
    return [
        {
            "timestamp": item["dt"],
            "owm_aqi_index": item["main"]["aqi"],
            **{f"comp_{k}": v for k, v in item["components"].items()},
        }
        for item in data["list"]
    ]


def get_owm_air_pollution_history(start_unix: int, end_unix: int, lat: float = None, lon: float = None) -> list:
    """
    Historical air pollution data (available from 27th Nov 2020 onward), used for backfill.
    Docs: https://openweathermap.org/api/air-pollution#history
    """
    if not config.OPENWEATHER_API_KEY:
        raise APIError("OPENWEATHER_API_KEY missing.")

    lat = lat or config.LATITUDE
    lon = lon or config.LONGITUDE
    url = f"{OWM_BASE}/air_pollution/history"
    data = _get(url, {
        "lat": lat, "lon": lon,
        "start": start_unix, "end": end_unix,
        "appid": config.OPENWEATHER_API_KEY,
    })
    return [
        {
            "timestamp": item["dt"],
            "owm_aqi_index": item["main"]["aqi"],
            **{f"comp_{k}": v for k, v in item["components"].items()},
        }
        for item in data["list"]
    ]


def get_owm_current_weather(lat: float = None, lon: float = None) -> dict:
    """Current weather (temp, humidity, wind, pressure) - real drivers of AQI."""
    if not config.OPENWEATHER_API_KEY:
        raise APIError("OPENWEATHER_API_KEY missing.")

    lat = lat or config.LATITUDE
    lon = lon or config.LONGITUDE
    url = f"{OWM_BASE}/weather"
    data = _get(url, {"lat": lat, "lon": lon, "appid": config.OPENWEATHER_API_KEY, "units": "metric"})
    return {
        "temp": data["main"]["temp"],
        "humidity": data["main"]["humidity"],
        "pressure": data["main"]["pressure"],
        "wind_speed": data["wind"]["speed"],
        "wind_deg": data["wind"].get("deg"),
        "clouds": data["clouds"]["all"],
    }


def owm_aqi_index_to_us_aqi(components: dict) -> float:
    """
    Convert raw pollutant concentrations (ug/m3, from OWM) into a US EPA-style
    AQI number (0-500 scale), since OWM's native index is only a coarse 1-5 scale
    but our project (and AQICN) reports the standard 0-500 AQI.
    Uses PM2.5 breakpoints (the pollutant that most often drives AQI).
    """
    pm25 = components.get("comp_pm2_5") or components.get("pm2_5")
    if pm25 is None:
        return None

    breakpoints = [
        (0.0, 12.0, 0, 50),
        (12.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ]
    for c_lo, c_hi, i_lo, i_hi in breakpoints:
        if c_lo <= pm25 <= c_hi:
            return round(((i_hi - i_lo) / (c_hi - c_lo)) * (pm25 - c_lo) + i_lo, 1)
    return 500.0  # cap
