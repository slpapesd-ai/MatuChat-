/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, 
  Share2, 
  Plus, 
  RotateCcw,
  Star,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, storage, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  increment,
  addDoc,
  getDocs,
  limit
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

// --- Types ---
import { UserData, View, Group, Chat } from './types';

// --- Components ---
import LoginView from './components/LoginView';
import RegisterView from './components/RegisterView';
import DiscoverView from './components/DiscoverView';
import ProfileView from './components/ProfileView';
import ChatView from './components/ChatView';
import EventsView from './components/EventsView';
import SearchView from './components/SearchView';
import ShopView from './components/ShopView';
import Navbar from './components/Navbar';
import PhotoCapture from './components/PhotoCapture';

const LoadingScreen = () => (
  <div className="fixed inset-0 z-[200] bg-chrome-300 flex flex-col items-center justify-center p-8">
    <motion.div 
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="text-center space-y-8"
    >
      <div className="relative">
        <h1 className="text-6xl font-black uppercase italic tracking-tighter transform -rotate-6 select-none">
          MATUCHAT!
        </h1>
        <div className="absolute -bottom-4 left-0 w-full h-1 bg-black transform -rotate-6"></div>
      </div>
      <div className="flex justify-center space-x-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
            className="w-3 h-3 bg-black rounded-full"
          />
        ))}
      </div>
      <p className="font-black uppercase text-[10px] tracking-[0.2em] opacity-50">
        CARGANDO TU MUNDO...
      </p>
    </motion.div>
  </div>
);

const App = () => {
  const [view, setView] = useState<View>('login');
  const [user, setUser] = useState<UserData | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<UserData | Chat | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [notifications, setNotifications] = useState({ unread_messages: 0 });
  const [isCapturing, setIsCapturing] = useState<'photo' | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
  const [targetGroupName, setTargetGroupName] = useState<string | null>(null);
  const [isAffiliateMode, setIsAffiliateMode] = useState(false);
  const [uploadState, setUploadState] = useState<{ progress: number; isUploading: boolean; type: string } | null>(null);

  useEffect(() => {
    if (view !== 'group_profile') {
      setTargetGroupId(null);
      setTargetGroupName(null);
    }
  }, [view]);
  const [autoOpenMod, setAutoOpenMod] = useState(false);
  const [sharingProduct, setSharingProduct] = useState<any | null>(null);
  const [friends, setFriends] = useState<UserData[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);

  // Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = { id: firebaseUser.uid, ...userDoc.data() } as UserData;
            setUser(userData);
            setView('discover');
          } else {
            setUser(null);
            setView('register');
          }
        } catch (e) {
          console.error("Error fetching user profile:", e);
          setUser(null);
          setView('login');
        }
      } else {
        setUser(null);
        setView('login');
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Real-time Current User Listener
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snapshot) => {
      if (snapshot.exists()) {
        setUser({ id: snapshot.id, ...snapshot.data() } as UserData);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'users/me'));
    return () => unsubscribe();
  }, [auth.currentUser]);

  // Real-time Notifications Listener (Messages)
  useEffect(() => {
    if (!user || !auth.currentUser) return;
    const messagesRef = collection(db, 'messages');
    const q = query(messagesRef, where('receiver_id', '==', user.id), where('is_read', '==', false));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications({ unread_messages: snapshot.size });
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'messages/notifications'));

    return () => unsubscribe();
  }, [user]);

  // Real-time Friends Listener
  useEffect(() => {
    if (!user || !auth.currentUser) return;
    const usersRef = collection(db, 'users');
    // For now, just fetch all users as "friends" or implement a real friendship system
    // In a real app, you'd query a 'friends' collection
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const friendsData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as UserData))
        .filter(u => u.id !== user.id);
      setFriends(friendsData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users/friends'));

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    // Relying on onAuthStateChanged for session management
    // No longer syncing to localStorage to prevent shared session issues in same browser
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setView('login');
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const addReaction = (x: number, y: number) => {
    const reaction = document.createElement('div');
    reaction.className = 'fixed pointer-events-none z-[200] text-2xl animate-bounce-up';
    reaction.style.left = `${x}px`;
    reaction.style.top = `${y}px`;
    reaction.innerText = ['🔥', '⚡', '✨', '🤘', '🎸'][Math.floor(Math.random() * 5)];
    document.body.appendChild(reaction);
    setTimeout(() => reaction.remove(), 1000);
  };

  const [shareSearch, setShareSearch] = useState('');
  const [shareSearchResults, setShareSearchResults] = useState<UserData[]>([]);

  const handleShareSearch = async (q: string) => {
    setShareSearch(q);
    if (q.length > 1) {
      try {
        const usersRef = collection(db, 'users');
        const qLower = q.toLowerCase();
        const querySnapshot = await getDocs(usersRef);
        const results = querySnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as UserData))
          .filter(u => u.username.toLowerCase().includes(qLower) && u.id !== user?.id);
        setShareSearchResults(results);
      } catch (err) {
        console.error("Search failed", err);
        setShareSearchResults([]);
      }
    } else {
      setShareSearchResults([]);
    }
  };

  const shareProductToUser = async (targetUserId: string) => {
    if (!user || !sharingProduct) return;
    try {
      await addDoc(collection(db, 'messages'), {
        sender_id: user.id,
        receiver_id: targetUserId,
        content: `¡Mira este producto en MatuShop: ${sharingProduct.title}!`,
        media_url: sharingProduct.image_url || null,
        media_type: sharingProduct.media_type || 'image',
        shared_product_id: sharingProduct.id,
        is_read: false,
        created_at: new Date().toISOString()
      });
      setSharingProduct(null);
      console.log("¡Producto compartido con éxito!");
    } catch (err) {
      console.error("Share product failed", err);
    }
  };

  const deleteGroup = async (groupId: string) => {
    try {
      await deleteDoc(doc(db, 'groups', groupId));
    } catch (err) {
      console.error("Delete group failed", err);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-chrome-300 relative shadow-2xl overflow-x-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {view === 'login' && (
            <LoginView 
              setUser={setUser}
              setView={setView} 
            />
          )}
          {view === 'register' && (
            <RegisterView 
              setView={setView} 
              setUser={setUser}
            />
          )}
          {view === 'discover' && user && (
            <DiscoverView 
              user={user} 
              handleLogout={handleLogout} 
              setView={setView} 
              setViewingUserId={setViewingUserId}
              setSelectedChat={setSelectedChat}
            />
          )}
          {view === 'profile' && user && viewingUserId !== null && (
            <ProfileView 
              user={user} 
              viewingUserId={viewingUserId.toString()} 
              setView={setView} 
              setViewingUserId={setViewingUserId}
              setSelectedChat={setSelectedChat}
              handleLogout={handleLogout}
              setUser={setUser}
              autoOpenMod={autoOpenMod}
              setAutoOpenMod={setAutoOpenMod}
            />
          )}
          {view === 'chat' && user && (
            <ChatView 
              user={user} 
              selectedChat={selectedChat} 
              setSelectedChat={setSelectedChat} 
              setView={setView} 
              setViewingUserId={setViewingUserId}
              messages={messages}
              setMessages={setMessages}
              setAutoOpenMod={setAutoOpenMod}
              setNotifications={setNotifications as any}
              setContacts={setContacts}
              contacts={contacts}
            />
          )}
          {view === 'events' && user && (
            <EventsView 
              user={user} 
              setView={setView} 
              setViewingUserId={setViewingUserId}
              setSelectedChat={setSelectedChat}
            />
          )}
          {view === 'search' && user && (
            <SearchView 
              setView={setView} 
              user={user} 
              setViewingUserId={setViewingUserId}
              setSelectedChat={setSelectedChat}
              setAutoOpenMod={setAutoOpenMod}
            />
          )}
          {view === 'shop' && user && (
            <ShopView 
              user={user} 
              setView={setView} 
              setSelectedChat={setSelectedChat}
              setViewingUserId={setViewingUserId}
              setContacts={setContacts}
              setSharingProduct={setSharingProduct}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {sharingProduct && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <div className="chrome-card w-full max-w-md p-8 space-y-6 animate-in slide-in-from-bottom-10">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black uppercase italic">Compartir</h2>
                <button onClick={() => { setSharingProduct(null); }} className="p-2 bg-chrome-100 rounded-full"><Plus className="rotate-45" size={24} /></button>
              </div>
              <div className="relative">
                <input 
                  className="chrome-input pl-12" 
                  placeholder="BUSCAR AMIGOS..." 
                  value={shareSearch}
                  onChange={e => handleShareSearch(e.target.value)}
                />
                <Send className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30" size={20} />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                {(shareSearch ? shareSearchResults : friends).map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-chrome-50 rounded-xl border-2 border-chrome-900">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full border-2 border-chrome-900 overflow-hidden">
                        <img src={f.profilePic || `https://picsum.photos/seed/${f.id}/100/100`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <p className="font-black uppercase text-xs">{f.username}</p>
                    </div>
                    <button onClick={() => shareProductToUser(f.id)} className="chrome-button px-4 py-2 text-[10px]">ENVIAR</button>
                  </div>
                ))}
              </div>
              {sharingProduct && (
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/shop/${sharingProduct.id}`);
                    // In a real app, we'd use a toast.
                    console.log("¡Enlace copiado!");
                    setSharingProduct(null);
                  }}
                  className="w-full chrome-button py-4 flex items-center justify-center space-x-3"
                >
                  <Share2 size={20} />
                  <span>COPIAR ENLACE</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Upload Progress */}
      <AnimatePresence>
        {uploadState && uploadState.isUploading && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-4 right-4 z-[150] bg-chrome-900 text-white p-4 rounded-2xl border-2 border-white shadow-2xl flex items-center space-x-4"
          >
            <div className="flex-1 space-y-1">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-black uppercase italic tracking-widest">Subiendo {uploadState.type === 'x' ? 'Post' : 'Estado'}...</p>
                <p className="text-[10px] font-black">{Math.round(uploadState.progress)}%</p>
              </div>
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadState.progress}%` }}
                  className="h-full bg-white"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Photo Capture */}
      <AnimatePresence>
        {isCapturing && (
          <PhotoCapture 
            onCancel={() => setIsCapturing(null)} 
            onComplete={(url, type) => {
              (window as any).capturedMedia = { url, type };
              setIsCapturing(null);
            }} 
          />
        )}
      </AnimatePresence>

      {/* Navbar */}
      <Navbar 
        currentView={view} 
        setView={setView} 
        user={user} 
        onLogout={handleLogout} 
        setViewingUserId={setViewingUserId}
        setSelectedChat={setSelectedChat}
        notifications={notifications}
      />
    </div>
  );
};

export default App;
