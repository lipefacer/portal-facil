
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Ride, RideStatus, AppSettings, UserRole } from '../types';
import { Icons } from '../constants';
import { estimateRideDetails, EstimationResult } from '../geminiService';
import ChatWidget from '../components/ChatWidget';
import { doc, updateDoc, db } from '../firebase';
import { notificationService } from '../notificationService';

// Headers para evitar bloqueio do Nominatim (OpenStreetMap Policy)
const NOMINATIM_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'PortalFacilMototaxi/1.0'
};

const geocodeAddress = async (address: string): Promise<[number, number] | null> => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: NOMINATIM_HEADERS }
    );
    const data = await response.json();
    if (data && data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch (err) { console.error("Erro Geocode:", err); }
  return null;
};

const reverseGeocode = async (lat: number, lon: number): Promise<string | null> => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: NOMINATIM_HEADERS }
    );
    const data = await response.json();
    if (data?.display_name) {
      // Simplifica o endereço para o usuário
      const parts = data.display_name.split(',');
      return parts.slice(0, 2).join(',').trim();
    }
  } catch (err) { console.error("Erro Reverse Geocode:", err); }
  return null;
};

const calculateDistance = (c1: [number, number], c2: [number, number]) => {
  const R = 6371;
  const dLat = (c2[0] - c1[0]) * Math.PI / 180;
  const dLon = (c2[1] - c1[1]) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(c1[0] * Math.PI / 180) * Math.cos(c2[0] * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

const ClientView: React.FC<ClientViewProps> = ({ user, rides, settings, onCreateRide, onUpdateRide, adminToggle }) => {
  const [currentSubView, setCurrentSubView] = useState<'home' | 'history'>('home');
  const [historyFilter, setHistoryFilter] = useState<RideStatus | 'ALL'>('ALL');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [estimation, setEstimation] = useState<EstimationResult | null>(null);
  const [lastCompletedRide, setLastCompletedRide] = useState<Ride | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'MONEY' | 'PIX'>('PIX');
  
  const mapRef = useRef<any>(null);
  const pilotMarkerRef = useRef<any>(null);
  const prevRidesRef = useRef<Ride[]>([]);
  const prevStatusRef = useRef<RideStatus | null>(null);

  const activeRide = useMemo(() => 
    rides.find(r => r.status !== RideStatus.COMPLETED && r.status !== RideStatus.CANCELLED),
  [rides]);

  const driverETA = useMemo(() => {
    if (!activeRide || !activeRide.driverCurrentCoords) return null;
    if (activeRide.status === RideStatus.ACCEPTED && activeRide.originCoords) {
      const dist = calculateDistance(activeRide.driverCurrentCoords, activeRide.originCoords);
      return Math.max(1, Math.round(dist / 0.5));
    }
    if (activeRide.status === RideStatus.IN_PROGRESS && activeRide.destCoords) {
      const dist = calculateDistance(activeRide.driverCurrentCoords, activeRide.destCoords);
      return Math.max(1, Math.round(dist / 0.5));
    }
    return null;
  }, [activeRide?.driverCurrentCoords, activeRide?.status, activeRide?.originCoords, activeRide?.destCoords]);

  useEffect(() => {
    if (activeRide) {
      const currentStatus = activeRide.status;
      if (prevStatusRef.current && prevStatusRef.current !== currentStatus) {
        notificationService.playSound('status-change');
        let title = "Portal Fácil";
        let body = `Sua corrida está: ${currentStatus}`;
        if (currentStatus === RideStatus.ACCEPTED) {
          title = "Motorista à caminho! 🏍️";
          body = `${activeRide.driverName} aceitou seu pedido.`;
        } else if (currentStatus === RideStatus.COMPLETED) {
          title = "Viagem Concluída! ✓";
          body = "Você chegou ao destino.";
        }
        notificationService.send(title, body);
      }
      prevStatusRef.current = currentStatus;
    } else {
      prevStatusRef.current = null;
    }
  }, [activeRide?.status, activeRide?.id]);

  const stats = useMemo(() => {
    const completed = rides.filter(r => r.status === RideStatus.COMPLETED);
    const totalSpent = completed.reduce((acc, curr) => acc + (Number(curr.totalPrice) || 0), 0);
    return { count: completed.length, total: totalSpent };
  }, [rides]);

  useEffect(() => {
    const prevActive = prevRidesRef.current.find(r => r.status !== RideStatus.COMPLETED && r.status !== RideStatus.CANCELLED);
    if (prevActive) {
      const currentStatus = rides.find(r => r.id === prevActive.id);
      if (currentStatus && currentStatus.status === RideStatus.COMPLETED) {
        setLastCompletedRide(currentStatus);
      }
    }
    prevRidesRef.current = rides;
  }, [rides]);

  useEffect(() => {
    if (activeRide && activeRide.originCoords && activeRide.destCoords && (activeRide.status === RideStatus.ACCEPTED || activeRide.status === RideStatus.IN_PROGRESS)) {
      const timer = setTimeout(() => {
        const mapContainer = document.getElementById('map');
        if (mapContainer && !mapRef.current && (window as any).L) {
          const L = (window as any).L;
          const initialPos = activeRide.driverCurrentCoords || activeRide.originCoords!;
          const map = L.map('map', { zoomControl: false }).setView(initialPos, 14);
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
          const startIcon = L.divIcon({ html: `<div style="background-color: #F58220; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`, iconSize: [12, 12] });
          const endIcon = L.divIcon({ html: `<div style="background-color: #2E3192; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`, iconSize: [12, 12] });
          const pilotIcon = L.divIcon({ html: `<div style="background-color: #F58220; width: 24px; height: 24px; border-radius: 8px; border: 3px solid white; display: flex; align-items: center; justify-content: center;">🏍️</div>`, iconSize: [24, 24] });
          L.marker(activeRide.originCoords!, { icon: startIcon }).addTo(map);
          L.marker(activeRide.destCoords!, { icon: endIcon }).addTo(map);
          pilotMarkerRef.current = L.marker(initialPos, { icon: pilotIcon }).addTo(map);
          mapRef.current = map;
        }
      }, 300);
      return () => { if(mapRef.current) mapRef.current.remove(); mapRef.current = null; };
    }
  }, [activeRide?.id, activeRide?.status]);

  const handleUseMyLocation = () => {
    if (isLocating) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (addr) {
          setOrigin(addr);
        } else {
          setOrigin(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLocating(false);
      }
    }, (err) => {
      console.warn("Erro GPS:", err.message);
      setIsLocating(false);
      alert("Não foi possível acessar sua localização. Verifique as permissões do navegador.");
    }, { enableHighAccuracy: true });
  };

  const handleEstimate = async () => {
    if (!origin || !destination) return;
    setIsEstimating(true);
    setEstimation(null);

    try {
      // 1. Geocodifica as strings para coordenadas reais
      const oC = await geocodeAddress(origin);
      const dC = await geocodeAddress(destination);

      if (!oC || !dC) {
        alert("Não conseguimos localizar um dos endereços. Tente ser mais específico (Ex: Rua Nome, Número, Cidade).");
        setIsEstimating(false);
        return;
      }

      // 2. Chama o serviço de estimativa com as coordenadas garantidas
      const res = await estimateRideDetails(origin, destination, settings, {
        origin: [Number(oC[0]), Number(oC[1])],
        dest: [Number(dC[0]), Number(dC[1])]
      });
      
      setEstimation(res);
    } catch (e) { 
      console.error(e);
      alert("Houve um erro ao calcular o frete. Tente novamente.");
    } finally { 
      setIsEstimating(false); 
    }
  };

  const handleRequest = async () => {
    if (!estimation) return;
    setIsConfirming(true);
    
    const newRide: any = {
      clientId: String(user.id), 
      clientName: String(user.name), 
      origin: String(origin), 
      originFull: String(estimation.originFull),
      destination: String(destination), 
      destinationFull: String(estimation.destinationFull), 
      distanceKm: Number(estimation.distanceKm),
      totalPrice: Number(estimation.estimatedPrice), 
      commissionAmount: Number((estimation.estimatedPrice * settings.commissionPercent) / 100),
      status: RideStatus.PENDING, 
      createdAt: new Date().toISOString(), 
      originCoords: estimation.originCoords, 
      destCoords: estimation.destCoords,
      paymentMethod: paymentMethod
    };
    
    try {
      await onCreateRide(newRide as Ride);
      setShowSuccessOverlay(true);
      setTimeout(() => { 
        setShowSuccessOverlay(false); 
        setEstimation(null); 
        setOrigin(''); 
        setDestination(''); 
        setIsConfirming(false); 
      }, 2500);
    } catch (err) {
      alert("Erro ao criar pedido. Tente novamente.");
      setIsConfirming(false);
    }
  };

  if (isChatOpen && activeRide) return <ChatWidget ride={activeRide} user={user} onClose={() => setIsChatOpen(false)} />;

  // View de Histórico (resumida para o XML)
  if (currentSubView === 'history') {
    return (
      <div className="p-5 space-y-6 animate-fade-in dark:bg-slate-950 min-h-full">
        <header className="flex items-center gap-4">
          <button onClick={() => setCurrentSubView('home')} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-xl"><Icons.ChevronRight /></button>
          <h2 className="text-xl font-black uppercase italic">Histórico</h2>
        </header>
        <div className="space-y-4">
          {rides.filter(r => r.status === RideStatus.COMPLETED || r.status === RideStatus.CANCELLED).map(ride => (
            <div key={ride.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm">
              <p className="text-xs font-black truncate uppercase">{ride.destination}</p>
              <p className="text-[10px] text-gray-400">R$ {ride.totalPrice.toFixed(2)} - {ride.status}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6 animate-fade-in relative">
      {adminToggle && (
        <button onClick={adminToggle} className="w-full py-4 bg-brand-navy/10 text-brand-navy rounded-2xl flex items-center justify-center gap-2 border border-brand-navy/20">
          <Icons.Admin /> <span className="text-[10px] font-black uppercase">Voltar à Gestão</span>
        </button>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-brand-navy dark:text-slate-100">Olá, {user.name.split(' ')[0]}</h2>
          <p className="text-gray-400 font-medium text-sm">Onde vamos hoje?</p>
        </div>
        <div className="w-12 h-12 bg-brand-orange/10 rounded-2xl flex items-center justify-center border border-brand-orange/20 overflow-hidden shadow-inner dark:bg-slate-800">
          {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : <Icons.User />}
        </div>
      </div>

      {activeRide ? (
        <div className="bg-brand-navy dark:bg-slate-900 text-white rounded-[2.5rem] p-6 shadow-2xl space-y-4 border-b-8 border-brand-orange relative overflow-hidden transition-all">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${activeRide.status === RideStatus.PENDING ? 'bg-brand-orange text-brand-navy animate-pulse' : 'bg-green-500 text-white shadow-lg'}`}>
                {activeRide.status === RideStatus.PENDING ? 'Procurando Piloto...' : 'Motorista a Caminho'}
              </span>
              {driverETA !== null && <span className="text-[10px] font-black text-brand-orange uppercase animate-fade-in pl-1">Chegada em ~{driverETA} min</span>}
            </div>
            <span className="text-2xl font-black">R$ {activeRide.totalPrice.toFixed(2)}</span>
          </div>
          {(activeRide.status === RideStatus.ACCEPTED || activeRide.status === RideStatus.IN_PROGRESS) && (
            <div id="map" className="h-44 rounded-3xl overflow-hidden mt-2 border-2 border-white/10 shadow-inner"></div>
          )}
          {activeRide.status !== RideStatus.PENDING && (
            <div className="flex items-center gap-4 pt-4 border-t border-white/10">
               <div className="w-12 h-12 rounded-xl bg-brand-orange overflow-hidden border-2 border-white/20">
                 <img src={activeRide.driverPhoto || `https://ui-avatars.com/api/?name=${activeRide.driverName}`} className="w-full h-full object-cover" />
               </div>
               <div className="flex-1">
                 <p className="text-[10px] font-black text-brand-orange uppercase">Seu Piloto</p>
                 <p className="font-black text-white">{activeRide.driverName}</p>
               </div>
               <button onClick={() => setIsChatOpen(true)} className="p-3 bg-brand-orange text-brand-navy rounded-xl active:scale-95 transition-all"><Icons.Message /></button>
            </div>
          )}
          <button onClick={() => onUpdateRide(activeRide.id, { status: RideStatus.CANCELLED })} className="w-full py-4 bg-red-600 text-white font-black rounded-2xl text-[10px] uppercase border-b-4 border-red-800 active:scale-95 transition-all">Cancelar Corrida</button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 space-y-4 border border-gray-100 dark:border-slate-800">
          <div className="space-y-3">
             <div className="relative">
                <input type="text" placeholder="Local de saída" value={origin} onChange={e => setOrigin(e.target.value)} className="w-full p-4 pl-4 bg-gray-50 dark:bg-slate-800 rounded-2xl outline-none font-bold" />
                <button onClick={handleUseMyLocation} className={`absolute right-4 top-1/2 -translate-y-1/2 ${isLocating ? 'animate-spin' : 'text-brand-orange'}`}>
                  {isLocating ? '⏳' : '📍'}
                </button>
             </div>
             <input type="text" placeholder="Para onde?" value={destination} onChange={e => setDestination(e.target.value)} className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl outline-none font-bold" />
          </div>

          {estimation ? (
            <div className="bg-brand-orange/10 p-5 rounded-2xl border border-brand-orange/20 animate-pop space-y-4">
               <div className="flex justify-between items-center">
                 <p className="text-2xl font-black text-brand-navy">R$ {estimation.estimatedPrice.toFixed(2)}</p>
                 <p className="text-[10px] font-bold text-gray-400">{estimation.distanceKm} km</p>
               </div>
               <div className="space-y-2">
                 <p className="text-[9px] font-black text-brand-navy/60 uppercase tracking-widest pl-1">Forma de Pagamento</p>
                 <div className="flex gap-2">
                   {['PIX', 'MONEY'].map(m => (
                     <button key={m} onClick={() => setPaymentMethod(m as any)} className={`flex-1 py-4 rounded-xl text-[10px] font-black border-2 transition-all ${paymentMethod === m ? 'bg-brand-navy border-brand-navy text-white shadow-lg' : 'bg-white/50 text-gray-400 border-transparent'}`}>
                       {m === 'PIX' ? '📱 PIX' : '💵 Dinheiro'}
                     </button>
                   ))}
                 </div>
               </div>
               <button onClick={handleRequest} disabled={isConfirming} className="w-full py-5 bg-brand-orange text-brand-navy font-black rounded-2xl uppercase italic text-sm shadow-xl active:scale-95 transition-all">
                 {isConfirming ? 'Processando...' : 'Confirmar Pedido'}
               </button>
            </div>
          ) : (
            <button onClick={handleEstimate} disabled={!origin || !destination || isEstimating} className="w-full py-5 bg-brand-navy text-white font-black rounded-2xl shadow-xl uppercase italic disabled:opacity-50 active:scale-95 transition-all">
              {isEstimating ? 'Calculando Frete...' : 'Ver Preço da Viagem'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientView;
