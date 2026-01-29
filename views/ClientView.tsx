
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Ride, RideStatus, AppSettings, UserRole } from '../types';
import { Icons } from '../constants';
import { estimateRideDetails, EstimationResult } from '../geminiService';
import ChatWidget from '../components/ChatWidget';
import { doc, updateDoc, db } from '../firebase';
import { notificationService } from '../notificationService';

interface ClientViewProps {
  user: User;
  rides: Ride[];
  settings: AppSettings;
  onCreateRide: (ride: Ride) => Promise<string>;
  onUpdateRide: (rideId: string, updates: Partial<Ride>) => Promise<void>;
  onLogout: () => void;
  adminToggle?: () => void;
}

const geocodeAddress = async (address: string): Promise<[number, number] | null> => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
    const data = await response.json();
    if (data && data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch (err) { console.error(err); }
  return null;
};

const reverseGeocode = async (lat: number, lon: number): Promise<string | null> => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    const data = await response.json();
    if (data?.display_name) return data.display_name.split(',').slice(0, 3).join(',').trim();
  } catch (err) { console.error(err); }
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

  // Cálculo de ETA em tempo real
  const driverETA = useMemo(() => {
    if (!activeRide || !activeRide.driverCurrentCoords) return null;
    
    // Se o motorista aceitou, calculamos o tempo até a ORIGEM
    if (activeRide.status === RideStatus.ACCEPTED && activeRide.originCoords) {
      const dist = calculateDistance(activeRide.driverCurrentCoords, activeRide.originCoords);
      return Math.max(1, Math.round(dist / 0.5)); // 30km/h aprox 0.5km/min
    }
    
    // Se a corrida está em curso, calculamos o tempo até o DESTINO
    if (activeRide.status === RideStatus.IN_PROGRESS && activeRide.destCoords) {
      const dist = calculateDistance(activeRide.driverCurrentCoords, activeRide.destCoords);
      return Math.max(1, Math.round(dist / 0.5));
    }
    
    return null;
  }, [activeRide?.driverCurrentCoords, activeRide?.status, activeRide?.originCoords, activeRide?.destCoords]);

  // Lógica de Notificações para o Cliente
  useEffect(() => {
    if (activeRide) {
      const currentStatus = activeRide.status;
      if (prevStatusRef.current && prevStatusRef.current !== currentStatus) {
        notificationService.playSound('status-change');
        
        let title = "Atualização de Corrida";
        let body = `Sua corrida agora está: ${currentStatus}`;

        if (currentStatus === RideStatus.ACCEPTED) {
          title = "Motorista à caminho! 🏍️";
          body = `${activeRide.driverName} aceitou seu pedido.`;
        } else if (currentStatus === RideStatus.IN_PROGRESS) {
          title = "Viagem Iniciada! ⚡";
          body = "Aproveite a viagem.";
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

  const filteredHistory = useMemo(() => {
    return rides.filter(r => {
      const matchesStatus = historyFilter === 'ALL' || r.status === historyFilter;
      const isPast = r.status === RideStatus.COMPLETED || r.status === RideStatus.CANCELLED;
      return matchesStatus && isPast;
    });
  }, [rides, historyFilter]);

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
          
          const startIcon = L.divIcon({ html: `<div style="background-color: #F58220; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] });
          const endIcon = L.divIcon({ html: `<div style="background-color: #2E3192; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] });
          const pilotIcon = L.divIcon({ html: `<div style="background-color: #F58220; width: 24px; height: 24px; border-radius: 8px; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-size: 14px;">🏍️</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
          
          L.marker(activeRide.originCoords!, { icon: startIcon }).addTo(map);
          L.marker(activeRide.destCoords!, { icon: endIcon }).addTo(map);
          pilotMarkerRef.current = L.marker(initialPos, { icon: pilotIcon }).addTo(map);
          mapRef.current = map;
        }
      }, 300);
      return () => { 
        if(mapRef.current) mapRef.current.remove(); 
        mapRef.current = null; 
      };
    }
  }, [activeRide?.id, activeRide?.status]);

  useEffect(() => {
    if (mapRef.current && pilotMarkerRef.current && activeRide?.driverCurrentCoords) {
      pilotMarkerRef.current.setLatLng(activeRide.driverCurrentCoords);
    }
  }, [activeRide?.driverCurrentCoords]);

  const handleUseMyLocation = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      setOrigin(addr || `${pos.coords.latitude}, ${pos.coords.longitude}`);
      setIsLocating(false);
    }, () => setIsLocating(false));
  };

  const handleEstimate = async () => {
    setIsEstimating(true);
    try {
      const res = await estimateRideDetails(origin, destination, settings);
      const oC = await geocodeAddress(res.originFull);
      const dC = await geocodeAddress(res.destinationFull);
      
      setEstimation({ 
        ...res, 
        originCoords: oC ? [Number(oC[0]), Number(oC[1])] : null, 
        destCoords: dC ? [Number(dC[0]), Number(dC[1])] : null 
      });
    } catch (e) { console.error(e); }
    finally { setIsEstimating(false); }
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
      originCoords: estimation.originCoords ? [Number(estimation.originCoords[0]), Number(estimation.originCoords[1])] : null, 
      destCoords: estimation.destCoords ? [Number(estimation.destCoords[0]), Number(estimation.destCoords[1])] : null,
      paymentMethod: paymentMethod
    };
    
    await onCreateRide(newRide as Ride);
    setShowSuccessOverlay(true);
    setTimeout(() => { 
      setShowSuccessOverlay(false); 
      setEstimation(null); 
      setOrigin(''); 
      setDestination(''); 
      setIsConfirming(false); 
    }, 2500);
  };

  if (isChatOpen && activeRide) return <ChatWidget ride={activeRide} user={user} onClose={() => setIsChatOpen(false)} />;

  if (currentSubView === 'history') {
    return (
      <div className="p-5 space-y-6 animate-fade-in dark:bg-slate-950 min-h-full">
        <header className="flex items-center gap-4">
          <button 
            onClick={() => setCurrentSubView('home')} 
            className="p-2 bg-gray-100 dark:bg-slate-800 rounded-xl text-brand-navy dark:text-slate-100 active:scale-90 transition-transform"
          >
            <Icons.ChevronRight /> 
          </button>
          <div>
            <h2 className="text-xl font-black text-brand-navy dark:text-slate-100 uppercase italic leading-none">Minhas Viagens</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Histórico completo</p>
          </div>
        </header>

        <div className="bg-brand-navy dark:bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden border-b-4 border-brand-orange">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-brand-orange/10 rounded-full blur-2xl"></div>
          <p className="text-[9px] font-black text-brand-orange uppercase tracking-widest opacity-80">Investimento em Mobilidade</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-sm font-bold opacity-60">R$</span>
            <span className="text-3xl font-black italic">{stats.total.toFixed(2)}</span>
          </div>
          <div className="mt-3 text-[9px] font-bold uppercase opacity-60">{stats.count} Viagens Realizadas</div>
        </div>

        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800">
          {(['ALL', RideStatus.COMPLETED, RideStatus.CANCELLED] as (RideStatus | 'ALL')[]).map(f => (
            <button
              key={f}
              onClick={() => setHistoryFilter(f)}
              className={`flex-1 py-2.5 text-[8px] font-black uppercase rounded-xl transition-all ${historyFilter === f ? 'bg-white dark:bg-slate-800 text-brand-orange shadow-md' : 'text-gray-400'}`}
            >
              {f === 'ALL' ? 'Todas' : f === RideStatus.COMPLETED ? 'Concluídas' : 'Canceladas'}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {filteredHistory.length === 0 ? (
            <div className="py-20 text-center space-y-3 opacity-20">
              <Icons.History />
              <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma viagem encontrada</p>
            </div>
          ) : (
            filteredHistory.map(ride => (
              <div key={ride.id} className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-gray-100 dark:border-slate-800 shadow-sm space-y-4 animate-slide-up">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${ride.status === RideStatus.COMPLETED ? 'bg-green-50 text-green-600 dark:bg-green-900/20' : 'bg-red-50 text-red-400 dark:bg-red-900/20'}`}>
                      {ride.status === RideStatus.COMPLETED ? '✓' : '✕'}
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-brand-navy dark:text-slate-200 uppercase">{new Date(ride.createdAt).toLocaleDateString('pt-BR')}</p>
                      <p className="text-[8px] font-bold text-gray-400 uppercase">{new Date(ride.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  <p className="text-sm font-black text-brand-navy dark:text-slate-100">R$ {ride.totalPrice.toFixed(2)}</p>
                </div>
                
                <div className="space-y-1 relative pl-4 border-l-2 border-dashed border-gray-100 dark:border-slate-800 ml-4">
                  <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-brand-orange"></div>
                  <p className="text-[9px] font-black text-brand-navy dark:text-slate-300 truncate uppercase">{ride.origin.split(',')[0]}</p>
                  <div className="absolute -left-[5px] bottom-0 w-2 h-2 rounded-full bg-brand-navy dark:bg-white"></div>
                  <p className="text-[9px] font-black text-brand-navy dark:text-slate-300 truncate uppercase">{ride.destination.split(',')[0]}</p>
                </div>

                {ride.driverName && (
                  <div className="pt-3 border-t border-gray-50 dark:border-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-brand-orange/10 flex items-center justify-center overflow-hidden">
                        <img src={ride.driverPhoto || `https://ui-avatars.com/api/?name=${ride.driverName}`} className="w-full h-full object-cover" />
                      </div>
                      <p className="text-[9px] font-bold text-gray-500 uppercase">Piloto: {ride.driverName}</p>
                    </div>
                    {ride.rating && <span className="text-[10px] font-black text-brand-orange">★ {ride.rating}</span>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6 animate-fade-in relative">
      {adminToggle && (
        <button 
          onClick={adminToggle}
          className="w-full py-4 bg-brand-navy/10 text-brand-navy rounded-2xl flex items-center justify-center gap-2 border border-brand-navy/20 animate-pop"
        >
          <Icons.Admin />
          <span className="text-[10px] font-black uppercase">Voltar à Gestão</span>
        </button>
      )}

      {lastCompletedRide && (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-2xl border border-gray-100 dark:border-slate-800 text-center space-y-4">
           <h2 className="text-xl font-black text-brand-navy uppercase italic">Viagem Concluída!</h2>
           <p className="text-[10px] font-bold text-gray-400">Como foi seu piloto {lastCompletedRide.driverName}?</p>
           <div className="flex justify-center gap-3 py-2">
             {[1,2,3,4,5].map(s => (
               <button key={s} onClick={() => setLastCompletedRide(null)} className="text-2xl hover:scale-125 transition-transform">⭐</button>
             ))}
           </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-brand-navy dark:text-slate-100">Olá, {user.name.split(' ')[0]}</h2>
          <p className="text-gray-400 font-medium text-sm">Onde vamos hoje?</p>
        </div>
        <div className="w-12 h-12 bg-brand-orange/10 rounded-2xl flex items-center justify-center text-brand-orange border border-brand-orange/20 overflow-hidden shadow-inner dark:bg-slate-800">
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
              {driverETA !== null && (
                <span className="text-[10px] font-black text-brand-orange uppercase animate-fade-in pl-1">
                  Chegada em ~{driverETA} min
                </span>
              )}
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
                 {activeRide.paymentMethod && <p className="text-[8px] font-bold opacity-60 uppercase mt-0.5">Pagamento: {activeRide.paymentMethod === 'PIX' ? '📱 PIX' : '💵 Dinheiro'}</p>}
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
                <button onClick={handleUseMyLocation} className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-orange">📍</button>
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
                   <button 
                     onClick={() => setPaymentMethod('PIX')}
                     className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase transition-all flex flex-col items-center justify-center gap-1 border-2 ${paymentMethod === 'PIX' ? 'bg-brand-navy border-brand-navy text-white shadow-lg' : 'bg-white/50 text-gray-400 border-transparent hover:border-brand-navy/10'}`}
                   >
                     <span className="text-lg">📱</span>
                     <span>PIX</span>
                   </button>
                   <button 
                     onClick={() => setPaymentMethod('MONEY')}
                     className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase transition-all flex flex-col items-center justify-center gap-1 border-2 ${paymentMethod === 'MONEY' ? 'bg-brand-navy border-brand-navy text-white shadow-lg' : 'bg-white/50 text-gray-400 border-transparent hover:border-brand-navy/10'}`}
                   >
                     <span className="text-lg">💵</span>
                     <span>Dinheiro</span>
                   </button>
                 </div>
               </div>
               
               {estimation.appliedFees && estimation.appliedFees.length > 0 && (
                 <div className="space-y-1">
                    {estimation.appliedFees.map((fee, idx) => (
                      <p key={idx} className="text-[8px] font-black text-brand-navy/60 uppercase italic">{fee}</p>
                    ))}
                 </div>
               )}

               <button onClick={handleRequest} className="w-full py-5 bg-brand-orange text-brand-navy font-black rounded-2xl uppercase italic text-sm shadow-xl active:scale-95 transition-all hover:brightness-105">Confirmar Pedido</button>
            </div>
          ) : (
            <button onClick={handleEstimate} disabled={!origin || !destination || isEstimating} className="w-full py-5 bg-brand-navy text-white font-black rounded-2xl shadow-xl uppercase italic disabled:opacity-50 active:scale-95 transition-all">
              {isEstimating ? 'Calculando...' : 'Pedir Mototáxi'}
            </button>
          )}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-black text-brand-navy dark:text-slate-300 uppercase text-xs tracking-widest">Atividades Recentes</h3>
          <button 
            onClick={() => setCurrentSubView('history')}
            className="text-[10px] font-black text-brand-orange uppercase tracking-tighter flex items-center gap-1 hover:underline"
          >
            Ver Tudo <Icons.ChevronRight />
          </button>
        </div>
        {rides.length === 0 ? (
          <div className="bg-white/50 dark:bg-slate-900 border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-[2rem] py-12 text-center">
            <p className="text-gray-300 dark:text-slate-600 font-bold uppercase text-[10px] tracking-widest">Nenhuma corrida registrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rides.filter(r => r.status === RideStatus.COMPLETED || r.status === RideStatus.CANCELLED).slice(0, 3).map(ride => (
              <div key={ride.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 flex justify-between items-center shadow-sm animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-slate-800 flex items-center justify-center text-brand-navy/30"><Icons.History /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-brand-navy dark:text-slate-200 truncate pr-2 uppercase italic">{ride.destination.split(',')[0]}</p>
                    <p className="text-[8px] font-bold text-gray-400 uppercase">{new Date(ride.createdAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-brand-orange">R$ {ride.totalPrice.toFixed(2)}</p>
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${ride.status === RideStatus.COMPLETED ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-50 text-red-400'}`}>
                    {ride.status === RideStatus.COMPLETED ? 'Finalizada' : 'Cancelada'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientView;
