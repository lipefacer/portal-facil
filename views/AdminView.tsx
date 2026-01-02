
import React, { useState, useEffect } from 'react';
import { Ride, RideStatus, AppSettings, User, UserRole, CustomFee } from '../types';
import { Icons } from '../constants';
import { db, collection, onSnapshot, doc, updateDoc, setDoc, deleteDoc, query, limit } from '../firebase';

interface AdminViewProps {
  user: User;
  allRides: Ride[];
  settings: AppSettings;
  onUpdateSettings: (s: AppSettings) => void;
  onLogout: () => void;
  onSwitchToProfile: () => void;
  isSupremeAdmin?: boolean;
}

const AdminView: React.FC<AdminViewProps> = ({ user, allRides, settings, onUpdateSettings, onLogout, onSwitchToProfile, isSupremeAdmin }) => {
  const [activeTab, setActiveTab] = useState<'staff' | 'users' | 'extra_fees' | 'financial' | 'rides_history'>('staff');
  const [users, setUsers] = useState<User[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveAnimation, setShowSaveAnimation] = useState(false);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);

  // Estados Financeiros Locais
  const [newBaseFare, setNewBaseFare] = useState(settings.baseFare || 0);
  const [newPerKmRate, setNewPerKmRate] = useState(settings.perKmRate || 0);
  const [newCommissionPercent, setNewCommissionPercent] = useState(settings.commissionPercent || 0);
  const [newDevPercent, setNewDevPercent] = useState(settings.devCommissionPercent || 0);
  const [newPartnerPercent, setNewPartnerPercent] = useState(settings.partnerCommissionPercent || 0);

  // Estados para Taxa por Horário
  const [startHour, setStartHour] = useState<number>(20);
  const [endHour, setEndHour] = useState<number>(6);
  const [feeValue, setFeeValue] = useState<string>('2.00');

  const totalPortalCommission = allRides
    .filter(r => r.status === RideStatus.COMPLETED)
    .reduce((acc, curr) => acc + (Number(curr.commissionAmount) || 0), 0);

  const totalDevCommission = (totalPortalCommission * newDevPercent) / 100;
  const totalPartnerCommission = (totalPortalCommission * newPartnerPercent) / 100;

  useEffect(() => {
    const q = query(collection(db, "users"), limit(50));
    const unsub = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User)));
      setLoadingUsers(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "admins"));
    const unsub = onSnapshot(q, (snapshot) => {
      setStaff(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const handleUpdateStaffRole = async (userId: string, newRole: UserRole) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    try {
      const adminDocRef = doc(db, "admins", userId);
      if (newRole === UserRole.ADMIN || newRole === UserRole.MODERATOR) {
        await setDoc(adminDocRef, {
          userId: userId,
          name: String(targetUser.name),
          phone: String(targetUser.phone),
          role: newRole,
          updatedAt: new Date().toISOString()
        });
      } else {
        await deleteDoc(adminDocRef);
      }
      setShowSaveAnimation(true);
      setTimeout(() => setShowSaveAnimation(false), 1200);
    } catch (e) {
      console.error(e);
      alert("Erro ao gravar permissões.");
    }
  };

  const handleToggleBlock = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "users", userId), { isBlocked: !currentStatus });
    } catch (e) {
      console.error(e);
      alert("Erro ao alterar bloqueio.");
    }
  };

  const handleSaveSettings = async (customFeesOverride?: CustomFee[]) => {
    setIsSaving(true);
    // Criação de objeto estritamente limpo e serializável
    const cleanSettings: AppSettings = {
      baseFare: Number(newBaseFare),
      perKmRate: Number(newPerKmRate),
      commissionPercent: Number(newCommissionPercent),
      devCommissionPercent: Number(newDevPercent),
      partnerCommissionPercent: Number(newPartnerPercent),
      customFees: (customFeesOverride || settings.customFees || []).map(f => ({
        id: String(f.id),
        reason: String(f.reason),
        value: Number(f.value),
        type: f.type,
        startHour: f.startHour !== undefined ? Number(f.startHour) : undefined,
        endHour: f.endHour !== undefined ? Number(f.endHour) : undefined,
        enabled: Boolean(f.enabled)
      }))
    };
    
    try {
      await onUpdateSettings(cleanSettings);
      setShowSaveAnimation(true);
      setTimeout(() => setShowSaveAnimation(false), 1500);
    } catch (e) {
      console.error("Erro ao salvar settings:", e);
      alert("Erro ao salvar configurações.");
    } finally {
      setIsSaving(false);
    }
  };

  const sortedRides = [...allRides].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="p-5 space-y-6 animate-fade-in dark:bg-slate-950 min-h-full pb-10">
      {/* Modal de Detalhes da Corrida */}
      {selectedRide && (
        <div className="fixed inset-0 z-[300] bg-brand-navy/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[3rem] overflow-hidden shadow-2xl border-4 border-brand-orange/20 animate-pop">
            <div className="bg-brand-orange p-6 flex justify-between items-center">
              <h3 className="font-black text-brand-navy uppercase italic text-sm tracking-tighter">Detalhes da Corrida</h3>
              <button onClick={() => setSelectedRide(null)} className="p-2 bg-brand-navy/10 rounded-full text-brand-navy hover:bg-brand-navy/20 transition-all">
                <Icons.Trash />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Motorista</p>
                  <p className="text-xs font-black text-brand-navy dark:text-white uppercase italic truncate">{selectedRide.driverName || 'NÃO ATRIBUÍDO'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Placa</p>
                  <p className="text-xs font-black text-brand-orange uppercase">{selectedRide.driverPlate || '----'}</p>
                </div>
              </div>
              
              <div className="space-y-1">
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Cliente</p>
                <p className="text-xs font-black text-brand-navy dark:text-white uppercase italic truncate">{selectedRide.clientName}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Horário</p>
                  <p className="text-xs font-black text-brand-navy dark:text-white uppercase">
                    {new Date(selectedRide.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Pagamento</p>
                  <p className="text-xs font-black text-green-600 uppercase">PIX / DINHEIRO</p>
                </div>
              </div>

              <div className="space-y-1 pt-2 border-t dark:border-slate-800">
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Destino</p>
                <p className="text-[10px] font-bold text-gray-500 truncate uppercase">{selectedRide.destination}</p>
              </div>

              <div className="flex justify-between items-center bg-gray-50 dark:bg-slate-800 p-4 rounded-2xl">
                <div className="space-y-0.5">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Status</p>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${selectedRide.status === RideStatus.COMPLETED ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {selectedRide.status}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Valor Total</p>
                  <p className="text-xl font-black text-brand-navy dark:text-white italic">R$ {(Number(selectedRide.totalPrice) || 0).toFixed(2)}</p>
                </div>
              </div>

              <button onClick={() => setSelectedRide(null)} className="w-full py-4 bg-brand-navy text-white font-black rounded-2xl uppercase italic text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">Fechar Detalhes</button>
            </div>
          </div>
        </div>
      )}

      {showSaveAnimation && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-brand-navy/90 backdrop-blur-sm animate-fade-in">
           <div className="text-center space-y-3 animate-pop p-8 bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl border-4 border-brand-orange/20">
              <div className="w-16 h-16 bg-brand-orange rounded-full flex items-center justify-center mx-auto mb-2">
                <Icons.Check />
              </div>
              <h2 className="text-xl font-black text-brand-navy dark:text-white uppercase italic tracking-tighter">Sincronizado!</h2>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none">Dados Atualizados</p>
           </div>
        </div>
      )}

      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-brand-navy dark:text-slate-100 uppercase italic leading-tight">Painel Gestor</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Acesso: {user.role}</p>
        </div>
        <button onClick={onSwitchToProfile} className="p-3 bg-brand-orange/10 text-brand-orange rounded-2xl border border-brand-orange/20 flex items-center gap-2 active:scale-95 transition-all">
          <Icons.User /><span className="text-[10px] font-black uppercase">Meu Perfil</span>
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {[
          { id: 'staff', label: 'Equipe', icon: '🛡️' },
          { id: 'users', label: 'Usuários', icon: '👥' },
          { id: 'extra_fees', label: 'Taxas', icon: '⚡' },
          { id: 'financial', label: 'Financeiro', icon: '💰' },
          { id: 'rides_history', label: 'Histórico', icon: '📋' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex-none px-6 py-4 text-[9px] font-black uppercase rounded-2xl transition-all border flex items-center gap-2 ${activeTab === tab.id ? 'bg-brand-navy text-white border-brand-navy shadow-lg scale-105' : 'bg-white dark:bg-slate-900 text-gray-400 border-gray-100 dark:border-slate-800'}`}>
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'staff' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black text-brand-navy dark:text-slate-300 uppercase italic">Autoridades Ativas</h3>
            <span className="text-[9px] font-bold text-brand-orange bg-brand-orange/10 px-2 py-1 rounded-md">{staff.length} Membros</span>
          </div>
          {staff.map(member => (
            <div key={member.id} className="bg-brand-navy text-white p-5 rounded-[2.5rem] border-b-4 border-brand-orange shadow-xl flex justify-between items-center">
              <div>
                <p className="text-xs font-black uppercase italic tracking-wider">{member.name}</p>
                <span className="text-[8px] font-black px-2 py-0.5 rounded uppercase bg-brand-orange text-brand-navy mt-1 inline-block">{member.role}</span>
              </div>
              <button onClick={() => handleUpdateStaffRole(member.userId, UserRole.CLIENT)} className="p-3 bg-white/10 rounded-xl text-white/50 hover:bg-white/20 transition-all">
                <Icons.Trash />
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-4 animate-fade-in">
          {users.map(u => {
            const staffMember = staff.find(s => s.userId === u.id);
            return (
              <div key={u.id} className={`bg-white dark:bg-slate-900 p-5 rounded-[2.5rem] border flex flex-col gap-4 shadow-sm ${u.isBlocked ? 'opacity-60' : 'border-gray-100'}`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange"><Icons.User /></div>
                    <div>
                      <p className="text-xs font-black uppercase text-brand-navy dark:text-slate-100">{u.name}</p>
                      <p className="text-[8px] font-bold text-gray-400 uppercase">{u.phone}</p>
                    </div>
                  </div>
                  <button onClick={() => handleToggleBlock(u.id, !!u.isBlocked)} className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase ${u.isBlocked ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {u.isBlocked ? 'Desbloquear' : 'Bloquear'}
                  </button>
                </div>
                <div className="pt-3 border-t border-gray-50 dark:border-slate-800 flex items-center gap-3">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Cargo:</label>
                  <select 
                    value={staffMember ? staffMember.role : UserRole.CLIENT} 
                    onChange={(e) => handleUpdateStaffRole(u.id, e.target.value as UserRole)}
                    className="flex-1 p-3 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-[9px] font-black uppercase outline-none text-brand-orange"
                  >
                    <option value={UserRole.CLIENT}>Cliente/Piloto</option>
                    <option value={UserRole.MODERATOR}>Moderador</option>
                    <option value={UserRole.ADMIN}>Administrador</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'extra_fees' && (
        <div className="space-y-6 animate-fade-in pb-10">
          <div className="bg-white dark:bg-slate-900 border-2 border-brand-orange/20 rounded-[2.5rem] p-6 shadow-xl space-y-4">
            <h3 className="font-black text-brand-navy dark:text-slate-100 uppercase text-xs tracking-widest italic flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse"></span>
              Taxa Noturna / Pico
            </h3>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-gray-400 uppercase ml-2">Início (Hora)</label>
                  <input type="number" min="0" max="23" value={startHour} onChange={e => setStartHour(Number(e.target.value))} className="w-full p-4 bg-gray-50 dark:bg-slate-800 border rounded-2xl outline-none font-bold text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-gray-400 uppercase ml-2">Fim (Hora)</label>
                  <input type="number" min="0" max="23" value={endHour} onChange={e => setEndHour(Number(e.target.value))} className="w-full p-4 bg-gray-50 dark:bg-slate-800 border rounded-2xl outline-none font-bold text-xs" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-gray-400 uppercase ml-2">Valor R$</label>
                <input type="number" placeholder="Ex: 2.00" value={feeValue} onChange={e => setFeeValue(e.target.value)} className="w-full p-4 bg-gray-50 dark:bg-slate-800 border rounded-2xl outline-none font-bold text-xs" />
              </div>
              <button onClick={() => {
                const updated = [...(settings.customFees || []), { 
                  id: String(Date.now()), 
                  reason: 'Horário Especial', 
                  value: Number(feeValue), 
                  type: 'time' as const, 
                  startHour: Number(startHour),
                  endHour: Number(endHour),
                  enabled: true 
                }];
                handleSaveSettings(updated);
              }} className="w-full py-5 bg-brand-orange text-brand-navy font-black rounded-2xl uppercase italic text-xs shadow-xl active:scale-95 transition-all">Ativar Regra</button>
            </div>
          </div>

          <div className="space-y-3">
             {settings.customFees?.map(fee => (
               <div key={fee.id} className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-gray-100 dark:border-slate-800 flex justify-between items-center shadow-sm">
                 <div>
                   <p className="text-[10px] font-black uppercase text-brand-navy dark:text-white">{fee.reason}</p>
                   <p className="text-[8px] font-bold text-gray-400 uppercase">Das {fee.startHour}h até {fee.endHour}h • R$ {fee.value.toFixed(2)}</p>
                 </div>
                 <button onClick={() => handleSaveSettings(settings.customFees.filter(f => f.id !== fee.id))} className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all">
                   <Icons.Trash />
                 </button>
               </div>
             ))}
          </div>
        </div>
      )}

      {activeTab === 'financial' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-brand-navy text-white p-6 rounded-[2.5rem] shadow-xl border-b-8 border-brand-orange">
             <p className="text-[10px] font-black text-brand-orange uppercase tracking-widest">Saldo Bruto do Portal</p>
             <h3 className="text-3xl font-black italic mt-1">R$ {totalPortalCommission.toFixed(2)}</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-[2.2rem] border border-gray-100 dark:border-slate-800 shadow-sm">
               <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Divisão Dev ({newDevPercent}%)</p>
               <h4 className="text-xl font-black text-brand-navy dark:text-slate-100 italic mt-1">R$ {totalDevCommission.toFixed(2)}</h4>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-[2.2rem] border border-gray-100 dark:border-slate-800 shadow-sm">
               <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Divisão Sócio ({newPartnerPercent}%)</p>
               <h4 className="text-xl font-black text-brand-navy dark:text-slate-100 italic mt-1">R$ {totalPartnerCommission.toFixed(2)}</h4>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 space-y-5 shadow-sm border border-gray-100 dark:border-slate-800">
            <h3 className="font-black text-brand-navy dark:text-slate-100 uppercase text-xs tracking-widest italic border-b pb-2">Gestão de Tarifas</h3>
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-dashed border-brand-orange/20">
                <p className="text-[9px] font-black text-brand-orange uppercase italic mb-2">Bandeirada (Custo Inicial)</p>
                <div className="flex items-center gap-3">
                  <input type="number" step="0.5" value={newBaseFare} onChange={(e) => setNewBaseFare(Number(e.target.value))} className="p-4 flex-1 bg-white dark:bg-slate-800 rounded-xl font-black outline-none border shadow-inner" />
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-dashed border-brand-navy/20">
                <p className="text-[9px] font-black text-brand-navy dark:text-slate-300 uppercase italic mb-2">Valor por KM (Taxa de Distância)</p>
                <div className="flex items-center gap-3">
                  <input type="number" step="0.1" value={newPerKmRate} onChange={(e) => setNewPerKmRate(Number(e.target.value))} className="p-4 flex-1 bg-white dark:bg-slate-800 rounded-xl font-black outline-none border border-brand-navy/30 text-brand-navy dark:text-white shadow-inner" />
                </div>
              </div>

              <div className="space-y-4 pt-2">
                 <div className="space-y-1">
                    <label className="text-[8px] font-black text-gray-400 uppercase ml-2">Comissão do Portal (%)</label>
                    <input type="number" value={newCommissionPercent} onChange={(e) => setNewCommissionPercent(Number(e.target.value))} className="p-4 w-full bg-gray-50 dark:bg-slate-800 rounded-2xl font-black outline-none border text-brand-orange" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-400 uppercase ml-2">Sócio (%)</label>
                      <input type="number" value={newPartnerPercent} onChange={(e) => setNewPartnerPercent(Number(e.target.value))} className="p-4 w-full bg-gray-50 dark:bg-slate-800 rounded-2xl font-black outline-none border" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-400 uppercase ml-2">Dev (%)</label>
                      <input type="number" value={newDevPercent} disabled={!isSupremeAdmin} onChange={(e) => setNewDevPercent(Number(e.target.value))} className={`p-4 w-full bg-gray-50 dark:bg-slate-800 rounded-2xl font-black outline-none border ${!isSupremeAdmin ? 'opacity-40' : ''}`} />
                    </div>
                 </div>
              </div>
            </div>

            <button onClick={() => handleSaveSettings()} disabled={isSaving} className="w-full py-5 bg-brand-navy text-white font-black rounded-2xl uppercase italic text-xs shadow-xl active:scale-95 transition-all">
              {isSaving ? 'Gravando...' : 'Sincronizar Todas as Tarifas'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'rides_history' && (
        <div className="space-y-4 animate-fade-in pb-10">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black text-brand-navy dark:text-slate-300 uppercase italic">Histórico Global</h3>
            <span className="text-[9px] font-bold text-brand-orange bg-brand-orange/10 px-2 py-1 rounded-md">{allRides.length} Corridas</span>
          </div>
          <div className="space-y-3">
            {sortedRides.length === 0 ? (
              <div className="py-20 text-center opacity-30 font-black uppercase text-xs">Sem atividade registrada</div>
            ) : (
              sortedRides.map(ride => (
                <div key={ride.id} className="bg-white dark:bg-slate-900 p-5 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col gap-3 animate-slide-up">
                   <div className="flex justify-between items-center">
                     <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-brand-navy dark:text-slate-300 uppercase truncate italic pr-2">{ride.destination.split(',')[0]}</p>
                        <p className="text-[8px] font-bold text-gray-400 uppercase">{new Date(ride.createdAt).toLocaleDateString('pt-BR')} às {new Date(ride.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-sm font-black text-brand-orange">R$ {(Number(ride.totalPrice) || 0).toFixed(2)}</p>
                        <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded ${ride.status === RideStatus.COMPLETED ? 'bg-green-100 text-green-600' : 'bg-brand-navy/10 text-brand-navy dark:text-white'}`}>
                          {ride.status}
                        </span>
                     </div>
                   </div>
                   <button 
                    onClick={() => setSelectedRide(ride)}
                    className="w-full py-3 bg-gray-50 dark:bg-slate-800 rounded-2xl text-[9px] font-black uppercase text-brand-navy dark:text-slate-300 hover:bg-brand-orange/10 hover:text-brand-orange transition-all flex items-center justify-center gap-2 border border-transparent hover:border-brand-orange/20"
                   >
                     <Icons.History /> Ver Detalhes da Auditoria
                   </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminView;
