"""
Real API clients for:
  - AQICN (World Air Quality Index) : https://aqicn.org/api/
  - OpenWeather Air Pollution + Weather + Historical Air Pollution APIs
      https://openweathermap.org/api/air-pollution
      https://openweathermap.org/current
  - Open-Meteo Air Quality + Historical Weather Archive (no API key required!)
      https://open-meteo.com/en/docs/air-quality-api
      https://open-meteo.com/en/docs/historical-weather-api

All free-tier, real, production APIs (no mocking / no fake data).
"""
import time
import logging
import requests
import random
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api_client")
# Shared session with automatic retries
_session = requests.Session()

_retry_strategy = Retry(
    total=5,
    connect=5,
    read=5,
    status=5,
    backoff_factor=1,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset(["GET"]),
    raise_on_status=False,
)

_adapter = HTTPAdapter(max_retries=_retry_strategy)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)

AQICN_BASE = "https://api.waqi.info"
OWM_BASE = "https://api.openweathermap.org/data/2.5"
OPEN_METEO_AIR_QUALITY_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_FORECAST_BASE = "https://api.open-meteo.com/v1/forecast"


class APIError(Exception):
    pass


def _get(url, params, retries=5, timeout=30):
    """
    Robust HTTP GET with retries, exponential backoff and longer timeout.
    """
    last_err = None

    for attempt in range(1, retries + 1):
        try:
            response = _session.get(
                url,
                params=params,
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()

        except requests.RequestException as e:
            last_err = e

            sleep_time = (2 ** (attempt - 1)) + random.uniform(0, 1)

            logger.warning(
                "Request failed (attempt %s/%s): %s. Retrying in %.1f seconds...",
                attempt,
                retries,
                e,
                sleep_time,
            )

            time.sleep(sleep_time)

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


# ---------------------------------------------------------------------------
# Open-Meteo (no API key required, generous free limits)
#   - Air Quality API: hourly pollutants + a directly-computed US AQI value,
#     historical data available since ~2022-07-29 (CAMS reanalysis).
#   - Historical Weather Archive: hourly temp/humidity/pressure/wind/clouds,
#     going back decades - solves the gap where OpenWeather's free tier had
#     no bulk historical weather.
# ---------------------------------------------------------------------------
def get_open_meteo_air_quality_history(lat: float, lon: float, start_date: str, end_date: str) -> list:
    """start_date/end_date as 'YYYY-MM-DD' strings (UTC). Returns hourly records
    with a real US AQI computed by Open-Meteo itself (no approximation needed)."""
    params = {
        "latitude": lat, "longitude": lon,
        "start_date": start_date, "end_date": end_date,
        "hourly": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi",
        "timezone": "UTC",
    }
    data = _get(OPEN_METEO_AIR_QUALITY_BASE, params)
    hourly = data.get("hourly", {})
    times = hourly.get("time", [])

    records = []
    for i, ts in enumerate(times):
        records.append({
            "datetime": ts,
            "aqi": hourly.get("us_aqi", [None] * len(times))[i],
            "pm25": hourly.get("pm2_5", [None] * len(times))[i],
            "pm10": hourly.get("pm10", [None] * len(times))[i],
            "co": hourly.get("carbon_monoxide", [None] * len(times))[i],
            "no2": hourly.get("nitrogen_dioxide", [None] * len(times))[i],
            "so2": hourly.get("sulphur_dioxide", [None] * len(times))[i],
            "o3": hourly.get("ozone", [None] * len(times))[i],
        })
    return records


def get_open_meteo_weather_history(lat: float, lon: float, start_date: str, end_date: str) -> list:
    """Real historical hourly weather from Open-Meteo's archive (no key needed)."""
    params = {
        "latitude": lat, "longitude": lon,
        "start_date": start_date, "end_date": end_date,
        "hourly": "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,cloud_cover",
        "timezone": "UTC",
    }
    data = _get(OPEN_METEO_ARCHIVE_BASE, params)
    hourly = data.get("hourly", {})
    times = hourly.get("time", [])

    records = []
    for i, ts in enumerate(times):
        records.append({
            "datetime": ts,
            "temp": hourly.get("temperature_2m", [None] * len(times))[i],
            "humidity": hourly.get("relative_humidity_2m", [None] * len(times))[i],
            "pressure": hourly.get("surface_pressure", [None] * len(times))[i],
            "wind_speed": hourly.get("wind_speed_10m", [None] * len(times))[i],
            "clouds": hourly.get("cloud_cover", [None] * len(times))[i],
        })
    return records


def get_open_meteo_current(lat: float, lon: float) -> dict:
    """Current AQI + pollutants + weather in one place, free & keyless. Used
    as the PRIMARY source for live dashboard readings (see api_client.py
    module docstring / team discussion on AQICN staleness+missing sensors)."""
    aq_params = {
        "latitude": lat, "longitude": lon,
        "hourly": "us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone",
        "forecast_days": 1, "timezone": "UTC",
    }
    weather_params = {
        "latitude": lat, "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover",
        "timezone": "UTC",
    }
    aq_data = _get(OPEN_METEO_AIR_QUALITY_BASE, aq_params)
    weather_data = _get(OPEN_METEO_FORECAST_BASE, weather_params)
 
    hourly = aq_data.get("hourly", {})
    idx = 0  # first hourly entry ~= current hour
    current = weather_data.get("current", {})
 
    return {
        "source": "open-meteo",
        "timestamp": hourly.get("time", [None])[idx],
        "aqi": hourly.get("us_aqi", [None])[idx],
        "pm25": hourly.get("pm2_5", [None])[idx],
        "pm10": hourly.get("pm10", [None])[idx],
        "co": hourly.get("carbon_monoxide", [None])[idx],
        "no2": hourly.get("nitrogen_dioxide", [None])[idx],
        "so2": hourly.get("sulphur_dioxide", [None])[idx],
        "o3": hourly.get("ozone", [None])[idx],
        "temp": current.get("temperature_2m"),
        "humidity": current.get("relative_humidity_2m"),
        "pressure": current.get("surface_pressure"),
        "wind_speed": current.get("wind_speed_10m"),
        "wind_deg": current.get("wind_direction_10m"),
        "clouds": current.get("cloud_cover"),
    }
