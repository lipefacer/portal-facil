
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

/**
 * Consulta a API personalizada para cálculo exato de distância.
 * Envia origem e destino via POST conforme especificação.
 */
const getCustomApiDistance = async (originStr: string, destStr: string): Promise<{ distance: number, originFull?: string, destFull?: string } | null> => {
  try {
    const formData = new FormData();
    formData.append('origem', originStr);
    formData.append('destino', destStr);

    const response = await fetch('https://camposfood.com/api/calc_distance.php', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    // Verifica se a resposta contém a distância em KM (number ou string numérica)
    if (data && (typeof data.distancia_km === 'number' || typeof data.distancia_km === 'string')) {
      return {
        distance: parseFloat(data.distancia_km),
        originFull: data.origem_completa,
        destFull: data.destino_completo
      };
    }
  } catch (err) {
    console.error("Erro na API de Distância Personalizada:", err);
  }
  return null;
};

/**
 * Cálculo matemático de linha reta (Crow flies) com coeficiente de correção.
 * Usado APENAS se a API principal falhar (sem internet ou erro no servidor).
 */
const calculateHaversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Raio da Terra em KM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c * 1.3; 
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
  
  let distanceKm = 0;
  let originFull = origin;
  let destinationFull = destination;

  // 1. Preparação dos dados para a API Personalizada
  // IMPORTANTE: Usamos o texto exato dos inputs (endereços) conforme solicitado,
  // em vez de coordenadas, para garantir que a API externa resolva a rota corretamente.
  const apiOriginParam = origin;
  const apiDestParam = destination;

  // 2. Chamada à API
  const apiResult = await getCustomApiDistance(apiOriginParam, apiDestParam);

  if (apiResult && apiResult.distance > 0) {
    distanceKm = apiResult.distance;
    // Se a API retornou endereços formatados (ex: com cidade/estado), usamos eles
    if (apiResult.originFull) originFull = apiResult.originFull;
    if (apiResult.destFull) destinationFull = apiResult.destFull;
  } else if (coords) {
    // 3. Fallback (Plano B): Haversine se a API falhar ou retornar 0
    console.warn("API falhou ou retornou 0, usando cálculo offline.");
    distanceKm = calculateHaversine(coords.origin[0], coords.origin[1], coords.dest[0], coords.dest[1]);
  } else {
    // Fallback extremo
    distanceKm = 3.0; 
  }

  // Refina a distância para 2 casas decimais para cálculos financeiros
  distanceKm = Number(distanceKm.toFixed(2));

  try {
    const prompt = `Estime o tempo de trânsito em minutos e uma frase curta (máx 8 palavras) para uma viagem de mototáxi de exatamente ${distanceKm}km em tráfego urbano de "${origin}" para "${destination}". Responda em JSON.`;

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
    
    // Lógica de Preço
    // Garante que o cálculo usa a distância retornada pela API
    let finalPrice = settings.baseFare + (distanceKm * settings.perKmRate);
    
    const appliedFees: string[] = [];
    const currentHour = new Date().getHours();

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
      distanceKm,
      durationMin: geminiData.durationMin || Math.ceil(distanceKm * 2.2),
      estimatedPrice: Number(Math.max(settings.baseFare, finalPrice).toFixed(2)),
      explanation: geminiData.explanation || "Trajeto calculado com precisão.",
      originFull,
      destinationFull,
      appliedFees,
      originCoords: coords?.origin,
      destCoords: coords?.dest
    };
  } catch (error) {
    // Mesmo no catch, garantimos o cálculo de preço baseado na distância obtida anteriormente
    let finalPriceFallback = settings.baseFare + (distanceKm * settings.perKmRate);

    return {
      distanceKm,
      durationMin: Math.ceil(distanceKm * 2.5),
      estimatedPrice: Number(Math.max(settings.baseFare, finalPriceFallback).toFixed(2)),
      explanation: "Cálculo offline realizado.",
      originFull,
      destinationFull,
      appliedFees: [],
      originCoords: coords?.origin,
      destCoords: coords?.dest
    };
  }
};
