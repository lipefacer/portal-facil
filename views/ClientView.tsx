
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Ride, RideStatus, AppSettings } from '../types';
import { Icons } from '../constants';
import { estimateRideDetails, EstimationResult } from '../geminiService';
import ChatWidget from '../components/ChatWidget';
import { nativeBridge } from '../nativeBridge';
import { notificationService } from '../notificationService';

const geocodeAddress = async (address: string): Promise<[number, number] | null> => {
  try {
    // Using simple fetch without custom headers to avoid CORS preflight issues
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
    );
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    if (data && data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch (err) { console.error("Geocode Error:", err); }
  return null;
};

const reverseGeocode = async (lat: number, lon: number): Promise<string | null> => {
  try {
    // Using simple fetch without custom headers to avoid CORS preflight issues
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
    );
    
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    
    if (data) {
      // Prioridade: display_name ou construção manual
      if (data.display_name) {
        // Pega Rua, Bairro e Cidade (geralmente os 3 primeiros componentes)
        const parts = data.display_name.split(',');
        // Filtra partes vazias e pega as 3 primeiras relevantes
        return parts.slice(0, 3).join(',').trim();
      } else if (data.address) {
        const { road, house_number, suburb, city, town, village } = data.address;
        const main = road || '';
        const number = house_number ? `, ${house_number}` : '';
        const district = suburb ? ` - ${suburb}` : '';
        const loc = city || town || village || '';
        return `${main}${number}${district}, ${loc}`;
      }
    }
  } catch (err) { 
    console.error("Reverse Geocode Error:", err); 
  }
  return null;
};

interface ClientViewProps {
  user: User;
  rides: Ride[];
  settings: AppSettings;
  onCreateRide: (ride: Ride) => Promise<string>;
  onUpdateRide: (rideId: string, updates: Partial<Ride>) => Promise<void>;
  onLogout: () => void;
  adminToggle?: () => void;
}

const ClientView: React.FC<ClientViewProps> = ({ user, rides, settings, onCreateRide, onUpdateRide, onLogout, adminToggle }) => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originCoords, setOriginCoords] = useState<[number, number] | null>(null);
  
  const [isEstimating, setIsEstimating] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [estimation, setEstimation] = useState<EstimationResult | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'MONEY' | 'PIX'>('PIX');
  
  const activeRide = useMemo(() => 
    rides.find(r => r.status !== RideStatus.COMPLETED && r.status !== RideStatus.CANCELLED),
  [rides]);

  const handleUseMyLocation = async () => {
    if (isLocating) return;
    setIsLocating(true);
    try {
      const pos = await nativeBridge.getCurrentPosition();
      
      const addr = await reverseGeocode(pos.lat, pos.lng);
      
      if (addr) {
        setOrigin(addr);
        setOriginCoords([pos.lat, pos.lng]);
        await nativeBridge.vibrate();
      } else {
        await nativeBridge.showToast("Endereço não identificado. Por favor, digite.");
        // Não preenche com coordenadas para evitar UX ruim, apenas limpa coords para forçar geocode no estimar
        setOriginCoords(null);
      }
    } catch (e: any) {
      console.error(e);
      await nativeBridge.showToast("Falha ao obter localização. Ative o GPS.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleOriginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOrigin(e.target.value);
    setOriginCoords(null); // Limpa coordenadas se usuário digitar manual
  };

  const handleEstimate = async () => {
    if (!origin || !destination) return;
    setIsEstimating(true);
    setEstimation(null);

    try {
      // 1. Tenta obter coordenadas locais para o MAPA
      let oC = originCoords;
      if (!oC) oC = await geocodeAddress(origin);
      const dC = await geocodeAddress(destination);

      // Se falhar o geocode local, ainda tentamos calcular o preço via API
      // passando undefined nas coords, o serviço vai usar o texto puro
      
      const res = await estimateRideDetails(origin, destination, settings, {
        origin: oC || [0,0], // Fallback safe
        dest: dC || [0,0]
      });

      // Se a API retornou um endereço mais completo, atualizamos
      if (res.originFull && res.originFull.length > origin.length) setOrigin(res.originFull.split(',')[0]);
      if (res.destinationFull && res.destinationFull.length > destination.length) setDestination(res.destinationFull.split(',')[0]);

      // Se não tínhamos coordenadas mas a API de distância funcionou, 
      // o mapa pode ficar sem marcadores, mas o preço estará correto.
      if (!oC || !dC) {
        await nativeBridge.showToast("Endereço aproximado. Preço calculado.");
      }

      setEstimation(res);
      await nativeBridge.successVibrate();
    } catch (e) {
      console.error(e);
      await nativeBridge.showToast("Erro ao calcular rota.");
    } finally {
      setIsEstimating(false);
    }
  };

  const handleRequest = async () => {
    if (!estimation) return;
    setIsConfirming(true);
    
    try {
      await onCreateRide({
        clientId: user.id,
        clientName: user.name,
        origin,
        originFull: estimation.originFull,
        destination,
        destinationFull: estimation.destinationFull,
        distanceKm: estimation.distanceKm,
        totalPrice: estimation.estimatedPrice,
        commissionAmount: (estimation.estimatedPrice * settings.commissionPercent) / 100,
        status: RideStatus.PENDING,
        createdAt: new Date().toISOString(),
        originCoords: estimation.originCoords || [0,0],
        destCoords: estimation.destCoords || [0,0],
        paymentMethod
      } as Ride);

      await nativeBridge.successVibrate();
      setEstimation(null);
      setOrigin('');
      setDestination('');
      setOriginCoords(null);
    } catch (err) {
      await nativeBridge.showToast("Falha ao enviar pedido.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleUserIconClick = () => {
    if (adminToggle) {
      adminToggle();
    } else {
      onLogout();
    }
  };

  if (isChatOpen && activeRide) return <ChatWidget ride={activeRide} user={user} onClose={() => setIsChatOpen(false)} />;

  return (
    <div className="p-5 space-y-6 animate-fade-in relative">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-brand-navy dark:text-slate-100 italic">Olá, {user.name.split(' ')[0]}</h2>
          <p className="text-gray-400 font-medium text-sm">Onde vamos hoje?</p>
        </div>
        <button 
          onClick={handleUserIconClick}
          className="w-12 h-12 bg-brand-orange/10 rounded-2xl flex items-center justify-center border border-brand-orange/20 overflow-hidden shadow-inner active:scale-95 transition-transform"
        >
          {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : <Icons.User />}
        </button>
      </div>

      {activeRide ? (
        <div className="bg-brand-navy dark:bg-slate-900 text-white rounded-[2.5rem] p-6 shadow-2xl space-y-4 border-b-8 border-brand-orange animate-pop">
          <div className="flex justify-between items-start">
            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${activeRide.status === RideStatus.PENDING ? 'bg-brand-orange text-brand-navy animate-pulse' : 'bg-green-500'}`}>
              {activeRide.status === RideStatus.PENDING ? 'Procurando Piloto...' : 'Motorista Confirmado'}
            </span>
            <span className="text-2xl font-black">R$ {activeRide.totalPrice.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-4 pt-4 border-t border-white/10">
             <div className="w-12 h-12 rounded-xl bg-brand-orange overflow-hidden border-2 border-white/20">
               <img src={activeRide.driverPhoto || `https://ui-avatars.com/api/?name=${activeRide.driverName}`} className="w-full h-full object-cover" />
             </div>
             <div className="flex-1">
               <p className="text-[10px] font-black text-brand-orange uppercase">Seu Piloto</p>
               <p className="font-black text-white">{activeRide.driverName || 'Aguardando...'}</p>
             </div>
             {activeRide.status !== RideStatus.PENDING && (
               <button onClick={() => setIsChatOpen(true)} className="p-3 bg-brand-orange text-brand-navy rounded-xl"><Icons.Message /></button>
             )}
          </div>
          <button onClick={() => onUpdateRide(activeRide.id, { status: RideStatus.CANCELLED })} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl text-[10px] uppercase">Cancelar</button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 space-y-4 border border-gray-100 dark:border-slate-800">
          <div className="space-y-3">
             <div className="relative">
                <input 
                  type="text" 
                  placeholder="Local de saída" 
                  value={origin} 
                  onChange={handleOriginChange}
                  className="w-full p-4 pl-4 bg-gray-50 dark:bg-slate-800 rounded-2xl outline-none font-bold dark:text-white" 
                />
                <button 
                  onClick={handleUseMyLocation} 
                  className={`absolute right-4 top-1/2 -translate-y-1/2 transition-colors ${isLocating ? 'text-brand-navy animate-spin' : 'text-brand-orange'}`}
                >
                  {isLocating ? '⌛' : '📍'}
                </button>
             </div>
             <input 
              type="text" 
              placeholder="Para onde vamos?" 
              value={destination} 
              onChange={e => setDestination(e.target.value)} 
              className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl outline-none font-bold dark:text-white" 
             />
          </div>

          {estimation ? (
            <div className="bg-brand-orange/10 p-5 rounded-2xl border border-brand-orange/20 animate-pop space-y-4">
               <div className="flex justify-between items-center">
                 <p className="text-2xl font-black text-brand-navy dark:text-white">R$ {estimation.estimatedPrice.toFixed(2)}</p>
                 <p className="text-[10px] font-bold text-gray-400">{estimation.distanceKm} km • {estimation.durationMin} min</p>
               </div>
               <div className="flex gap-2">
                 {['PIX', 'MONEY'].map(m => (
                   <button key={m} onClick={() => setPaymentMethod(m as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black border-2 transition-all ${paymentMethod === m ? 'bg-brand-navy border-brand-navy text-white' : 'bg-white/50 text-gray-400 border-transparent dark:bg-slate-800'}`}>
                     {m === 'PIX' ? '📱 PIX' : '💵 Dinheiro'}
                   </button>
                 ))}
               </div>
               <button onClick={handleRequest} disabled={isConfirming} className="w-full py-5 bg-brand-orange text-brand-navy font-black rounded-2xl uppercase italic text-sm shadow-xl active:scale-95 transition-all">
                 {isConfirming ? 'Iniciando...' : 'Confirmar Mototáxi'}
               </button>
            </div>
          ) : (
            <button 
              onClick={handleEstimate} 
              disabled={!origin || !destination || isEstimating} 
              className="w-full py-5 bg-brand-navy text-white font-black rounded-2xl shadow-xl uppercase italic disabled:opacity-50 active:scale-95 transition-all"
            >
              {isEstimating ? 'Calculando Frete...' : 'Ver Preço'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientView;
