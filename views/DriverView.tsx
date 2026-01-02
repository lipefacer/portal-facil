
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Ride, RideStatus } from '../types';
import { Icons } from '../constants';
import { notificationService } from '../notificationService';
import { nativeBridge } from '../nativeBridge';
import ChatWidget from '../components/ChatWidget';
import { ImpactStyle } from '@capacitor/haptics';

interface DriverViewProps {
  user: User;
  availableRides: Ride[];
  myRides: Ride[];
  onAcceptRide: (rideId: string) => void;
  onUpdateRide: (rideId: string, updates: Partial<Ride>) => void;
  onUpdateUser: (updated: User) => void;
  onLogout: () => void;
}

type PeriodFilter = 'today' | 'week' | 'month';

const DriverView: React.FC<DriverViewProps> = ({ user, availableRides, myRides, onAcceptRide, onUpdateRide, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'ops' | 'finance'>('ops');
  const [period, setPeriod] = useState<PeriodFilter>('week');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [processingRideId, setProcessingRideId] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const geoIntervalRef = useRef<number | null>(null);
  
  const [editName, setEditName] = useState(user.name);
  const [editPhone, setEditPhone] = useState(user.phone);
  const [editPlate, setEditPlate] = useState(user.motoPlate || '');
  const [editPix, setEditPix] = useState(user.pixKey || '');
  const [editAvatar, setEditAvatar] = useState(user.avatar || '');

  const activeRide = myRides.find(r => r.status === RideStatus.ACCEPTED || r.status === RideStatus.IN_PROGRESS);
  const completedRides = myRides.filter(r => r.status === RideStatus.COMPLETED);

  const financeData = useMemo(() => {
    const now = new Date();
    const filtered = completedRides.filter(ride => {
      const rideDate = new Date(ride.createdAt);
      if (period === 'today') return rideDate.toDateString() === now.toDateString();
      if (period === 'week') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        return rideDate >= sevenDaysAgo;
      }
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      return rideDate >= thirtyDaysAgo;
    });

    const gross = filtered.reduce((acc, curr) => acc + curr.totalPrice, 0);
    const net = filtered.reduce((acc, curr) => acc + (curr.totalPrice - curr.commissionAmount), 0);
    const chartGroups: Record<string, number> = {};
    filtered.forEach(ride => {
      const day = new Date(ride.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      chartGroups[day] = (chartGroups[day] || 0) + (ride.totalPrice - ride.commissionAmount);
    });

    const chartPoints = Object.entries(chartGroups)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return { filtered, gross, net, chartPoints };
  }, [completedRides, period]);

  // ROTA PONTE: Geolocalização Otimizada
  useEffect(() => {
    if (activeRide?.status === RideStatus.IN_PROGRESS || activeRide?.status === RideStatus.ACCEPTED) {
      const updateLocation = async () => {
        try {
          const pos = await nativeBridge.getCurrentPosition();
          onUpdateRide(activeRide.id, { 
            driverCurrentCoords: [pos.lat, pos.lng] 
          });
        } catch (e) { console.error("Bridge Location Error:", e); }
      };

      updateLocation();
      geoIntervalRef.current = window.setInterval(updateLocation, 5000);
    } else {
      if (geoIntervalRef.current) { clearInterval(geoIntervalRef.current); geoIntervalRef.current = null; }
    }
    return () => { if (geoIntervalRef.current) clearInterval(geoIntervalRef.current); };
  }, [activeRide?.id, activeRide?.status]);

  useEffect(() => {
    if (activeRide && activeRide.originCoords && activeRide.destCoords) {
      const timer = setTimeout(() => {
        const mapContainer = document.getElementById('driver-map');
        if (mapContainer && !mapRef.current && (window as any).L) {
          const L = (window as any).L;
          const map = L.map('driver-map', { zoomControl: false }).setView(activeRide.originCoords!, 14);
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);

          const pickupIcon = L.divIcon({ html: `<div style="background-color: #F58220; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white;"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
          const deliveryIcon = L.divIcon({ html: `<div style="background-color: #2E3192; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white;"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
          const motorIcon = L.divIcon({ html: `<div class="bg-brand-navy p-1.5 rounded-lg border-2 border-white text-white shadow-xl animate-bounce">🏍️</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });

          L.marker(activeRide.originCoords!, { icon: pickupIcon }).addTo(map);
          L.marker(activeRide.destCoords!, { icon: deliveryIcon }).addTo(map);
          if (activeRide.driverCurrentCoords) driverMarkerRef.current = L.marker(activeRide.driverCurrentCoords, { icon: motorIcon }).addTo(map);
          
          L.polyline([activeRide.originCoords, activeRide.destCoords], { color: '#2E3192', weight: 3, opacity: 0.4, dashArray: '5, 5' }).addTo(map);
          mapRef.current = map;
        }
      }, 300);
      return () => { if(mapRef.current) { mapRef.current.remove(); mapRef.current = null; driverMarkerRef.current = null; } };
    }
  }, [activeRide?.id]);

  const handleToggleOnline = async () => {
    if (!user.isOnline) {
      const granted = await notificationService.requestPermission();
      if (granted && nativeBridge.vibrate) await nativeBridge.vibrate(ImpactStyle.Medium);
    }
    onUpdateUser({ ...user, isOnline: !user.isOnline });
  };

  const handleAccept = async (rideId: string) => {
    setProcessingRideId(rideId);
    await nativeBridge.vibrate(ImpactStyle.Heavy);
    await onAcceptRide(rideId);
    setProcessingRideId(null);
  };

  const handleUpdateStatus = async () => {
    if (!activeRide) return;
    setIsUpdatingStatus(true);
    await nativeBridge.vibrate(ImpactStyle.Medium);
    const nextStatus = activeRide.status === RideStatus.ACCEPTED ? RideStatus.IN_PROGRESS : RideStatus.COMPLETED;
    await onUpdateRide(activeRide.id, { status: nextStatus });
    if (nextStatus === RideStatus.COMPLETED) {
      setShowSuccessOverlay(true);
      setTimeout(() => setShowSuccessOverlay(false), 3000);
    }
    setIsUpdatingStatus(false);
  };

  const renderOperations = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-brand-navy dark:bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-xl border-b-8 border-brand-orange">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center overflow-hidden border-2 border-white/20 shadow-lg relative">
              {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : <Icons.User />}
            </div>
            <div>
              <h2 className="text-xl font-black italic uppercase leading-none">{user.name.split(' ')[0]}</h2>
              <p className="text-[10px] font-black text-brand-orange tracking-widest uppercase mt-2">{user.motoPlate || 'MOTO-PRO'}</p>
            </div>
          </div>
          <button onClick={() => setIsEditingProfile(true)} className="p-3 bg-white/10 rounded-2xl hover:bg-white/20 transition-all border border-white/10"><Icons.Admin /></button>
        </div>
        <button onClick={handleToggleOnline} className={`w-full py-4 rounded-2xl text-[10px] font-black transition-all uppercase tracking-[0.2em] shadow-lg ${user.isOnline ? 'bg-brand-orange text-brand-navy' : 'bg-white/10 text-white border border-white/20'}`}>
          {user.isOnline ? '● PORTAL ATIVO / ONLINE' : '○ FICAR DISPONÍVEL'}
        </button>
      </div>

      {activeRide ? (
        <div className="bg-brand-orange rounded-[2.5rem] p-6 shadow-2xl space-y-4 border-b-8 border-brand-navy transition-all animate-pop">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-brand-navy uppercase bg-white/40 px-4 py-2 rounded-full tracking-widest">{activeRide.status === RideStatus.ACCEPTED ? 'Buscando Passageiro' : 'Viagem em Curso'}</span>
            <span className="text-3xl font-black text-brand-navy">R$ {activeRide.totalPrice.toFixed(2)}</span>
          </div>
          <div className="relative">
            <div id="driver-map" className="h-72 rounded-3xl overflow-hidden border-4 border-white/30 dark:border-slate-800 shadow-inner bg-gray-200"></div>
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-[2]">
              <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${activeRide.status === RideStatus.ACCEPTED ? activeRide.originCoords![0] : activeRide.destCoords![0]},${activeRide.status === RideStatus.ACCEPTED ? activeRide.originCoords![1] : activeRide.destCoords![1]}`, '_blank')} className="bg-brand-navy text-white p-4 rounded-2xl shadow-xl border border-white/20"><Icons.Map /></button>
              <button onClick={() => setIsChatOpen(true)} className="bg-white text-brand-navy p-4 rounded-2xl shadow-xl border border-brand-navy/10"><Icons.Message /></button>
            </div>
          </div>
          <div className="bg-white/30 dark:bg-slate-800/30 p-5 rounded-3xl flex justify-between items-center">
            <div className="flex-1">
              <p className="text-[9px] font-black text-brand-navy/60 uppercase tracking-widest">Passageiro</p>
              <p className="text-xl font-black text-brand-navy dark:text-white leading-none mt-1">{activeRide.clientName}</p>
              {activeRide.paymentMethod && <div className="mt-3 inline-flex items-center gap-1.5 bg-brand-navy text-white px-3 py-1.5 rounded-xl border border-white/10 shadow-sm"><span className="text-[9px] font-black uppercase tracking-tight">Pagamento:</span><span className="text-[10px] font-black uppercase italic text-brand-orange">{activeRide.paymentMethod === 'PIX' ? '📱 PIX' : '💵 Dinheiro'}</span></div>}
            </div>
          </div>
          <button onClick={handleUpdateStatus} disabled={isUpdatingStatus} className="w-full py-6 bg-brand-navy dark:bg-slate-950 text-white font-black rounded-2xl shadow-xl uppercase italic tracking-[0.1em] text-sm border-b-4 border-white/20 flex items-center justify-center gap-3">{isUpdatingStatus ? <span className="loader-ring"></span> : (activeRide.status === RideStatus.ACCEPTED ? 'CHEGUEI / INICIAR' : 'CHEGAMOS / CONCLUIR')}</button>
        </div>
      ) : (
        <div className="space-y-5">
          <h3 className="font-black text-brand-navy dark:text-slate-300 uppercase text-xs tracking-widest px-2">Chamadas na Região</h3>
          {!user.isOnline ? (
            <div className="bg-gray-100 dark:bg-slate-900 border-4 border-dashed border-gray-200 dark:border-slate-800 rounded-[2.5rem] p-12 text-center">
              <p className="text-gray-400 dark:text-slate-600 text-[10px] font-black uppercase tracking-widest leading-loose">Fique online para<br/>receber pedidos</p>
            </div>
          ) : availableRides.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] p-12 text-center space-y-5">
              <div className="w-14 h-14 bg-brand-orange/10 text-brand-orange rounded-full flex items-center justify-center mx-auto animate-bounce-soft"><Icons.Motorcycle /></div>
              <p className="text-gray-400 dark:text-slate-500 text-[9px] font-black uppercase tracking-[0.2em]">Buscando passageiros...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {availableRides.map(ride => (
                <div key={ride.id} className="bg-white dark:bg-slate-900 border-2 border-gray-50 dark:border-slate-800 rounded-[2.5rem] p-6 shadow-xl border-l-8 border-brand-orange space-y-4 animate-slide-up">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex flex-col gap-1"><p className="font-black text-brand-navy dark:text-slate-100 uppercase text-xl leading-none">{ride.clientName.split(' ')[0]}</p>{ride.paymentMethod && <span className="text-[9px] font-black text-brand-orange uppercase tracking-widest mt-1">{ride.paymentMethod === 'PIX' ? '📱 PAGAMENTO VIA PIX' : '💵 PAGAMENTO EM DINHEIRO'}</span>}</div>
                      <div className="mt-4 space-y-2 relative pl-4 border-l-2 border-dashed border-brand-orange/30"><div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-brand-orange"></div><p className="text-[10px] font-black text-brand-navy dark:text-slate-300 uppercase truncate italic pr-2"><span className="text-gray-400">SAÍDA:</span> {ride.origin.split(',')[0]}</p><div className="absolute -left-[5px] bottom-0 w-2 h-2 rounded-full bg-brand-navy dark:bg-white"></div><p className="text-[10px] font-black text-brand-navy dark:text-slate-300 uppercase truncate italic pr-2"><span className="text-gray-400">DESTINO:</span> {ride.destination.split(',')[0]}</p></div>
                      <p className="text-[10px] font-black text-brand-orange mt-3 tracking-widest bg-brand-orange/10 inline-block px-3 py-1 rounded-full">{ride.distanceKm.toFixed(1)} KM • ESTIMADO</p>
                    </div>
                    <p className="text-2xl font-black text-brand-navy dark:text-slate-100 leading-none">R$ {ride.totalPrice.toFixed(2)}</p>
                  </div>
                  <button onClick={() => handleAccept(ride.id)} disabled={processingRideId === ride.id} className="w-full py-5 bg-brand-navy dark:bg-slate-100 dark:text-brand-navy text-white font-black rounded-2xl shadow-xl uppercase italic text-sm border-b-4 border-brand-orange">{processingRideId === ride.id ? <span className="loader-ring"></span> : 'ACEITAR CHAMADA'}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-5 space-y-6 pb-24">
      {showSuccessOverlay && (
        <div className="fixed inset-0 z-[100] bg-brand-navy/90 flex flex-col items-center justify-center text-white animate-fade-in backdrop-blur-sm">
          <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center animate-bounce shadow-2xl mb-6"><Icons.Check /></div>
          <h2 className="text-3xl font-black uppercase italic tracking-tighter">Corrida Concluída!</h2>
        </div>
      )}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setActiveTab('ops')} className={`flex-1 py-4 px-6 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'ops' ? 'bg-brand-navy text-white shadow-xl scale-105' : 'bg-white dark:bg-slate-900 text-gray-400 border border-gray-100 dark:border-slate-800'}`}>Operação</button>
        <button onClick={() => setActiveTab('finance')} className={`flex-1 py-4 px-6 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'finance' ? 'bg-brand-navy text-white shadow-xl scale-105' : 'bg-white dark:bg-slate-900 text-gray-400 border border-gray-100 dark:border-slate-800'}`}>Financeiro</button>
      </div>
      {activeTab === 'ops' ? renderOperations() : <div className="p-10 text-center text-gray-400 uppercase font-black text-xs">Histórico Financeiro Carregando...</div>}
    </div>
  );
};

export default DriverView;
