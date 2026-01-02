
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, Ride, RideStatus, AppSettings } from './types';
import { Icons, APP_NAME } from './constants';
import ClientView from './views/ClientView';
import DriverView from './views/DriverView';
import AdminView from './views/AdminView';
import WelcomeView from './views/WelcomeView';
import { notificationService } from './notificationService';
import { nativeBridge, isNative } from './nativeBridge';
import { 
  auth, onAuthStateChanged, signOut, doc, db, 
  onSnapshot, collection, query, orderBy, limit, updateDoc, setDoc, addDoc,
} from './firebase';

interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning';
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [rides, setRides] = useState<Ride[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [adminViewMode, setAdminViewMode] = useState<'management' | 'profile'>('management');
  
  const [settings, setSettings] = useState<AppSettings>({
    commissionPercent: 5,
    devCommissionPercent: 20,
    partnerCommissionPercent: 80,
    baseFare: 4.00,
    perKmRate: 1.50,
    customFees: []
  });

  const profileUnsubRef = useRef<(() => void) | null>(null);
  const adminRoleUnsubRef = useRef<(() => void) | null>(null);
  const ridesUnsubRef = useRef<(() => void) | null>(null);

  const SUPREME_ADMIN_EMAIL = 'lipe.lipe@me.com';

  const addToast = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // Check da Ponte Nativa ao Iniciar
  useEffect(() => {
    if (isNative) {
      console.log("🚀 Portal Fácil: Rodando em modo NATIVO via Ponte Capacitor.");
      nativeBridge.showToast("App Nativo Inicializado");
      notificationService.initPush();
    } else {
      console.log("🌐 Portal Fácil: Rodando em modo WEB convencional.");
    }
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (profileUnsubRef.current) profileUnsubRef.current();
      if (adminRoleUnsubRef.current) adminRoleUnsubRef.current();
      if (ridesUnsubRef.current) ridesUnsubRef.current();

      if (firebaseUser) {
        profileUnsubRef.current = onSnapshot(doc(db, "users", firebaseUser.uid), (userSnap) => {
          if (userSnap.exists()) {
            const baseData = userSnap.data() as User;
            adminRoleUnsubRef.current = onSnapshot(doc(db, "admins", firebaseUser.uid), (adminSnap) => {
              let finalUserData = { id: firebaseUser.uid, ...baseData, email: firebaseUser.email };
              
              if (adminSnap.exists()) {
                finalUserData.role = adminSnap.data().role as UserRole;
              }

              if (firebaseUser.email === SUPREME_ADMIN_EMAIL) {
                finalUserData.role = UserRole.ADMIN;
                finalUserData.isBlocked = false;
              }

              setCurrentUser(finalUserData as any);
              setLoading(false);
            });
          } else {
            if (firebaseUser.email === SUPREME_ADMIN_EMAIL) {
               const initialAdmin = {
                id: firebaseUser.uid,
                name: "Admin Supremo",
                phone: "00000000000",
                role: UserRole.ADMIN,
                isBlocked: false,
                email: firebaseUser.email
              };
              setDoc(doc(db, "users", firebaseUser.uid), initialAdmin);
              setCurrentUser(initialAdmin as any);
            }
            setLoading(false);
          }
        });
      } else {
        setCurrentUser(null);
        setRides([]);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (profileUnsubRef.current) profileUnsubRef.current();
      if (adminRoleUnsubRef.current) adminRoleUnsubRef.current();
      if (ridesUnsubRef.current) ridesUnsubRef.current();
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    return onSnapshot(doc(db, "settings", "app"), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as AppSettings;
        setSettings({
          ...data,
          customFees: Array.isArray(data.customFees) ? data.customFees : []
        });
      }
    });
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser || currentUser.isBlocked) return;
    const q = query(collection(db, "rides"), orderBy("createdAt", "desc"), limit(100));
    ridesUnsubRef.current = onSnapshot(q, (snapshot) => {
      let updatedRides = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Ride));
      setRides(updatedRides);
    });
    return () => ridesUnsubRef.current?.();
  }, [currentUser?.id, currentUser?.isOnline, currentUser?.role, currentUser?.isBlocked]);

  const handleUpdateRide = async (rideId: string, updates: Partial<Ride>) => {
    try {
      await updateDoc(doc(db, "rides", rideId), updates);
    } catch (err) { 
      addToast("Erro ao atualizar corrida.", "warning");
    }
  };

  const handleLogout = async () => {
    if (window.confirm("Deseja realmente sair?")) {
      await signOut(auth);
      setCurrentUser(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-slate-950 space-y-4">
        <div className="w-16 h-16 border-4 border-brand-orange border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-brand-navy dark:text-slate-400 uppercase tracking-widest">Iniciando Portal...</p>
      </div>
    );
  }

  const renderView = () => {
    if (!currentUser) return <WelcomeView />;

    if ((currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.MODERATOR) && adminViewMode === 'profile') {
      return (
        <ClientView 
          user={currentUser} 
          rides={rides.filter(r => r.clientId === currentUser.id)} 
          settings={settings}
          onCreateRide={async (r) => {
            const { id, ...rideData } = r;
            const docRef = await addDoc(collection(db, "rides"), rideData);
            return docRef.id;
          }} 
          onUpdateRide={handleUpdateRide} 
          onLogout={handleLogout}
          adminToggle={() => setAdminViewMode('management')}
        />
      );
    }

    switch (currentUser.role) {
      case UserRole.ADMIN:
      case UserRole.MODERATOR:
        return (
          <AdminView 
            user={currentUser}
            allRides={rides} 
            settings={settings} 
            onUpdateSettings={async (s) => await setDoc(doc(db, "settings", "app"), s)} 
            onLogout={handleLogout}
            onSwitchToProfile={() => setAdminViewMode('profile')}
            isSupremeAdmin={(currentUser as any).email === SUPREME_ADMIN_EMAIL}
          />
        );
      case UserRole.DRIVER:
        return (
          <DriverView 
            user={currentUser} 
            availableRides={rides.filter(r => r.status === RideStatus.PENDING)} 
            myRides={rides.filter(r => r.driverId === currentUser.id)} 
            onAcceptRide={(rideId) => handleUpdateRide(rideId, { 
              driverId: currentUser.id, 
              driverName: currentUser.name, 
              status: RideStatus.ACCEPTED 
            })} 
            onUpdateRide={handleUpdateRide} 
            onUpdateUser={async (updated) => {
              const { id, ...userData } = updated;
              await updateDoc(doc(db, "users", currentUser.id), userData);
            }} 
            onLogout={handleLogout} 
          />
        );
      default:
        return (
          <ClientView 
            user={currentUser} 
            rides={rides.filter(r => r.clientId === currentUser.id)} 
            settings={settings}
            onCreateRide={async (r) => {
              const { id, ...rideData } = r;
              const docRef = await addDoc(collection(db, "rides"), rideData);
              return docRef.id;
            }} 
            onUpdateRide={handleUpdateRide} 
            onLogout={handleLogout} 
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 max-w-md mx-auto shadow-2xl relative overflow-hidden">
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-[320px] pointer-events-none flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`p-4 rounded-2xl shadow-2xl border-2 animate-slide-up pointer-events-auto flex items-center gap-3 ${
            toast.type === 'success' ? 'bg-green-600 border-green-400 text-white' : 'bg-brand-navy border-brand-orange text-white'
          }`}>
            <div className="flex-1 text-[11px] font-black uppercase italic leading-tight">{toast.message}</div>
          </div>
        ))}
      </div>
      <header className="bg-brand-orange text-white p-4 shadow-md flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2 text-brand-navy">
          <Icons.Motorcycle />
          <h1 className="font-extrabold text-xl tracking-tighter uppercase italic">{APP_NAME}</h1>
        </div>
        {currentUser && (
          <button onClick={handleLogout} className="text-[10px] font-black bg-brand-navy text-white px-5 py-2.5 rounded-full uppercase shadow-lg border border-white/10">Sair</button>
        )}
      </header>
      <main className="flex-1 overflow-y-auto pb-24">
        {renderView()}
      </main>
    </div>
  );
};

export default App;
