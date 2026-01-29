
import { GoogleGenAI, Type } from "@google/genai";
import { AppSettings } from "./types";

export interface EstimationResult {
  distanceKm: number;
  durationMin: number;
  estimatedPrice: number;
  explanation: string;
  originFull: string;
  destinationFull: string;
  appliedFees: string[];
  originCoords?: [number, number] | null;
  destCoords?: [number, number] | null;
}

// Função para calcular distância entre coordenadas (Haversine)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const isTimeInRange = (current: number, start: number, end: number) => {
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
};

export const estimateRideDetails = async (
  origin: string, 
  destination: string, 
  settings: AppSettings,
  coords?: { origin: [number, number], dest: [number, number] }
): Promise<EstimationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Se não temos coordenadas, assumimos uma distância padrão para evitar erro de frete zero
  let distanceKm = coords ? calculateDistance(coords.origin[0], coords.origin[1], coords.dest[0], coords.dest[1]) : 2.0;
  
  // Adiciona uma margem de 20% para curvas e trânsito (distância real vs linha reta)
  distanceKm = distanceKm * 1.25;

  try {
    const prompt = `Estime o tempo de viagem de mototáxi para um trajeto de ${distanceKm.toFixed(2)} km entre "${origin}" e "${destination}". Responda em JSON com "durationMin" (número) e "explanation" (string curta).`;

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
    
    // Precificação baseada nas configurações do Admin
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
      estimatedPrice: Number(Math.max(settings.baseFare, finalPrice).toFixed(2)),
      explanation: geminiData.explanation || "Trajeto normal.",
      originFull: origin,
      destinationFull: destination,
      appliedFees,
      originCoords: coords?.origin,
      destCoords: coords?.dest
    };
  } catch (error) {
    console.error("Erro na estimativa Gemini:", error);
    return {
      distanceKm: Number(distanceKm.toFixed(2)),
      durationMin: Math.ceil(distanceKm * 3), // Fallback: 3 min por km
      estimatedPrice: Number((settings.baseFare + (distanceKm * settings.perKmRate)).toFixed(2)),
      explanation: "Cálculo baseado em distância linear.",
      originFull: origin,
      destinationFull: destination,
      appliedFees: [],
      originCoords: coords?.origin,
      destCoords: coords?.dest
    };
  }
};
