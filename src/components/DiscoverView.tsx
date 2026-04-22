import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  MessageSquare, 
  User, 
  Star, 
  Check, 
  Store, 
  Calendar, 
  LogOut, 
  ChevronRight,
  TrendingUp,
  MapPin,
  Heart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserData, View } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, limit, onSnapshot, doc, getDoc } from 'firebase/firestore';

interface DiscoverViewProps {
  user: UserData;
  handleLogout: () => void;
  setView: (view: View) => void;
  setViewingUserId: (id: string | null) => void;
  setSelectedChat: (user: UserData | null) => void;
}

const DiscoverView = ({ user, handleLogout, setView, setViewingUserId, setSelectedChat }: DiscoverViewProps) => {
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<'social' | 'locales'>('social');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const usersRef = collection(db, 'users');
    const unsub = onSnapshot(usersRef, (snap) => {
      const users = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as UserData))
        .filter(u => u.id !== user.id);
      setAllUsers(users);
      setIsLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    return () => unsub();
  }, [user.id]);

  const filteredUsers = useMemo(() => {
    if (tab === 'locales') {
      return allUsers.filter(u => u.is_food_local);
    }
    return allUsers; // Social shows everyone
  }, [allUsers, tab]);

  const currentProfile = filteredUsers[currentIndex];

  const handleNext = () => {
    if (currentIndex < filteredUsers.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Loop or empty state? Let's loop for now if user wants more
      setCurrentIndex(0);
    }
  };

  const handlePass = () => {
    handleNext();
  };

  const handleMessage = () => {
    if (currentProfile) {
      setSelectedChat(currentProfile);
      setView('chat');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-4">
        <div className="w-12 h-12 border-4 border-chrome-900 border-t-transparent rounded-full animate-spin" />
        <p className="font-black uppercase italic text-xs animate-pulse">Explorando el mundo Matu...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-24">
      {/* Header */}
      <div className="p-6 flex justify-between items-center bg-chrome-300">
        <h1 className="matu-title text-3xl italic">MATUCHAT</h1>
        <div className="flex space-x-2">
          <button onClick={() => setView('events')} className="chrome-button p-2.5">
            <Calendar size={20} />
          </button>
          <button onClick={handleLogout} className="chrome-button p-2.5 bg-red-600 border-red-900">
            <LogOut size={20} className="text-white" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pb-2">
        <div className="flex chrome-card bg-white p-1">
          <button 
            onClick={() => { setTab('social'); setCurrentIndex(0); }}
            className={`flex-1 py-3 font-black text-xs uppercase transition-all rounded-xl ${tab === 'social' ? 'bg-chrome-900 text-white shadow-lg' : 'opacity-40 hover:opacity-100'}`}
          >
            Social
          </button>
          <button 
            onClick={() => { setTab('locales'); setCurrentIndex(0); }}
            className={`flex-1 py-3 font-black text-xs uppercase transition-all rounded-xl ${tab === 'locales' ? 'bg-chrome-900 text-white shadow-lg' : 'opacity-40 hover:opacity-100'}`}
          >
            Locales
          </button>
        </div>
      </div>

      {/* Profile Card Container */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <AnimatePresence mode="wait">
          {filteredUsers.length > 0 ? (
            <motion.div 
              key={currentProfile?.id || 'empty'}
              initial={{ scale: 0.8, opacity: 0, x: 50, rotate: 5 }}
              animate={{ scale: 1, opacity: 1, x: 0, rotate: 0 }}
              exit={{ scale: 1.1, opacity: 0, x: -100, rotate: -10 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="w-full max-w-sm aspect-[3/4] chrome-card bg-white overflow-hidden shadow-2xl flex flex-col relative"
              onClick={() => { if (currentProfile) { setViewingUserId(currentProfile.id); setView('profile'); } }}
            >
              {/* Image Container */}
              <div className="flex-1 relative overflow-hidden bg-chrome-200">
                <img 
                  src={currentProfile?.profilePic || `https://picsum.photos/seed/${currentProfile?.id}/400/600`} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  alt={currentProfile?.username}
                />
                
                {/* Badges Overlay */}
                <div className="absolute top-4 left-4 flex flex-col space-y-2">
                  {currentProfile?.is_verified && (
                    <div className="bg-blue-600 text-white rounded-full p-1.5 shadow-lg border-2 border-white">
                      <Check size={14} />
                    </div>
                  )}
                  {currentProfile?.is_food_local && (
                    <div className="bg-orange-600 text-white rounded-full p-1.5 shadow-lg border-2 border-white">
                      <Store size={14} />
                    </div>
                  )}
                  {currentProfile?.is_matustar && (
                    <div className="bg-yellow-500 text-white rounded-full p-1.5 shadow-lg border-2 border-white">
                      <Star size={14} className="fill-current" />
                    </div>
                  )}
                </div>

                {/* Info Gradient */}
                <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/80 to-transparent p-6 flex flex-col justify-end">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-2xl font-black uppercase italic text-white tracking-tighter">
                      {currentProfile?.username}
                    </h3>
                  </div>
                  <p className="text-white/70 text-xs font-bold uppercase tracking-wider line-clamp-2">
                    {currentProfile?.bio || "SIN BIOGRAFÍA"}
                  </p>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-chrome-900 py-3 flex divide-x divide-white/20 border-t-2 border-white/10 text-white">
                <div className="flex-1 text-center">
                  <p className="font-black text-xs leading-none">🤟 {currentProfile?.reaction_count || 0}</p>
                  <p className="text-[8px] font-bold uppercase opacity-50">Reacciones</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="font-black text-xs leading-none">{currentProfile?.follower_count || 0}</p>
                  <p className="text-[8px] font-bold uppercase opacity-50">Seguidores</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="text-center space-y-4 p-10 opacity-30"
            >
              <User size={64} className="mx-auto" />
              <p className="font-black uppercase italic">¡Vaya! No hay más perfiles en esta zona.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Swipe Buttons */}
        {filteredUsers.length > 0 && (
          <div className="mt-8 flex items-center space-x-6">
            <button 
              onClick={handlePass}
              className="w-16 h-16 rounded-full bg-white border-4 border-chrome-900 flex items-center justify-center text-red-600 shadow-xl active:scale-90 transition-transform hover:bg-red-50"
            >
              <X size={32} strokeWidth={3} />
            </button>
            <button 
              onClick={handleMessage}
              className="w-20 h-20 rounded-full bg-chrome-900 flex items-center justify-center text-white shadow-[0_10px_20px_rgba(0,0,0,0.3)] active:scale-95 transition-transform hover:scale-105"
            >
              <MessageSquare size={36} className="fill-current" />
            </button>
          </div>
        )}
      </div>

      {/* Discover more suggestion */}
      <div className="px-6 pb-6 mt-auto">
        <div className="chrome-card bg-chrome-100 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-chrome-900 text-white p-2 rounded-lg">
              <TrendingUp size={18} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase opacity-50">Sugerencia</p>
              <p className="text-xs font-bold uppercase">Busca locatarios locales</p>
            </div>
          </div>
          <ChevronRight size={20} className="opacity-30" />
        </div>
      </div>
    </div>
  );
};

export default DiscoverView;
