
import React, { useState } from 'react';
import { Ride, RideStatus } from '../types';
import { Icons } from '../constants';

interface ModeratorViewProps {
  allRides: Ride[];
  onLogout: () => void;
  onSwitchToProfile: () => void;
}

const ModeratorView: React.FC<ModeratorViewProps> = ({ allRides, onLogout, onSwitchToProfile }) => {
  const [filter, setFilter] = useState<RideStatus | 'ALL'>('ALL');

  const filteredRides = filter === 'ALL' ? allRides : allRides.filter(r => r.status === filter);

  return (
    <div className="p-5 space-y-6 animate-fade-in dark:bg-slate-950 min-h-full pb-10">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-brand-navy dark:text-slate-100 uppercase italic leading-tight">Moderador</h2>
          <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Supervisão de Corridas</p>
        </div>
        <button 
          onClick={onSwitchToProfile}
          className="p-3 bg-brand-navy/10 text-brand-navy dark:text-slate-100 rounded-2xl border border-brand-navy/20 flex items-center gap-2"
        >
          <Icons.User />
          <span className="text-[10px] font-black uppercase">Meu Perfil</span>
        </button>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {['ALL', RideStatus.PENDING, RideStatus.IN_PROGRESS, RideStatus.COMPLETED, RideStatus.CANCELLED].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s as any)}
            className={`px-4 py-2 rounded-full text-[8px] font-black uppercase whitespace-nowrap transition-all border ${filter === s ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white dark:bg-slate-900 text-gray-400 border-gray-100 dark:border-slate-800'}`}
          >
            {s === 'ALL' ? 'Todas' : s}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredRides.length === 0 ? (
          <div className="py-20 text-center opacity-20 font-black uppercase text-xs">Nenhuma corrida encontrada</div>
        ) : (
          filteredRides.map(ride => (
            <div key={ride.id} className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-gray-100 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${ride.status === RideStatus.COMPLETED ? 'bg-green-100 text-green-600' : 'bg-brand-orange/10 text-brand-orange'}`}>
                  {ride.status}
                </span>
                <p className="text-sm font-black text-brand-navy dark:text-slate-100">R$ {ride.totalPrice.toFixed(2)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-brand-navy dark:text-slate-200 truncate uppercase"><span className="text-gray-400">De:</span> {ride.origin.split(',')[0]}</p>
                <p className="text-[10px] font-black text-brand-navy dark:text-slate-200 truncate uppercase"><span className="text-gray-400">Para:</span> {ride.destination.split(',')[0]}</p>
              </div>
              <div className="pt-2 border-t border-gray-50 dark:border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-2">
                   <div className="w-6 h-6 rounded-full bg-brand-orange/20 flex items-center justify-center text-[10px]">👤</div>
                   <p className="text-[9px] font-bold text-gray-500">{ride.clientName}</p>
                </div>
                {ride.driverName && (
                  <div className="flex items-center gap-2">
                    <p className="text-[9px] font-bold text-gray-500">{ride.driverName}</p>
                    <div className="w-6 h-6 rounded-full bg-brand-navy/20 flex items-center justify-center text-[10px]">🏍️</div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ModeratorView;
