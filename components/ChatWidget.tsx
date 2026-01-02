
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, User, Ride } from '../types';
import { Icons } from '../constants';
import { db, collection, addDoc, query, where, onSnapshot, doc, updateDoc } from '../firebase';
import { notificationService } from '../notificationService';

interface ChatWidgetProps {
  ride: Ride;
  user: User;
  onClose: () => void;
}

const ChatWidget: React.FC<ChatWidgetProps> = ({ ride, user, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  // Monitorar mensagens
  useEffect(() => {
    const q = query(
      collection(db, "messages"),
      where("rideId", "==", ride.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      // Lógica de som e notificação para novas mensagens
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMessageIdRef.current && 
            lastMsg.id !== lastMessageIdRef.current && 
            lastMsg.senderId !== user.id) {
          notificationService.playSound('chat-message');
          notificationService.send(`Mensagem de ${lastMsg.senderName}`, lastMsg.text);
        }
        lastMessageIdRef.current = lastMsg.id;
      }
      
      setMessages(msgs);
    }, (error) => {
      console.error("Erro no listener de mensagens:", error);
    });

    return () => unsubscribe();
  }, [ride.id, user.id]);

  // Monitorar se o outro usuário está digitando
  useEffect(() => {
    const rideRef = doc(db, "rides", ride.id);
    const unsubscribe = onSnapshot(rideRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Ride;
        const otherUserId = user.id === data.clientId ? data.driverId : data.clientId;
        if (otherUserId && data.typing && data.typing[otherUserId]) {
          setIsOtherTyping(true);
        } else {
          setIsOtherTyping(false);
        }
      }
    });

    return () => unsubscribe();
  }, [ride.id, user.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOtherTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    const rideRef = doc(db, "rides", ride.id);
    updateDoc(rideRef, { [`typing.${user.id}`]: true });

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      updateDoc(rideRef, { [`typing.${user.id}`]: false });
    }, 3000);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    try {
      const rideRef = doc(db, "rides", ride.id);
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      updateDoc(rideRef, { [`typing.${user.id}`]: false });

      await addDoc(collection(db, "messages"), {
        rideId: ride.id,
        senderId: user.id,
        senderName: user.name,
        text: inputText,
        createdAt: new Date().toISOString()
      });
      setInputText('');
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-slate-950 animate-fade-in md:relative md:h-[500px] md:rounded-3xl md:overflow-hidden md:border dark:border-slate-800 shadow-2xl">
      <header className="bg-brand-navy dark:bg-slate-900 p-4 text-white flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div>
            <h3 className="font-black uppercase italic text-xs tracking-widest text-brand-orange">Bate-papo</h3>
            <p className="text-[10px] font-bold opacity-70">Conversando com {user.id === ride.clientId ? ride.driverName : ride.clientName}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-slate-950/50 scroll-smooth">
        {messages.length === 0 && !isOtherTyping && (
          <div className="flex flex-col items-center justify-center h-full opacity-30 text-center space-y-2">
            <Icons.Message />
            <p className="text-[10px] font-black uppercase">Combine os detalhes aqui</p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.senderId === user.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3.5 rounded-2xl shadow-sm animate-pop ${
              msg.senderId === user.id 
                ? 'bg-brand-orange text-brand-navy rounded-br-none border border-brand-orange/20 font-semibold' 
                : 'bg-white dark:bg-slate-800 dark:text-white border border-gray-100 dark:border-slate-700 rounded-bl-none'
            }`}>
              <p className="text-[11px] font-medium leading-relaxed">{msg.text}</p>
              <span className={`text-[8px] mt-1.5 block font-black uppercase opacity-60 ${msg.senderId === user.id ? 'text-right' : 'text-left'}`}>
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {isOtherTyping && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none border border-gray-100 dark:border-slate-700 shadow-sm flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-brand-orange rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-brand-orange rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 bg-brand-orange rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
              <span className="text-[9px] font-black uppercase text-gray-400 dark:text-slate-500 tracking-widest">Digitando...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 bg-white dark:bg-slate-900 border-t dark:border-slate-800 flex gap-2">
        <input 
          type="text" 
          value={inputText}
          onChange={handleInputChange}
          placeholder="Digite sua mensagem..."
          className="flex-1 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-orange dark:text-white transition-all shadow-inner"
        />
        <button 
          type="submit"
          className="bg-brand-orange text-brand-navy p-4 rounded-2xl shadow-lg active:scale-95 transition-all hover:brightness-105 flex items-center justify-center disabled:opacity-50"
          disabled={!inputText.trim()}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
        </button>
      </form>
    </div>
  );
};

export default ChatWidget;
