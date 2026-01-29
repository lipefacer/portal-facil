
import { GoogleGenAI, Type } from "@google/genai";
import { AppSettings, CustomFee } from "./types";

export interface EstimationResult {
  distanceKm: number;
  durationMin: number;
  estimatedPrice: number;
  explanation: string;
  originFull: string;
  destinationFull: string;
  appliedFees: string[];
  // Fix: Added optional coordinate properties to satisfy typing requirements in ClientView
  originCoords?: [number, number] | null;
  destCoords?: [number, number] | null;
}

const isTimeInRange = (current: number, start: number, end: number) => {
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
};

export const estimateRideDetails = async (
  origin: string, 
  destination: string, 
  settings: AppSettings
): Promise<EstimationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  let distanceKm = 0;
  let originFull = origin;
  let destinationFull = destination;

  // Chamada simulada para API de geocodificação/distância (Exemplo Nomimatim)
  try {
    const params = new URLSearchParams({ origem: origin, destino: destination });
    const distResponse = await fetch('https://camposfood.com/api/calc_distance.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (distResponse.ok) {
      const distData = await distResponse.json();
      distanceKm = Number(distData.distancia_km) || 2.5;
      originFull = distData.origem_completa || origin;
      destinationFull = distData.destino_completo || destination;
    }
  } catch (error) { distanceKm = 3.0; }

  try {
    const prompt = `Distância: ${distanceKm.toFixed(2)} km entre "${originFull}" e "${destinationFull}". Analise o trajeto para mototáxi e estime tempo (minutos) e explicação curta (máx 10 palavras).`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            durationMin: { type: Type.NUMBER },
            explanation: { type: Type.STRING }
          },
          required: ["durationMin", "explanation"]
        }
      }
    });

    const geminiData = JSON.parse(response.text.trim());
    
    // Precificação
    let finalPrice = settings.baseFare + (distanceKm * settings.perKmRate);
    const appliedFees: string[] = [];

    const now = new Date();
    const currentHour = now.getHours();

    if (settings.customFees) {
      settings.customFees.forEach((fee) => {
        if (fee.enabled && fee.type === 'time' && fee.startHour !== undefined && fee.endHour !== undefined) {
          if (isTimeInRange(currentHour, fee.startHour, fee.endHour)) {
            finalPrice += fee.value;
            appliedFees.push(`${fee.reason} (+R$${fee.value.toFixed(2)})`);
          }
        }
      });
    }

    return {
      distanceKm: Number(distanceKm.toFixed(2)),
      durationMin: geminiData.durationMin || 10,
      estimatedPrice: Number(finalPrice.toFixed(2)),
      explanation: geminiData.explanation || "Trajeto normal.",
      originFull, destinationFull, appliedFees
    };
  } catch (error) {
    return {
      distanceKm, durationMin: 12,
      estimatedPrice: settings.baseFare + (distanceKm * settings.perKmRate),
      explanation: "Cálculo padrão de distância.",
      originFull, destinationFull, appliedFees: []
    };
  }
};
