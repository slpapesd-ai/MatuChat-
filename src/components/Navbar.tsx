import React from 'react';
import { Compass, MessageCircle, ShoppingBag, User } from 'lucide-react';
import { UserData, View } from '../types';

interface NavbarProps {
  currentView: View;
  setView: (view: View) => void;
  user: UserData | null;
  onLogout: () => void;
  setViewingUserId: (id: string | null) => void;
  setSelectedChat: (chat: UserData | null) => void;
  notifications: { unread_messages: number };
}

const Navbar = ({ currentView, setView, user, onLogout, setViewingUserId, setSelectedChat, notifications }: NavbarProps) => {
  if (!user) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t-4 border-chrome-900 px-4 py-3 sm:py-4">
      <div className="max-w-2xl mx-auto flex justify-around items-center relative">
        <button 
          onClick={() => setView('discover')} 
          className={`p-2 sm:p-3 transition-all ${currentView === 'discover' ? 'bg-chrome-900 text-white rounded-2xl shadow-lg -translate-y-2' : 'text-chrome-400 hover:text-chrome-900'}`}
        >
          <Compass size={24} className="sm:w-7 sm:h-7" />
        </button>
        
        <button 
          onClick={() => { setSelectedChat(null); setView('chat'); }} 
          className={`p-2 sm:p-3 transition-all relative ${currentView === 'chat' ? 'bg-chrome-900 text-white rounded-2xl shadow-lg -translate-y-2' : 'text-chrome-400 hover:text-chrome-900'}`}
        >
          <MessageCircle size={24} className="sm:w-7 sm:h-7" />
          {notifications.unread_messages > 0 && (
            <span className="absolute top-0 right-0 w-5 h-5 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">
              {notifications.unread_messages}
            </span>
          )}
        </button>
        <button 
          onClick={() => setView('shop')} 
          className={`p-2 sm:p-3 transition-all ${currentView === 'shop' ? 'bg-chrome-900 text-white rounded-2xl shadow-lg -translate-y-2' : 'text-chrome-400 hover:text-chrome-900'}`}
        >
          <ShoppingBag size={24} className="sm:w-7 sm:h-7" />
        </button>
        <button 
          onClick={() => { setViewingUserId(user.id); setView('profile'); }} 
          className={`p-2 sm:p-3 transition-all ${currentView === 'profile' ? 'bg-chrome-900 text-white rounded-2xl shadow-lg -translate-y-2' : 'text-chrome-400 hover:text-chrome-900'}`}
        >
          <User size={24} className="sm:w-7 sm:h-7" />
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
