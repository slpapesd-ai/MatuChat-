import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Check, Store, Star, Settings, Plus, Send, Image as ImageIcon, Search, Users, ShieldAlert, User, Video, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserData, View, Message, Chat as ChatType } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, doc, updateDoc, deleteDoc, getDocs, getDoc, or, and, setDoc } from 'firebase/firestore';

interface ChatViewProps {
  user: UserData;
  setView: (view: View) => void;
  setViewingUserId: (id: string | null) => void;
  selectedChat: any;
  setSelectedChat: (chat: any) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setAutoOpenMod: (open: boolean) => void;
  setNotifications: (n: any) => void;
  setContacts: (c: any[]) => void;
  contacts: any[];
}

const ChatView = ({ user, setView, setViewingUserId, selectedChat, setSelectedChat, messages, setMessages, setAutoOpenMod, setNotifications, setContacts, contacts }: ChatViewProps) => {
  if (!user) return null;
  const [groups, setGroups] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupImage, setGroupImage] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<(string | number)[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ users: any[] }>({ users: [] });
  const [streak, setStreak] = useState<any>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupImageInputRef = useRef<HTMLInputElement>(null);

  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [chatSummaries, setChatSummaries] = useState<any[]>([]);

  // Real-time Groups Listener
  useEffect(() => {
    const groupsRef = collection(db, 'groups');
    const q = query(groupsRef, where('members', 'array-contains', user.id));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const groupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort client-side by last message time
      groupsData.sort((a: any, b: any) => {
        const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
        const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
        return timeB - timeA;
      });
      setGroups(groupsData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'groups'));

    return () => unsubscribe();
  }, [user.id]);

  // Real-time Users Listener
  useEffect(() => {
    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const usersData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as UserData))
        .filter(u => u.id !== user.id);
      setAllUsers(usersData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    return () => unsubscribe();
  }, [user.id]);

  // Real-time Chat Summaries Listener
  useEffect(() => {
    const chatsRef = collection(db, 'chats');
    const q = query(chatsRef, where('participants', 'array-contains', user.id));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const summaries = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setChatSummaries(summaries);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'chats'));

    return () => unsubscribe();
  }, [user.id]);

  // Merge and Sort Contacts
  useEffect(() => {
    const chatMap = new Map();
    chatSummaries.forEach(s => {
      const otherId = s.participants.find((id: string) => id !== user.id);
      if (otherId) chatMap.set(otherId, s);
    });

    const merged = allUsers.map(u => {
      const chatInfo = chatMap.get(u.id);
      return {
        ...u,
        last_message: chatInfo?.last_message,
        last_message_time: chatInfo?.last_message_time
      };
    });

    // Sort: Latest message first, then alphabetical
    merged.sort((a, b) => {
      const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
      const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return a.username.localeCompare(b.username);
    });

    setContacts(merged);
  }, [allUsers, chatSummaries, user.id, setContacts]);

  useEffect(() => {
    if (!selectedChat) return;
    
    let q;
    const messagesRef = collection(db, 'messages');
    
    if (selectedChat.is_group) {
      q = query(messagesRef, where('group_id', '==', selectedChat.id), orderBy('created_at', 'asc'));
    } else {
      // Firestore doesn't support complex OR queries across different fields easily in some versions,
      // but we can use the `or` and `and` filters in newer SDKs.
      q = query(
        messagesRef,
        or(
          and(where('sender_id', '==', user.id), where('receiver_id', '==', selectedChat.id)),
          and(where('sender_id', '==', selectedChat.id), where('receiver_id', '==', user.id))
        ),
        orderBy('created_at', 'asc')
      );
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(messagesData);
      
      // Mark as read
      snapshot.docs.forEach(async (d) => {
        const data = d.data();
        if (data.receiver_id === user.id && !data.is_read) {
          await updateDoc(d.ref, { is_read: true });
        }
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'messages'));

    return () => unsubscribe();
  }, [selectedChat, user.id, setMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length > 1) {
      try {
        const usersRef = collection(db, 'users');
        const usersSnap = await getDocs(usersRef);
        
        const qLower = q.toLowerCase();
        const usersResults = usersSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as UserData))
          .filter(u => u.username.toLowerCase().includes(qLower) && u.id !== user.id);

        setSearchResults({
          users: usersResults
        });
      } catch (err) {
        console.error("Chat search failed", err);
      }
    } else {
      setSearchResults({ users: [] });
    }
  };

  const sendMessage = async (mediaUrl?: string) => {
    if (!newMessage && !mediaUrl) return;
    const content = newMessage;
    setNewMessage(''); // Clear immediately for snappy feel
    try {
      const timestamp = new Date().toISOString();
      const targetUserId = selectedChat.is_group ? null : (selectedChat.id);
      
      await addDoc(collection(db, 'messages'), {
        sender_id: user.id,
        receiver_id: targetUserId,
        group_id: selectedChat.is_group ? selectedChat.id : null,
        content: content,
        media_url: mediaUrl || null,
        media_type: mediaUrl ? (mediaUrl.startsWith('data:video') || mediaUrl.startsWith('blob:') ? 'video' : 'image') : null,
        is_group: !!selectedChat.is_group,
        is_read: false,
        created_at: timestamp
      });

      // Update/Create Chat document for sorting and last message text
      if (!selectedChat.is_group && targetUserId) {
        const chatId = [user.id, targetUserId].sort().join('_');
        await setDoc(doc(db, 'chats', chatId), {
          participants: [user.id, targetUserId],
          last_message: content || (mediaUrl ? 'Archivo multimedia' : ''),
          last_message_time: timestamp,
          type: 'direct'
        }, { merge: true });
      } else if (selectedChat.is_group) {
        // Update group last message info
        await updateDoc(doc(db, 'groups', selectedChat.id), {
          last_message: content || 'Archivo multimedia',
          last_message_time: timestamp
        });
      }
    } catch (err) {
      console.error("Send message failed", err);
      // Optional: restore message if it failed
      // setNewMessage(content);
    }
  };

  const deleteMessage = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'messages', id));
      setMessageToDelete(null);
      setConfirmingDelete(false);
    } catch (err) {
      console.error("Delete message failed", err);
      setMessageToDelete(null);
      setConfirmingDelete(false);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!selectedChat || !selectedChat.is_group) return;
    try {
      const groupRef = doc(db, 'groups', selectedChat.id);
      const groupDoc = await getDoc(groupRef);
      if (groupDoc.exists()) {
        const currentMembers = groupDoc.data().members || [];
        const newMembers = currentMembers.filter((id: string) => id !== memberId);
        await updateDoc(groupRef, {
          members: newMembers,
          member_count: Math.max(0, (groupDoc.data().member_count || 1) - 1)
        });
        setSelectedChat({ ...selectedChat, members: newMembers });
      }
      setMemberToRemove(null);
    } catch (err) {
      console.error("Remove member failed", err);
      handleFirestoreError(err, OperationType.UPDATE, 'groups/members');
    }
  };

  const deleteGroup = async (groupId: string) => {
    try {
      await deleteDoc(doc(db, 'groups', groupId));
      setSelectedChat(null);
      setGroupToDelete(null);
    } catch (err) {
      console.error("Delete group failed", err);
      handleFirestoreError(err, OperationType.DELETE, 'groups');
    }
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => sendMessage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  if (selectedChat) {
    return (
      <div className="h-screen bg-chrome-100 flex flex-col">
        <div className="bg-chrome-900 text-white p-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => setSelectedChat(null)}><ArrowLeft /></button>
              <div 
                className="w-10 h-10 rounded-full bg-chrome-200 overflow-hidden border-2 border-white cursor-pointer"
                onClick={() => { setViewingUserId(selectedChat.id); setView('profile'); }}
              >
                <img src={selectedChat.profilePic || selectedChat.image_url || `https://picsum.photos/seed/${selectedChat.id}/100/100`} alt={selectedChat.username || selectedChat.name || 'Chat'} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center space-x-2">
                <p 
                  className="font-black uppercase italic cursor-pointer hover:underline"
                  onClick={() => { setViewingUserId(selectedChat.id); setView('profile'); }}
                >
                  {selectedChat.username || selectedChat.name || 'Chat'}
                </p>
                {selectedChat.is_owner && (
                  <div className="flex items-center justify-center bg-yellow-400 rounded-full p-0.5 shadow-[0_0_10px_rgba(250,204,21,0.5)] border border-yellow-600">
                    <span className="text-[8px]">👑</span>
                  </div>
                )}
                {selectedChat.is_verified && (
                  <Check size={10} className="bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full p-0.5" />
                )}
                {selectedChat.is_food_local && (
                  <Store size={10} className="bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-full p-0.5" />
                )}
                {selectedChat.is_matustar && (
                  <Star size={10} className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-white rounded-full p-0.5" />
                )}
              </div>
              {streak && (
                <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-full ${streak.count > 0 ? 'bg-orange-500 animate-bounce' : 'bg-chrome-200 opacity-50'}`}>
                  <span className="text-[10px] font-black italic">🔥 {streak.count} RACHINA</span>
                </div>
              )}
            </div>
          {selectedChat.is_group && (
            <div className="flex space-x-2">
              {(selectedChat.owner_id === user.id || user.is_affiliate_owner) && (
                <button onClick={() => setGroupToDelete(selectedChat.id)} className="p-2 hover:bg-red-500/20 rounded-full text-red-400">
                  <Plus className="rotate-45" size={20} />
                </button>
              )}
              <button onClick={() => {
                setGroupName(selectedChat.name);
                setGroupImage(selectedChat.image_url || '');
                setIsEditingGroup(true);
              }} className="p-2 hover:bg-white/20 rounded-full">
                <Settings size={20} />
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[80%] p-3 rounded-2xl border-2 border-chrome-900 font-bold relative group ${m.sender_id === user.id ? 'bg-chrome-900 text-white' : 'bg-white'}`}
                onDoubleClick={() => (m.sender_id === user.id || user?.is_owner || user?.is_affiliate_owner || (selectedChat.is_group && selectedChat.owner_id === user.id)) && setMessageToDelete(m.id)}
              >
                {(m.sender_id === user.id || user?.is_owner || user?.is_affiliate_owner || (selectedChat.is_group && selectedChat.owner_id === user.id)) && (
                  <button 
                    onClick={() => setMessageToDelete(m.id)}
                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Plus className="rotate-45" size={12} />
                  </button>
                )}
                {m.shared_product_id && (
                  <div className="mb-2 p-2 bg-emerald-100 text-emerald-900 rounded border-2 border-emerald-900 text-[10px] italic flex items-center space-x-2">
                    <Store size={12} />
                    <span>Producto de MatuShop</span>
                  </div>
                )}
                {m.media_url && (
                  <div className="mb-2 rounded-lg overflow-hidden border border-white/20">
                    {m.media_url.startsWith('data:video') || m.media_url.includes('video') || m.media_url.includes('.mp4') || m.media_url.includes('.mov') || m.media_url.includes('.webm') ? (
                      <video 
                        src={m.media_url} 
                        className="w-full" 
                        autoPlay
                        loop
                        muted
                        onLoadedData={(e) => { 
                          e.currentTarget.volume = 1; 
                        }}
                        onClick={(e) => {
                          if (e.currentTarget.muted) {
                            e.currentTarget.muted = false;
                          } else {
                            e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause();
                          }
                        }}
                      />
                    ) : (
                      <img src={m.media_url} className="w-full" referrerPolicy="no-referrer" />
                    )}
                  </div>
                )}
                {!m.media_url && m.content.match(/(https?:\/\/[^\s]+\.(mp4|webm|ogg|mov))/i) && (
                  <div className="mb-2 rounded-lg overflow-hidden border border-white/20">
                    <video src={m.content.match(/(https?:\/\/[^\s]+\.(mp4|webm|ogg|mov))/i)?.[0]} controls className="w-full" />
                  </div>
                )}
                <p className="text-sm">{m.content}</p>
                <p className="text-[8px] opacity-50 mt-1">{new Date(m.created_at).toLocaleTimeString()}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 bg-white border-t-2 border-chrome-900 flex items-center space-x-2 pb-24">
          <button onClick={() => fileInputRef.current?.click()} className="p-2 bg-chrome-100 rounded-full border-2 border-chrome-900"><ImageIcon size={20} /></button>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleMediaSelect} />
          <input 
            className="flex-1 chrome-input" 
            placeholder="ESCRIBE AQUÍ..." 
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && sendMessage()}
          />
          <button onClick={() => sendMessage()} className="p-3 bg-chrome-900 text-white rounded-full"><Send size={20} /></button>
        </div>

        {/* Group Settings Modal */}
        <AnimatePresence>
          {isEditingGroup && (
            <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="chrome-card p-6 w-full max-w-md bg-white space-y-4">
                <h2 className="text-xl font-black italic uppercase border-b-4 border-chrome-900 pb-2">Ajustes del Grupo</h2>
                <div className="flex flex-col items-center space-y-4">
                  <div onClick={() => groupImageInputRef.current?.click()} className="w-24 h-24 rounded-full bg-chrome-200 border-4 border-chrome-900 overflow-hidden cursor-pointer relative group">
                    <img src={groupImage || `https://picsum.photos/seed/g${selectedChat.id || 'default'}/200/200`} alt="Group" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="text-white" size={24} />
                    </div>
                  </div>
                  <input type="file" ref={groupImageInputRef} className="hidden" accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setGroupImage(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }} />
                  <input className="chrome-input w-full" placeholder="NOMBRE DEL GRUPO" value={groupName} onChange={e => setGroupName(e.target.value)} />
                </div>
                <div className="flex flex-col space-y-2">
                  <button onClick={async () => {
                    await updateDoc(doc(db, 'groups', selectedChat.id), {
                      name: groupName,
                      image_url: groupImage
                    });
                    setSelectedChat({...selectedChat, name: groupName, image_url: groupImage});
                    setIsEditingGroup(false);
                  }} className="chrome-button">GUARDAR CAMBIOS</button>
                  <button onClick={() => setIsAddingMembers(true)} className="chrome-button bg-emerald-100 text-emerald-900 border-emerald-900">AGREGAR MIEMBROS</button>
                  
                  {/* Member List with Removal option */}
                  <div className="space-y-2 mt-4">
                    <p className="text-[10px] font-black uppercase opacity-50">Miembros del Grupo</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {allUsers.filter(u => selectedChat.members?.includes(u.id)).map(m => (
                        <div key={m.id} className="flex items-center justify-between p-2 bg-chrome-50 rounded-lg">
                          <span className="text-xs font-bold uppercase">{m.username}</span>
                          {(selectedChat.owner_id === user.id || user.is_affiliate_owner) && m.id !== selectedChat.owner_id && (
                            <button onClick={() => setMemberToRemove(m.id)} className="text-red-600 p-1">
                              <Plus className="rotate-45" size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      {/* Also show current user if they are a member */}
                      {selectedChat.members?.includes(user.id) && (
                        <div className="flex items-center justify-between p-2 bg-chrome-50 rounded-lg">
                          <span className="text-xs font-bold uppercase">{user.username} (TÚ)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button onClick={() => setIsEditingGroup(false)} className="chrome-button bg-red-100 text-red-900 border-red-900">CERRAR</button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Add Members Modal */}
        <AnimatePresence>
          {isAddingMembers && (
            <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="chrome-card p-6 w-full max-w-md bg-white space-y-4">
                <h2 className="text-xl font-black italic uppercase border-b-4 border-chrome-900 pb-2">Agregar Miembros</h2>
                <p className="text-[10px] font-bold opacity-50 uppercase">Contactos recientes</p>
                <div className="max-h-60 overflow-y-auto space-y-2 scrollbar-hide">
                  {contacts.map(c => (
                    <div key={c.id} onClick={() => {
                      if (selectedMembers.includes(c.id)) {
                        setSelectedMembers(selectedMembers.filter(id => id !== c.id));
                      } else {
                        setSelectedMembers([...selectedMembers, c.id]);
                      }
                    }} className={`flex items-center space-x-3 p-2 border-2 cursor-pointer transition-colors ${selectedMembers.includes(c.id) ? 'bg-chrome-900 text-white border-chrome-900' : 'hover:bg-chrome-100 border-transparent'}`}>
                      <div className="w-10 h-10 bg-chrome-400 border-2 border-chrome-900 flex items-center justify-center font-black overflow-hidden">
                        {c.profilePic ? <img src={c.profilePic} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : c.username[0].toUpperCase()}
                      </div>
                      <span className="font-black uppercase text-sm flex-1">{c.username}</span>
                      {selectedMembers.includes(c.id) && <Plus className="rotate-45" size={20} />}
                    </div>
                  ))}
                  {contacts.length === 0 && <p className="text-center opacity-50 font-bold py-4">No tienes contactos recientes</p>}
                </div>
                <div className="flex space-x-2">
                  <button onClick={async () => {
                    const groupRef = doc(db, 'groups', selectedChat.id);
                    const groupDoc = await getDoc(groupRef);
                    if (groupDoc.exists()) {
                      const currentMembers = groupDoc.data().members || [];
                      await updateDoc(groupRef, {
                        members: [...new Set([...currentMembers, ...selectedMembers])]
                      });
                    }
                    setIsAddingMembers(false);
                    setSelectedMembers([]);
                  }} className="chrome-button flex-1" disabled={selectedMembers.length === 0}>AGREGAR</button>
                  <button onClick={() => { setIsAddingMembers(false); setSelectedMembers([]); }} className="chrome-button flex-1 bg-red-100 text-red-900 border-red-900">CANCELAR</button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
        {/* Member Removal Confirmation Modal */}
        <AnimatePresence>
          {memberToRemove && (
            <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="chrome-card p-6 w-full max-w-md bg-white space-y-6 text-center">
                <p className="font-black uppercase italic text-xl">¿ESTÁS SEGURO DE SACAR A ESTE MIEMBRO DEL GRUPO?</p>
                <div className="flex space-x-4">
                  <button 
                    onClick={() => removeMember(memberToRemove)}
                    className="flex-1 chrome-button bg-red-600 text-white border-red-900 py-4 font-black uppercase italic"
                  >
                    SÍ
                  </button>
                  <button 
                    onClick={() => setMemberToRemove(null)}
                    className="flex-1 chrome-button py-4 font-black uppercase italic"
                  >
                    NO
                  </button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Group Deletion Confirmation Modal */}
        <AnimatePresence>
          {groupToDelete && (
            <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="chrome-card p-6 w-full max-w-md bg-white space-y-6 text-center">
                <p className="font-black uppercase italic text-xl">¿ESTÁS SEGURO DE ELIMINAR ESTE GRUPO?</p>
                <div className="flex space-x-4">
                  <button 
                    onClick={() => deleteGroup(groupToDelete)}
                    className="flex-1 chrome-button bg-red-600 text-white border-red-900 py-4 font-black uppercase italic"
                  >
                    SÍ
                  </button>
                  <button 
                    onClick={() => setGroupToDelete(null)}
                    className="flex-1 chrome-button py-4 font-black uppercase italic"
                  >
                    NO
                  </button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Message Delete Confirmation Modal */}
        <AnimatePresence>
          {messageToDelete && (
            <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-end justify-center p-4" onClick={() => setMessageToDelete(null)}>
              <div className="chrome-card w-full max-w-md p-6 space-y-2 animate-in slide-in-from-bottom-10" onClick={e => e.stopPropagation()}>
                {!confirmingDelete ? (
                  <>
                    <button 
                      onClick={() => setConfirmingDelete(true)}
                      className="w-full text-left p-4 font-black uppercase italic hover:bg-red-50 rounded-xl flex items-center space-x-3 text-red-600"
                    >
                      <Plus className="rotate-45" size={20} />
                      <span>Eliminar Mensaje</span>
                    </button>
                    <button 
                      onClick={() => setMessageToDelete(null)} 
                      className="w-full py-4 font-black uppercase text-xs opacity-50"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <div className="py-4 space-y-6 text-center">
                    <p className="font-black uppercase italic text-xl">¿Estás seguro de concretar esta acción?</p>
                    <div className="flex space-x-4">
                      <button 
                        onClick={() => deleteMessage(messageToDelete)}
                        className="flex-1 chrome-button bg-red-600 text-white border-red-900 py-4 font-black uppercase italic"
                      >
                        SÍ
                      </button>
                      <button 
                        onClick={() => {
                          setMessageToDelete(null);
                          setConfirmingDelete(false);
                        }}
                        className="flex-1 chrome-button py-4 font-black uppercase italic"
                      >
                        NO
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 pb-24">
      <div className="flex justify-between items-center">
        <h1 className="matu-title text-3xl italic">Mis Chats!</h1>
        <button onClick={() => setIsCreatingGroup(true)} className="chrome-button flex items-center space-x-2">
          <Users size={18} /> <span>GRUPO</span>
        </button>
      </div>

      <div className="relative">
        <input 
          className="chrome-input w-full pl-10" 
          placeholder="BUSCAR PERSONAS O FOTOS..." 
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
        />
        <Search className="absolute left-3 top-3 opacity-50" size={20} />
      </div>

      {searchQuery.length > 2 && (
        <div className="space-y-4 bg-chrome-100 p-4 rounded-2xl border-2 border-chrome-900">
          <p className="text-[10px] font-black uppercase opacity-50">Resultados de búsqueda</p>
          <div className="space-y-2">
            {searchResults.users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-2 hover:bg-white cursor-pointer rounded-xl transition-colors">
                <div className="flex items-center space-x-3 flex-1" onClick={() => { setSelectedChat(u); setSearchQuery(''); }}>
                <div className="w-10 h-10 bg-chrome-400 border-2 border-chrome-900 flex items-center justify-center font-black overflow-hidden">
                  {u.profilePic ? <img src={u.profilePic} alt={u.username || 'User'} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : (u.username ? u.username[0].toUpperCase() : '?')}
                </div>
                  <span className="font-black uppercase text-sm">{u.username}</span>
                  {u.is_verified && <Check size={10} className="bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full p-0.5 flex-shrink-0" />}
                  {u.is_food_local && <Store size={10} className="bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-full p-0.5 flex-shrink-0" />}
                  {u.is_matustar && <Star size={10} className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-white rounded-full p-0.5 flex-shrink-0" />}
                </div>
                <div className="flex items-center space-x-2">
                  {Boolean(user?.is_owner) && u.id !== user?.id && (
                    <button 
                      onClick={() => { setViewingUserId(u.id); setView('profile'); setSearchQuery(''); setAutoOpenMod(true); }}
                      className="p-2 bg-yellow-400 text-chrome-900 rounded-full border-2 border-chrome-900"
                    >
                      <ShieldAlert size={16} />
                    </button>
                  )}
                  <button 
                    onClick={() => { setViewingUserId(u.id); setView('profile'); setSearchQuery(''); }}
                    className="p-2 bg-chrome-900 text-white rounded-full"
                  >
                    <User size={16} />
                  </button>
                </div>
              </div>
            ))}
            {searchResults.users.length === 0 && (
              <p className="text-center text-[10px] font-bold opacity-50">No se encontraron resultados aproximados</p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[10px] font-black opacity-50 uppercase">Grupos</p>
        {groups.map(g => (
          <button key={g.id} onClick={() => setSelectedChat({...g, is_group: true})} className="w-full chrome-card p-3 flex items-center space-x-4 bg-white hover:bg-chrome-100 transition-colors">
            <div className="w-12 h-12 rounded-full bg-chrome-900 border-2 border-chrome-900 overflow-hidden">
              <img src={g.image_url || `https://picsum.photos/seed/g${g.id}/100/100`} alt={g.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div className="text-left flex-1">
              <div className="flex items-center justify-between">
                <p className="font-black uppercase italic">{g.name}</p>
                {g.streak_count > 0 && (
                  <span className="text-[10px] font-black text-orange-500 animate-pulse">🔥 {g.streak_count}</span>
                )}
              </div>
              <p className="text-[10px] opacity-50 truncate">{g.last_message ? 'Ya se han enviado mensajes' : 'Chat de grupo'}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black opacity-50 uppercase">Mensajes Directos</p>
        {contacts.map((c) => (
          <div key={c.id} onClick={() => setSelectedChat(c)} className="w-full chrome-card p-3 flex items-center space-x-4 bg-white hover:bg-chrome-100 transition-colors cursor-pointer">
            <div 
              className="w-12 h-12 rounded-full bg-chrome-200 border-2 border-chrome-900 overflow-hidden flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); setViewingUserId(c.id); setView('profile'); }}
            >
              <img src={c.profilePic || `https://picsum.photos/seed/${c.id}/100/100`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1 min-w-0">
                  <p className="font-black uppercase italic truncate">{c.username}</p>
                  {c.is_verified && <Check size={10} className="bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full p-0.5 flex-shrink-0" />}
                  {c.is_food_local && <Store size={10} className="bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-full p-0.5 flex-shrink-0" />}
                  {c.is_matustar && <Star size={10} className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-white rounded-full p-0.5 flex-shrink-0" />}
                  {c.streak_count > 0 && (
                    <span className="text-[10px] font-black text-orange-500 animate-pulse flex-shrink-0">🔥 {c.streak_count}</span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {c.unread_count > 0 && (
                    <span className="bg-red-600 text-white text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                      {c.unread_count}
                    </span>
                  )}
                  {Boolean(user?.is_owner) && c.id !== user?.id && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setViewingUserId(c.id); setView('profile'); setAutoOpenMod(true); }}
                      className="p-1.5 bg-yellow-400 text-chrome-900 rounded-full border-2 border-chrome-900 shadow-sm"
                    >
                      <ShieldAlert size={12} />
                    </button>
                  )}
                  <p className="text-[8px] opacity-50">{c.last_message_time ? new Date(c.last_message_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</p>
                </div>
              </div>
              <p className="text-[10px] opacity-50 truncate">{c.last_message ? 'Ya se han enviado mensajes' : 'Sin mensajes aún'}</p>
            </div>
          </div>
        ))}
        {contacts.length === 0 && (
          <div className="py-10 text-center opacity-50 font-black uppercase text-xs">Busca a alguien para chatear</div>
        )}
      </div>

      <AnimatePresence>
        {isCreatingGroup && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="chrome-card p-6 w-full max-w-md bg-white space-y-4">
              <h2 className="text-xl font-black italic uppercase border-b-4 border-chrome-900 pb-2">Crear Grupo</h2>
              <div className="space-y-4">
                <input className="chrome-input w-full" placeholder="NOMBRE DEL GRUPO" value={groupName} onChange={e => setGroupName(e.target.value)} />
                
                <p className="text-[10px] font-bold opacity-50 uppercase">Seleccionar Miembros</p>
                <div className="max-h-40 overflow-y-auto space-y-2 scrollbar-hide">
                  {contacts.map(c => (
                    <div key={c.id} onClick={() => {
                      if (selectedMembers.includes(c.id)) {
                        setSelectedMembers(selectedMembers.filter(id => id !== c.id));
                      } else {
                        setSelectedMembers([...selectedMembers, c.id]);
                      }
                    }} className={`flex items-center space-x-3 p-2 border-2 cursor-pointer transition-colors ${selectedMembers.includes(c.id) ? 'bg-chrome-900 text-white border-chrome-900' : 'hover:bg-chrome-100 border-transparent'}`}>
                      <div className="w-8 h-8 bg-chrome-400 border-2 border-chrome-900 flex items-center justify-center font-black overflow-hidden text-xs">
                        {c.profilePic ? <img src={c.profilePic} alt={c.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : c.username[0].toUpperCase()}
                      </div>
                      <span className="font-black uppercase text-xs flex-1">{c.username}</span>
                      {selectedMembers.includes(c.id) && <Plus className="rotate-45" size={16} />}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex space-x-2">
                <button onClick={async () => {
                  if (!groupName) return;
                  try {
                    await addDoc(collection(db, 'groups'), {
                      name: groupName,
                      owner_id: user.id,
                      members: [user.id, ...selectedMembers],
                      member_count: selectedMembers.length + 1,
                      created_at: new Date().toISOString()
                    });
                    setIsCreatingGroup(false);
                    setGroupName('');
                    setSelectedMembers([]);
                  } catch (err) {
                    console.error("Create group failed", err);
                    handleFirestoreError(err, OperationType.CREATE, 'groups');
                  }
                }} className="chrome-button flex-1" disabled={!groupName}>CREAR</button>
                <button onClick={() => { setIsCreatingGroup(false); setSelectedMembers([]); }} className="chrome-button flex-1 bg-red-100 text-red-900 border-red-900">CANCELAR</button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatView;
