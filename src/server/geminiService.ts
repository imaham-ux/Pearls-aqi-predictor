import { GoogleGenAI, Type } from '@google/genai';
import { AIHealthInsight, CurrentAQIData, ForecastDaySummary, ShapDayExplanation } from '../types.js';

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
  }
  return aiClient;
}

export async function generateGeminiAQIInsight(
  currentData: CurrentAQIData,
  forecast: ForecastDaySummary[],
  shap: ShapDayExplanation
): Promise<AIHealthInsight> {
  const client = getGeminiClient();

  if (!client) {
    // Return structured default insight if GEMINI_API_KEY is not set
    return getFallbackInsight(currentData, forecast, shap);
  }

  try {
    const prompt = `
You are an expert Environmental Data Scientist and Medical Health Advisor for the Pearls AQI Predictor application.
Analyze the following Air Quality Index (AQI) data and ML model SHAP feature importance for ${currentData.city}, ${currentData.country}:

Current AQI: ${currentData.aqi} (${currentData.category})
Primary Pollutant: ${currentData.primaryPollutant.toUpperCase()} (PM2.5: ${currentData.pollutants.pm25} µg/m³, PM10: ${currentData.pollutants.pm10} µg/m³, O3: ${currentData.pollutants.o3} ppb, NO2: ${currentData.pollutants.no2} ppb)
Current Weather: Temp ${currentData.weather.temperature}°C, Humidity ${currentData.weather.humidity}%, Wind ${currentData.weather.windSpeed} km/h

3-Day AQI Forecast:
- Day 1 (${forecast[0]?.date || 'Tomorrow'}): Avg AQI ${forecast[0]?.avgAQI} (${forecast[0]?.category})
- Day 2 (${forecast[1]?.date || 'Day 2'}): Avg AQI ${forecast[1]?.avgAQI} (${forecast[1]?.category})
- Day 3 (${forecast[2]?.date || 'Day 3'}): Avg AQI ${forecast[2]?.avgAQI} (${forecast[2]?.category})

ML Model SHAP Feature Attributions for Day 1 Prediction:
${shap.features.map(f => `- ${f.displayName}: ${f.value} -> SHAP impact: ${f.shapValue > 0 ? '+' : ''}${f.shapValue} AQI (${f.explanation})`).join('\n')}

Provide an actionable, scientific, and practical assessment in JSON format matching the schema:
1. summary: A concise 2-sentence executive summary of air quality trajectory.
2. healthRiskLevel: Risk assessment for general public vs sensitive groups.
3. sensitiveGroupAdvice: List of 3 specific recommendations for elderly, children, and asthma/cardiac patients.
4. outdoorActivityAdvice: List of 2 recommendations for outdoor sports, commuting, and exercising.
5. homeProtectionAdvice: List of 2 recommendations regarding air purifiers, window ventilation, and indoor plants.
6. shapKeyTakeaways: A clear explanation of what weather or pollution drivers are causing this forecast (based on SHAP values).
7. environmentalFactors: Key meteorological/atmospheric factors to watch (e.g., wind speed, thermal inversions).
`;

    const response = await client.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            healthRiskLevel: { type: Type.STRING },
            sensitiveGroupAdvice: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            outdoorActivityAdvice: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            homeProtectionAdvice: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            shapKeyTakeaways: { type: Type.STRING },
            environmentalFactors: { type: Type.STRING }
          },
          required: [
            'summary',
            'healthRiskLevel',
            'sensitiveGroupAdvice',
            'outdoorActivityAdvice',
            'homeProtectionAdvice',
            'shapKeyTakeaways',
            'environmentalFactors'
          ]
        }
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      return parsed as AIHealthInsight;
    }

    return getFallbackInsight(currentData, forecast, shap);
  } catch (err) {
    console.error('Error in generateGeminiAQIInsight:', err);
    return getFallbackInsight(currentData, forecast, shap);
  }
}

function getFallbackInsight(
  currentData: CurrentAQIData,
  forecast: ForecastDaySummary[],
  shap: ShapDayExplanation
): AIHealthInsight {
  const isHigh = currentData.aqi > 100;

  return {
    summary: `Current air quality in ${currentData.city} is ${currentData.category} with an AQI of ${currentData.aqi}. The 3-day machine learning model forecasts average AQIs of ${forecast[0]?.avgAQI || 65}, ${forecast[1]?.avgAQI || 60}, and ${forecast[2]?.avgAQI || 55}.`,
    healthRiskLevel: isHigh
      ? `Moderate to high respiratory risk for sensitive groups including elderly and children due to elevated ${currentData.primaryPollutant.toUpperCase()} levels.`
      : 'Low to moderate risk for the general population. Ideal condition for outdoor activities.',
    sensitiveGroupAdvice: isHigh
      ? [
          'Wear N95/FFP2 masks when outdoors for extended periods.',
          'Keep rescue inhalers accessible if you have asthma or COPD.',
          'Avoid heavy outdoor exercise during peak morning and evening traffic hours.'
        ]
      : [
          'Sensitive individuals can enjoy outdoor activities normally.',
          'Monitor real-time hourly spikes if exercising near industrial corridors.',
          'Maintain regular indoor ventilation.'
        ],
    outdoorActivityAdvice: isHigh
      ? [
          'Limit strenuous outdoor workouts to early morning hours when ozone and PM levels drop.',
          'Consider indoor cardio alternatives like gym workouts or swimming.'
        ]
      : [
          'Great conditions for outdoor exercise, cycling, and running.',
          'Keep windows open during daytime to refresh indoor air.'
        ],
    homeProtectionAdvice: [
      'Run HEPA air purifiers in living and sleeping spaces continuously.',
      'Check HVAC filters and replace if clogged with ambient particulate buildup.'
    ],
    shapKeyTakeaways: `The ML model's SHAP analysis highlights that recent lag pollution (${shap.features.find((f) => f.feature === 'aqiLag1h')?.value || 'current levels'}) and surface wind speed are the dominant drivers influencing the 3-day forecast curve.`,
    environmentalFactors: `Watch wind dispersion trends: stagnant winds below 10 km/h allow ground-level PM2.5 to build up rapidly.`
  };
}
