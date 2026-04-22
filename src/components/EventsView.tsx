import React, { useState, useEffect, useRef } from 'react';
import { Plus, Upload, ArrowLeft, Calendar, MapPin, Users, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserData, View } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, updateDoc, arrayUnion, doc, getDoc, where, deleteDoc, arrayRemove } from 'firebase/firestore';

interface EventsViewProps {
  user: UserData;
  setSelectedChat: (chat: any) => void;
  setView: (view: View) => void;
  setViewingUserId: (id: string | null) => void;
}

const EventsView = ({ user, setSelectedChat, setView, setViewingUserId }: EventsViewProps) => {
  if (!user) return null;
  const [isCreating, setIsCreating] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [userGroups, setUserGroups] = useState<any[]>([]);
  const [newEvent, setNewEvent] = useState({ title: '', description: '', location: '', date: '', media_url: '', media_type: 'image', group_id: '' });
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; title: string; onConfirm: () => void } | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    const eventsRef = collection(db, 'events');
    const q = query(eventsRef, orderBy('created_at', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eventsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEvents(eventsData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'events'));

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      const updated = events.find(e => e.id === selectedEvent.id);
      if (updated) {
        setSelectedEvent(updated);
      }
    }
  }, [events, selectedEvent?.id]);

  useEffect(() => {
    const groupsRef = collection(db, 'groups');
    const q = query(groupsRef, where('members', 'array-contains', user.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUserGroups(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [user.id]);

  const handleCreate = async () => {
    if (!newEvent.title) return;
    try {
      const eventDoc = await addDoc(collection(db, 'events'), {
        ...newEvent,
        organizer_id: user.id,
        attendees: [user.id],
        attendee_count: 1,
        created_at: new Date().toISOString()
      });

      // If linked to a group, ensure organizer is a member
      if (newEvent.group_id) {
        const groupRef = doc(db, 'groups', newEvent.group_id);
        const groupDoc = await getDoc(groupRef);
        if (groupDoc.exists()) {
          const groupData = groupDoc.data();
          if (!groupData.members?.includes(user.id)) {
            await updateDoc(groupRef, {
              members: arrayUnion(user.id),
              member_count: (groupData.member_count || 0) + 1
            });
          }
        }
      }

      setIsCreating(false);
      setNewEvent({ title: '', description: '', location: '', date: '', media_url: '', media_type: 'image', group_id: '' });
    } catch (err) {
      console.error("Create event failed", err);
      handleFirestoreError(err, OperationType.CREATE, 'events');
    }
  };

  const handleAttend = async (event: any) => {
    try {
      const eventRef = doc(db, 'events', event.id);
      const isAttending = event.attendees?.includes(user.id);
      
      if (isAttending) {
        setConfirmModal({
          show: true,
          title: "¿DESEAS DEJAR DE ASISTIR A ESTE EVENTO?",
          onConfirm: async () => {
            try {
              const newAttendees = event.attendees.filter((id: string) => id !== user.id);
              await updateDoc(eventRef, {
                attendees: newAttendees,
                attendee_count: Math.max(0, (event.attendee_count || 1) - 1)
              });

              if (event.group_id) {
                const groupRef = doc(db, 'groups', event.group_id);
                const groupDoc = await getDoc(groupRef);
                if (groupDoc.exists()) {
                  const groupData = groupDoc.data();
                  const newMembers = (groupData.members || []).filter((id: string) => id !== user.id);
                  await updateDoc(groupRef, {
                    members: newMembers,
                    member_count: Math.max(0, (groupData.member_count || 1) - 1)
                  });
                }
              }
              setConfirmModal(null);
            } catch (err) {
              console.error("Unattend failed", err);
              handleFirestoreError(err, OperationType.UPDATE, 'events/unattend');
            }
          }
        });
        return;
      }

      await updateDoc(eventRef, {
        attendees: arrayUnion(user.id),
        attendee_count: (event.attendee_count || 0) + 1
      });
      
      if (event.group_id) {
        const groupRef = doc(db, 'groups', event.group_id);
        const groupDoc = await getDoc(groupRef);
        if (groupDoc.exists()) {
          const groupData = groupDoc.data();
          if (!groupData.members?.includes(user.id)) {
            await updateDoc(groupRef, {
              members: arrayUnion(user.id),
              member_count: (groupData.member_count || 0) + 1
            });
          }
          setSelectedChat({id: groupDoc.id, ...groupData, is_group: true});
          setView('chat');
        }
      }
    } catch (err) {
      console.error("Attend event failed", err);
      handleFirestoreError(err, OperationType.UPDATE, 'events/attend');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    setConfirmModal({
      show: true,
      title: "¿ESTÁS SEGURO DE ELIMINAR ESTE EVENTO?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'events', eventId));
          setSelectedEvent(null);
          setConfirmModal(null);
        } catch (err) {
          console.error("Delete event failed", err);
          handleFirestoreError(err, OperationType.DELETE, 'events');
        }
      }
    });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewEvent({ 
          ...newEvent, 
          media_url: reader.result as string,
          media_type: 'image'
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="p-6 space-y-6 pb-24">
      <div className="flex justify-between items-center">
        <h1 className="matu-title text-3xl italic">Eventos</h1>
        <button onClick={() => setIsCreating(true)} className="chrome-button p-2"><Plus size={24} /></button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {events.length === 0 ? (
          <div className="py-20 text-center opacity-50 font-black uppercase">No hay eventos próximos</div>
        ) : (
          events.map(event => (
            <div key={event.id} className="chrome-card overflow-hidden cursor-pointer" onClick={() => setSelectedEvent(event)}>
              {event.media_url && (
                <div className="aspect-video bg-black">
                  {event.media_type === 'video' ? (
                    <video src={event.media_url} className="w-full h-full object-cover" />
                  ) : (
                    <img src={event.media_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  )}
                </div>
              )}
              <div className="p-4 flex justify-between items-center">
                <div className="flex-1 min-w-0">
                  <h3 className="font-black uppercase italic text-xl truncate">{event.title}</h3>
                  <div className="flex items-center space-x-2 text-[10px] font-bold opacity-50 uppercase">
                    <MapPin size={10} />
                    <span className="truncate">{event.location}</span>
                    {event.date && (
                      <>
                        <span className="mx-1">•</span>
                        <Calendar size={10} />
                        <span>{new Date(event.date).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleAttend(event); }} 
                  className={`chrome-button px-4 py-2 text-xs ${event.attendees?.includes(user.id) ? 'bg-chrome-100 text-chrome-900' : 'bg-chrome-900 text-white'}`}
                >
                  {event.attendees?.includes(user.id) ? 'ASISTIENDO' : 'ASISTIR'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
            <div className="chrome-card p-6 w-full max-w-md bg-white space-y-4">
              <h2 className="text-2xl font-black italic uppercase border-b-4 border-chrome-900 pb-2">Nuevo Evento</h2>
              <input className="chrome-input w-full" placeholder="NOMBRE DEL EVENTO" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} />
              <input className="chrome-input w-full" placeholder="UBICACIÓN" value={newEvent.location} onChange={e => setNewEvent({...newEvent, location: e.target.value})} />
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase opacity-50 ml-2">Fecha y Hora</label>
                <input type="datetime-local" className="chrome-input w-full" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} />
              </div>
              <textarea className="chrome-input w-full h-24" placeholder="DESCRIPCIÓN" value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} />
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase opacity-50 ml-2">Vincular a Comunidad (Opcional)</label>
                <select 
                  className="chrome-input w-full" 
                  value={newEvent.group_id} 
                  onChange={e => setNewEvent({...newEvent, group_id: e.target.value})}
                >
                  <option value="">NINGUNA</option>
                  {userGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div 
                className="aspect-video bg-chrome-100 border-2 border-dashed border-chrome-900 flex flex-col items-center justify-center cursor-pointer overflow-hidden"
                onClick={() => fileInputRef.current?.click()}
              >
                {newEvent.media_url ? (
                  newEvent.media_type === 'video' ? (
                    <video src={newEvent.media_url} className="w-full h-full object-cover" />
                  ) : (
                      <img src={newEvent.media_url} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  )
                ) : (
                  <>
                    <Upload size={32} className="opacity-50" />
                    <span className="text-[10px] font-black uppercase opacity-50">Subir Imagen</span>
                  </>
                )}
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFile} />
              <div className="flex space-x-2">
                <button onClick={handleCreate} className="chrome-button flex-1 bg-chrome-900 text-white">CREAR</button>
                <button onClick={() => setIsCreating(false)} className="chrome-button flex-1">CANCELAR</button>
              </div>
            </div>
          </div>
        )}

        {selectedEvent && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-white flex flex-col"
          >
            <div className="p-4 flex items-center justify-between border-b-4 border-chrome-900">
              <div className="flex items-center space-x-4">
                <button onClick={() => setSelectedEvent(null)}><ArrowLeft size={24} /></button>
                <h2 className="text-xl font-black uppercase italic truncate">{selectedEvent.title}</h2>
              </div>
              {(selectedEvent.organizer_id === user.id || user.is_affiliate_owner) && (
                <button 
                  onClick={() => handleDeleteEvent(selectedEvent.id)}
                  className="p-2 bg-red-100 text-red-600 rounded-full border-2 border-red-600"
                >
                  <Plus className="rotate-45" size={20} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="aspect-video bg-black border-4 border-chrome-900 rounded-2xl overflow-hidden relative group/video">
                {selectedEvent.media_url ? (
                  selectedEvent.media_type === 'video' ? (
                    <>
                      <video 
                        ref={videoRef}
                        src={selectedEvent.media_url} 
                        className="w-full h-full object-cover" 
                        loop
                        muted={isMuted}
                        onClick={(e) => {
                          if (isMuted) {
                            setIsMuted(false);
                          } else {
                            e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause();
                          }
                        }}
                      />
                      {/* Volume Control Overlay */}
                      <div className="absolute bottom-4 left-4 flex items-center space-x-2 bg-black/50 backdrop-blur-md p-2 rounded-full opacity-0 group-hover/video:opacity-100 transition-opacity z-10">
                        <button onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }} className="text-white">
                          {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </button>
                        <input 
                          type="range" 
                          min="0" 
                          max="1" 
                          step="0.1" 
                          value={isMuted ? 0 : volume} 
                          onChange={(e) => {
                            e.stopPropagation();
                            setVolume(parseFloat(e.target.value));
                            setIsMuted(false);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-20 accent-white cursor-pointer"
                        />
                      </div>
                    </>
                  ) : (
                    <img src={selectedEvent.media_url} alt="Event" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-20"><Calendar size={128} /></div>
                )}
              </div>
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-chrome-900">
                  <MapPin size={24} />
                  <p className="text-xl font-black uppercase italic">{selectedEvent.location}</p>
                </div>
                {selectedEvent.date && (
                  <div className="flex items-center space-x-2 text-chrome-900">
                    <Calendar size={24} />
                    <p className="text-xl font-black uppercase italic">
                      {new Date(selectedEvent.date).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
                    </p>
                  </div>
                )}
                <div className="flex items-center space-x-2 text-chrome-900">
                  <Users size={24} />
                  <p className="text-xl font-black uppercase italic">{selectedEvent.attendees?.length || 0} ASISTENTES</p>
                </div>
                <p className="text-sm font-medium leading-relaxed">{selectedEvent.description}</p>
                
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedEvent.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chrome-button w-full flex items-center justify-center space-x-2 bg-emerald-600 text-white border-emerald-900"
                >
                  <MapPin size={20} /> <span>VER EN MAPS</span>
                </a>

                <button 
                  onClick={() => handleAttend(selectedEvent)} 
                  className={`chrome-button w-full py-4 ${selectedEvent.attendees?.includes(user.id) ? 'bg-chrome-100 text-chrome-900' : 'bg-chrome-900 text-white'}`}
                >
                  {selectedEvent.attendees?.includes(user.id) 
                    ? (selectedEvent.group_id ? 'VER CHAT DEL GRUPO' : 'YA ESTÁS ASISTIENDO') 
                    : (selectedEvent.group_id ? 'ASISTIR Y UNIRSE AL GRUPO' : 'ASISTIR AL EVENTO')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="chrome-card p-6 w-full max-w-md bg-white space-y-6 text-center">
              <p className="font-black uppercase italic text-xl">{confirmModal.title}</p>
              <div className="flex space-x-4">
                <button 
                  onClick={confirmModal.onConfirm}
                  className="flex-1 chrome-button bg-red-600 text-white border-red-900 py-4 font-black uppercase italic"
                >
                  SÍ
                </button>
                <button 
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 chrome-button py-4 font-black uppercase italic"
                >
                  NO
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EventsView;
