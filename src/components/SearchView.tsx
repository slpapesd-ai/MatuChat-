import React, { useState } from 'react';
import { Search, Check, Store, Star, ShieldAlert, MessageCircle } from 'lucide-react';
import { UserData, View } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query as fsQuery, getDocs, limit, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

interface SearchViewProps {
  setView: (view: View) => void;
  user: UserData;
  setViewingUserId: (id: string | null) => void;
  setSelectedChat: (chat: any) => void;
  setAutoOpenMod: (val: boolean) => void;
}

const SearchView = ({ setView, user, setViewingUserId, setSelectedChat, setAutoOpenMod }: SearchViewProps) => {
  if (!user) return null;
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<UserData[]>([]);

  const handleSearch = async (q: string) => {
    setQueryText(q);
    if (q.length > 1) {
      try {
        const qLower = q.toLowerCase();
        const usersRef = collection(db, 'users');
        const usersSnap = await getDocs(fsQuery(usersRef, limit(100)));
        const usersResults = usersSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as UserData))
          .filter(u => u.username?.toLowerCase().includes(qLower) || u.userID?.toString().includes(qLower));

        setResults(usersResults);
      } catch (err) {
        console.error("Search failed", err);
        handleFirestoreError(err, OperationType.LIST, 'search');
        setResults([]);
      }
    } else {
      setResults([]);
    }
  };

  const toggleFollow = async (targetId: string) => {
    try {
      const targetUserRef = doc(db, 'users', targetId);
      const currentUserRef = doc(db, 'users', user.id);
      
      const targetUserDoc = await getDoc(targetUserRef);
      if (!targetUserDoc.exists()) return;
      
      const targetData = targetUserDoc.data();
      const isFollowing = user.following_count ? /* check real follow docs in real app */ false : false; 
      // This part is simplified since we removed posts, but follow logic could be improved.
      // For now we keep it basic as per previous turn's logic or remove if it causes confusion.
    } catch (err) {
      console.error("Follow failed", err);
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-8 pb-32">
      <h1 className="matu-title text-3xl sm:text-4xl italic">Buscador</h1>
      <div className="flex space-x-3">
        <input 
          className="chrome-input flex-1 text-base py-4" 
          placeholder="BUSCAR USUARIOS..." 
          value={queryText}
          onChange={e => handleSearch(e.target.value)}
        />
        <button className="chrome-button p-4"><Search size={28} /></button>
      </div>

      <div className="space-y-5">
        {results.map(u => (
          <div key={u.id} className="chrome-card p-5 flex items-center space-x-5">
            <div 
              onClick={() => { setViewingUserId(u.id); setView('profile'); }}
              className="w-14 h-14 bg-chrome-400 border-2 border-chrome-900 flex items-center justify-center font-black text-2xl overflow-hidden cursor-pointer"
            >
              {u.profilePic ? <img src={u.profilePic} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : u.username[0].toUpperCase()}
            </div>
            <div className="flex-1 cursor-pointer" onClick={() => { setViewingUserId(u.id); setView('profile'); }}>
              <div className="flex items-center space-x-3">
                <p className="font-black uppercase text-base">{u.username}</p>
                {u.is_verified && <Check size={12} className="bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full p-0.5" />}
                {u.is_food_local && <Store size={12} className="bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-full p-0.5" />}
                {u.is_matustar && <Star size={12} className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-white rounded-full p-0.5" />}
              </div>
              <p className="text-xs font-bold opacity-50">ID: {u.userID}</p>
            </div>
            <div className="flex items-center space-x-3">
              {u.id !== user?.id && (
                <button 
                  onClick={(e) => { 
                    e.stopPropagation();
                    setSelectedChat(u); 
                    setView('chat'); 
                  }} 
                  className="chrome-button p-3"
                >
                  <MessageCircle size={22} />
                </button>
              )}
            </div>
          </div>
        ))}
        {queryText && results.length === 0 && (
          <p className="text-center font-bold opacity-50 uppercase py-20 text-lg">No se encontraron resultados</p>
        )}
      </div>
    </div>
  );
};

export default SearchView;
