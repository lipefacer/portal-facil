
import React, { useState } from 'react';
import { UserRole } from '../types';
import { 
  auth, 
  db, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  doc,
  getDoc,
  setDoc
} from '../firebase';

const WelcomeView: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.CLIENT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    const cleanEmail = email.trim();

    try {
      if (mode === 'login') {
        const userCred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        const userDoc = await getDoc(doc(db, "users", userCred.user.uid));
        if (!userDoc.exists()) {
          throw new Error("Perfil não encontrado. Por favor, realize o cadastro.");
        }
      } else if (mode === 'signup') {
        if (!name || !phone) throw new Error("Preencha nome e telefone.");
        const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const userData: any = {
          name: name.trim(), 
          phone: phone.trim(), 
          role,
          createdAt: new Date().toISOString()
        };
        if (role === UserRole.DRIVER) {
          userData.isOnline = false;
          userData.motoPlate = 'MOTO-0000';
          userData.pixKey = phone.trim();
        }
        await setDoc(doc(db, "users", userCred.user.uid), userData);
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, cleanEmail);
        setSuccessMsg('Link de recuperação enviado!');
        setTimeout(() => setMode('login'), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao processar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 flex flex-col items-center justify-center min-h-full space-y-6 animate-fade-in bg-white dark:bg-slate-950">
      <div className="text-brand-navy dark:text-slate-100 flex flex-col items-center mb-4">
        <h2 className="text-4xl font-black italic tracking-tighter uppercase leading-none">Portal</h2>
        <h2 className="text-4xl font-black italic tracking-tighter uppercase leading-none text-brand-orange ml-4">Fácil</h2>
      </div>

      <form onSubmit={handleAuth} className="w-full space-y-4">
        {mode === 'signup' && (
          <>
            <input 
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full p-4 bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none font-semibold dark:text-white"
              placeholder="Nome completo" required
            />
            <input 
              type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full p-4 bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none font-semibold dark:text-white"
              placeholder="WhatsApp" required
            />
            <div className="flex flex-wrap gap-2">
              <button 
                type="button" onClick={() => setRole(UserRole.CLIENT)}
                className={`flex-1 py-3 rounded-xl border-2 text-[8px] font-black uppercase transition-all ${role === UserRole.CLIENT ? 'bg-brand-navy border-brand-navy text-white shadow-md' : 'text-gray-300 dark:text-slate-600 border-gray-50'}`}
              >Passageiro</button>
              <button 
                type="button" onClick={() => setRole(UserRole.DRIVER)}
                className={`flex-1 py-3 rounded-xl border-2 text-[8px] font-black uppercase transition-all ${role === UserRole.DRIVER ? 'bg-brand-navy border-brand-navy text-white shadow-md' : 'text-gray-300 dark:text-slate-600 border-gray-50'}`}
              >Piloto</button>
              <button 
                type="button" onClick={() => setRole(UserRole.MODERATOR)}
                className={`flex-1 py-3 rounded-xl border-2 text-[8px] font-black uppercase transition-all ${role === UserRole.MODERATOR ? 'bg-brand-navy border-brand-navy text-white shadow-md' : 'text-gray-300 dark:text-slate-600 border-gray-50'}`}
              >Moderador</button>
            </div>
          </>
        )}

        <input 
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full p-4 bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none font-semibold dark:text-white"
          placeholder="E-mail" required
        />

        {mode !== 'forgot' && (
          <input 
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full p-4 bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl outline-none font-semibold dark:text-white"
            placeholder="Senha" required
          />
        )}

        <button 
          type="submit" disabled={loading}
          className="w-full py-5 bg-brand-orange text-brand-navy font-black text-lg rounded-2xl shadow-lg uppercase italic disabled:opacity-50"
        >
          {loading ? 'Processando...' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Cadastrar' : 'Recuperar'}
        </button>
      </form>

      <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="text-brand-navy dark:text-slate-200 font-bold text-sm">
        {mode === 'login' ? 'Criar nova conta' : 'Já tenho conta'}
      </button>
    </div>
  );
};

export default WelcomeView;
