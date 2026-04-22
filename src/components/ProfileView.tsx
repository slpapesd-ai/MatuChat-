import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Camera, ShieldAlert, Check, Store, Star, MessageSquare, Plus, ArrowRight, UserX, Settings, LogOut, Eye, HandMetal, MoreVertical, AlertTriangle, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserData, View } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  doc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  onSnapshot, 
  getDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs,
  increment,
  orderBy,
  setDoc
} from 'firebase/firestore';
import { updatePassword, deleteUser } from 'firebase/auth';

interface ProfileViewProps {
  user: UserData;
  setUser: (user: UserData | null) => void;
  viewingUserId: string | null;
  setViewingUserId: (id: string | null) => void;
  setView: (view: View) => void;
  setSelectedChat: (user: UserData | null) => void;
  handleLogout: () => void;
  autoOpenMod?: boolean;
  setAutoOpenMod?: (val: boolean) => void;
}

const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (err) => {
      console.error("Image compression failed", err);
      reject(new Error("No se pudo procesar la imagen"));
    };
  });
};

const ProfileView = ({ user, setUser, viewingUserId, setViewingUserId, setView, setSelectedChat, handleLogout, autoOpenMod, setAutoOpenMod }: ProfileViewProps) => {
  if (!user) return null;
  const isOwnProfile = !viewingUserId || viewingUserId === user?.id;
  const targetId = viewingUserId || user?.id;

  const [profileData, setProfileData] = useState<any>(isOwnProfile ? user : null);
  const [stats, setStats] = useState<any>(isOwnProfile ? { followers: 0, following: 0, reactions: 0 } : null);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTab, setEditTab] = useState<'profile' | 'password' | 'delete'>('profile');
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isModModalOpen, setIsModModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'ban' | 'verify' | 'verify-food' | 'verify-matustar' | 'block' | 'unblock' | null>(null);
  const [showFollows, setShowFollows] = useState<'followers' | 'following' | null>(null);
  const [followList, setFollowList] = useState<UserData[]>([]);
  const [isFollowListLoading, setIsFollowListLoading] = useState(false);
  const [isUpdatingPic, setIsUpdatingPic] = useState(false);
  const profileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const fetchFollowList = async (type: 'followers' | 'following') => {
    setIsFollowListLoading(true);
    try {
      const collectionName = type === 'followers' ? 'followers' : 'following';
      const q = query(collection(db, 'users', targetId.toString(), collectionName));
      const snapshot = await getDocs(q);
      const usersData: UserData[] = [];
      for (const docSnap of snapshot.docs) {
        const userDoc = await getDoc(doc(db, 'users', docSnap.id));
        if (userDoc.exists()) {
          usersData.push({ id: userDoc.id, ...userDoc.data() } as any);
        }
      }
      setFollowList(usersData);
    } catch (err) {
      console.error("Fetch follow list failed", err);
      setFollowList([]);
    } finally {
      setIsFollowListLoading(false);
    }
  };

  useEffect(() => {
    if (showFollows) {
      fetchFollowList(showFollows);
    }
  }, [showFollows]);

  useEffect(() => {
    if (autoOpenMod) {
      setIsModModalOpen(true);
      setAutoOpenMod?.(false);
    }
  }, [autoOpenMod]);

  const [editData, setEditData] = useState({
    username: '',
    bio: '',
    profilePic: '',
    coverPic: ''
  });

  useEffect(() => {
    if (!targetId) return;
    
    const unsubscribe = onSnapshot(doc(db, 'users', targetId.toString()), (docSnap) => {
      if (docSnap.exists()) {
        const userData = { id: docSnap.id, ...docSnap.data() } as any;
        setProfileData(userData);
        setStats((prev: any) => ({
          ...prev,
          followers: userData.follower_count || 0,
          following: userData.following_count || 0,
          reactions: userData.reaction_count || 0
        }));
        
        if (!isEditing) {
          setEditData({
            username: userData.username || '',
            bio: userData.bio || '',
            profilePic: userData.profilePic || '',
            coverPic: userData.coverPic || ''
          });
        }
      }
    }, (err) => {
      console.error("Profile snapshot error:", err);
      handleFirestoreError(err, OperationType.GET, `users/${targetId}`);
    });

    return () => unsubscribe();
  }, [targetId, isEditing]);

  const fetchProfile = async () => {
    if (!targetId) return;
    try {
      setError(null);
      const userDoc = await getDoc(doc(db, 'users', targetId.toString()));
      if (!userDoc.exists()) {
        throw new Error('Usuario no encontrado');
      }
      const userData = { id: userDoc.id, ...userDoc.data() } as any;
      
      // Check if blocked
      if (userData.blocked_users?.includes(user.id)) {
        setError("Este usuario te ha bloqueado");
        return;
      }

      if (!isOwnProfile && user) {
        const followDoc = await getDoc(doc(db, 'users', user.id.toString(), 'following', targetId.toString()));
        setIsFollowing(followDoc.exists());
      }
    } catch (err: any) {
      console.error(err);
      if (err.message === 'Usuario no encontrado' && isOwnProfile) {
        handleLogout();
        return;
      }
      setError(err.message);
    }
  };

  useEffect(() => {
    setProfileData(null);
    setStats(null);
    fetchProfile();
  }, [targetId]);

  const toggleFollow = async () => {
    if (!user || !targetId) return;
    const followingRef = doc(db, 'users', user.id.toString(), 'following', targetId.toString());
    const followerRef = doc(db, 'users', targetId.toString(), 'followers', user.id.toString());

    if (isFollowing) {
      await deleteDoc(followingRef);
      await deleteDoc(followerRef);
      await updateDoc(doc(db, 'users', user.id.toString()), { following_count: increment(-1) });
      await updateDoc(doc(db, 'users', targetId.toString()), { follower_count: increment(-1) });
    } else {
      await setDoc(followingRef, { created_at: new Date().toISOString() });
      await setDoc(followerRef, { created_at: new Date().toISOString() });
      await updateDoc(doc(db, 'users', user.id.toString()), { following_count: increment(1) });
      await updateDoc(doc(db, 'users', targetId.toString()), { follower_count: increment(1) });
    }
    
    setIsFollowing(!isFollowing);
  };

  const banUser = async () => {
    try {
      await updateDoc(doc(db, 'users', targetId.toString()), { is_banned: true });
      setViewingUserId(null);
      setView('discover');
    } catch (err: any) {
      console.error('Error: ' + err.message);
    } finally {
      setConfirmAction(null);
    }
  };

  const toggleVerify = async () => {
    try {
      const newStatus = !profileData.is_verified;
      await updateDoc(doc(db, 'users', targetId.toString()), { is_verified: newStatus });
      setProfileData({ ...profileData, is_verified: newStatus });
    } catch (err: any) {
      console.error('Error: ' + err.message);
    } finally {
      setConfirmAction(null);
    }
  };

  const toggleVerifyFood = async () => {
    try {
      const newStatus = !profileData.is_food_local;
      await updateDoc(doc(db, 'users', targetId.toString()), { is_food_local: newStatus });
      setProfileData({ ...profileData, is_food_local: newStatus });
    } catch (err: any) {
      console.error('Error: ' + err.message);
    } finally {
      setConfirmAction(null);
    }
  };

  const toggleVerifyMatuStar = async () => {
    try {
      const newStatus = !profileData.is_matustar;
      await updateDoc(doc(db, 'users', targetId.toString()), { is_matustar: newStatus });
      setProfileData({ ...profileData, is_matustar: newStatus });
    } catch (err: any) {
      console.error('Error: ' + err.message);
    } finally {
      setConfirmAction(null);
    }
  };

  const toggleBlock = async () => {
    if (isOwnProfile || !user) return;
    const blockerRef = doc(db, 'users', user.id.toString());
    const blockedRef = doc(db, 'users', targetId.toString());

    const blockerDoc = await getDoc(blockerRef);
    const blockedUsers = blockerDoc.data()?.blocked_users || [];

    if (blockedUsers.includes(targetId.toString())) {
      await updateDoc(blockerRef, { blocked_users: arrayRemove(targetId.toString()) });
    } else {
      await updateDoc(blockerRef, { blocked_users: arrayUnion(targetId.toString()) });
    }
    fetchProfile();
    setConfirmAction(null);
  };

  const handlePasswordChange = async () => {
    setPasswordError(null);
    if (passwordData.newPassword !== passwordData.confirmNewPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        await updatePassword(currentUser, passwordData.newPassword);
        setEditTab('profile');
        setPasswordData({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
      }
    } catch (err: any) {
      setPasswordError(err.message);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.id) {
      console.error('Error: No se encontró el ID del usuario');
      return;
    }
    
    setDeleteError(null);
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        await deleteUser(currentUser);
        await deleteDoc(doc(db, 'users', user.id.toString()));
        localStorage.removeItem('matu_user');
        window.location.reload();
      }
    } catch (err: any) {
      console.error('Error en eliminación:', err);
      setDeleteError(err.message || 'No se pudo eliminar la cuenta');
    }
  };

  const handleUpdate = async (manualData?: any) => {
    try {
      // Check if manualData is an event object (common mistake in React onClick)
      const isEvent = manualData && (typeof manualData === 'object' && ('nativeEvent' in manualData || 'target' in manualData));
      const actualManualData = isEvent ? null : manualData;

      if (actualManualData) setIsUpdatingPic(true);
      // Merge current editData with manualData to ensure all changes (like bio) are preserved
      const dataToSave = actualManualData ? { ...editData, ...actualManualData } : { ...editData };
      
      // If username changed, check uniqueness
      if (dataToSave.username && dataToSave.username !== profileData.username) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', dataToSave.username));
        const querySnapshot = await getDocs(q);
        
        const isTaken = querySnapshot.docs.some(doc => doc.id !== user.id);
        if (isTaken) {
          alert('Este nombre de usuario ya está en uso');
          if (manualData) setIsUpdatingPic(false);
          return;
        }
      }

      await updateDoc(doc(db, 'users', user.id.toString()), dataToSave);
      
      const updatedUser = { ...user, ...dataToSave };
      setUser(updatedUser);
      
      // Update saved accounts in localStorage
      try {
        const saved = localStorage.getItem('matu_saved_accounts');
        if (saved) {
          const accounts = JSON.parse(saved);
          const index = accounts.findIndex((a: any) => a.id === user.id);
          if (index !== -1) {
            accounts[index] = { ...accounts[index], ...dataToSave };
            localStorage.setItem('matu_saved_accounts', JSON.stringify(accounts));
          }
        }
      } catch (e) {
        console.error("Failed to update saved accounts", e);
      }

      await fetchProfile();
      
      // Auto-save doesn't need alerts or closing the modal
    } catch (err: any) {
      console.error('Error: ' + err.message);
      alert('Error al actualizar el perfil: ' + err.message);
    } finally {
      setIsUpdatingPic(false);
    }
  };

  const handleEditFile = async (e: React.ChangeEvent<HTMLInputElement>, field: 'profilePic' | 'coverPic') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        let result = reader.result as string;
        
        // Compress image if it's large
        if (result.length > 150000) { // > 150KB approx
          result = await compressImage(result);
        }

        const newData = { [field]: result };
        setEditData(prev => ({ ...prev, ...newData }));
        
        // Auto-save and close as requested
        if (isEditing) {
          await handleUpdate(newData);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (error) return (
    <div className="p-10 text-center space-y-4">
      <AlertTriangle size={64} className="mx-auto text-red-600" />
      <p className="font-black uppercase italic text-red-600">{error}</p>
      <button onClick={() => { setViewingUserId(null); setView('discover'); }} className="chrome-button">VOLVER AL INICIO</button>
    </div>
  );

  if (!profileData) return <div className="p-10 text-center font-black uppercase italic">Cargando perfil...</div>;

  const displayStats = stats || { followers: 0, following: 0, posts: 0, reactions: 0 };

  return (
    <div className="pb-24">
      <div className="relative h-48 bg-chrome-900 overflow-hidden">
        <img src={profileData.coverPic || `https://picsum.photos/seed/p${targetId}/800/400`} alt="Cover" className="w-full h-full object-cover opacity-50" referrerPolicy="no-referrer" />
        <button onClick={() => { setViewingUserId(null); setView('discover'); }} className="absolute top-6 left-6 p-2 bg-white/20 rounded-full backdrop-blur-md text-white">
          <ArrowLeft size={24} />
        </button>
        {isOwnProfile && (
          <button 
            onClick={() => setIsEditing(true)}
            className="absolute top-6 right-6 p-2 bg-white/20 rounded-full backdrop-blur-md text-white"
          >
            <Camera size={20} />
          </button>
        )}
        {Boolean(user?.is_owner) && !isOwnProfile && (
          <div className="absolute top-6 right-6 flex space-x-2">
            <button 
              onClick={() => setIsModModalOpen(true)} 
              className="p-2 bg-chrome-900 text-white rounded-full shadow-lg border-2 border-white flex items-center space-x-2 px-4"
            >
              <ShieldAlert size={20} />
              <span className="text-[10px] font-black uppercase">Moderación</span>
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {confirmAction && (
          <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="chrome-card p-8 w-full max-w-sm bg-white text-center space-y-6"
            >
              <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center border-4 border-chrome-900 ${confirmAction === 'ban' ? 'bg-red-600 text-white' : confirmAction === 'verify-food' ? 'bg-orange-500 text-white' : 'bg-yellow-400 text-chrome-900'}`}>
                {confirmAction === 'ban' ? <ShieldAlert size={40} /> : confirmAction === 'verify-food' ? <Store size={40} /> : <Check size={40} />}
              </div>
              
              <div className="space-y-2">
                <h2 className="matu-title text-2xl">¿ESTÁS SEGURO?</h2>
                <div className="flex flex-col items-center space-y-1">
                  <p className="text-sm font-black uppercase opacity-70">
                    {confirmAction === 'ban' 
                      ? `¿QUIERES BANEAR A @${profileData.username}?` 
                      : confirmAction === 'block'
                      ? `¿ESTAS SEGURO DE BLOQUEAR A @${profileData.username}?`
                      : confirmAction === 'unblock'
                      ? `¿ESTAS SEGURO DE DESBLOQUEAR A @${profileData.username}?`
                      : confirmAction === 'verify-food'
                      ? `¿QUIERES ${profileData.is_food_local ? 'QUITAR LA VERIFICACIÓN DE LOCAL A' : 'VERIFICAR COMO LOCAL DE COMIDA A'} @${profileData.username}?`
                      : `¿QUIERES ${profileData.is_verified ? 'QUITAR LA VERIFICACIÓN A' : 'VERIFICAR A'} @${profileData.username}?`}
                  </p>
                  {confirmAction === 'ban' && (
                    <p className="text-[10px] text-red-600 font-black uppercase italic">
                      ⚠️ ESTA ACCIÓN ELIMINARÁ LA CUENTA PERMANENTEMENTE.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setConfirmAction(null)}
                  className="chrome-button p-4 bg-chrome-100 text-chrome-900"
                >
                  CANCELAR
                </button>
                <button 
                  onClick={confirmAction === 'ban' ? banUser : confirmAction === 'block' || confirmAction === 'unblock' ? toggleBlock : confirmAction === 'verify-food' ? toggleVerifyFood : confirmAction === 'verify-matustar' ? toggleVerifyMatuStar : toggleVerify}
                  className={`chrome-button p-4 text-white ${confirmAction === 'ban' || confirmAction === 'block' ? 'bg-red-600' : confirmAction === 'verify-food' ? 'bg-orange-500' : confirmAction === 'verify-matustar' ? 'bg-yellow-500' : 'bg-chrome-900'}`}
                >
                  CONFIRMAR
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFollows && (
          <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="chrome-card p-6 w-full max-w-md bg-white space-y-6 max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b-4 border-chrome-900 pb-4">
                <h2 className="matu-title text-xl">{showFollows === 'followers' ? 'Seguidores' : 'Siguiendo'}</h2>
                <button onClick={() => setShowFollows(null)} className="p-2 hover:bg-chrome-100 rounded-full">
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {isFollowListLoading ? (
                  <div className="p-10 text-center font-black uppercase italic">Cargando lista...</div>
                ) : followList.length > 0 ? (
                  followList.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-3 bg-chrome-100 rounded-xl border-2 border-chrome-900 hover:bg-white transition-colors">
                      <div 
                        className="flex items-center space-x-3 cursor-pointer flex-1"
                        onClick={() => {
                          setViewingUserId(u.id);
                          setShowFollows(null);
                        }}
                      >
                        <div className="w-12 h-12 rounded-full bg-chrome-400 border-2 border-chrome-900 overflow-hidden">
                          {u.profilePic ? <img src={u.profilePic} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center font-black text-xl">{u.username[0].toUpperCase()}</div>}
                        </div>
                        <div>
                          <div className="flex items-center space-x-1">
                            <p className="font-black uppercase italic text-sm">{u.username}</p>
                            {u.is_owner && <span className="text-[10px]">👑</span>}
                            {u.is_verified && <Check size={10} className="bg-blue-500 text-white rounded-full p-0.5" />}
                            {u.is_food_local && <Store size={10} className="bg-orange-500 text-white rounded-full p-0.5" />}
                            {u.is_matustar && <Star size={10} className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-white rounded-full p-0.5" />}
                          </div>
                          <p className="text-[10px] opacity-50 truncate max-w-[150px]">{u.bio || 'Sin biografía'}</p>
                        </div>
                      </div>
                      {u.id !== user.id && (
                        <button 
                          onClick={() => {
                            setSelectedChat(u);
                            setView('chat');
                            setShowFollows(null);
                          }}
                          className="p-2 bg-chrome-900 text-white rounded-full"
                        >
                          <MessageSquare size={16} />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-10 text-center font-black uppercase italic opacity-50">No hay usuarios para mostrar</div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModModalOpen && profileData && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="chrome-card p-6 w-full max-w-md bg-white space-y-6"
            >
              <div className="flex items-center justify-between border-b-4 border-chrome-900 pb-4">
                <h2 className="matu-title text-xl">Moderación</h2>
                <button onClick={() => setIsModModalOpen(false)} className="p-2 hover:bg-chrome-100 rounded-full">
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              <div className="flex items-center space-x-4 p-4 bg-chrome-100 rounded-xl border-2 border-chrome-900">
                <div className="w-16 h-16 rounded-full bg-chrome-400 border-2 border-chrome-900 overflow-hidden">
                  <img src={profileData.profilePic || `https://picsum.photos/seed/${targetId || 'default'}/200/200`} alt={profileData.username || 'Profile'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="font-black uppercase italic">@{profileData.username}</p>
                    {profileData.is_verified && (
                      <Check size={14} className="bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full p-0.5" />
                    )}
                    {profileData.is_food_local && (
                      <Store size={14} className="bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-full p-0.5" />
                    )}
                    {profileData.is_matustar && (
                      <Star size={14} className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-white rounded-full p-0.5" />
                    )}
                  </div>
                  <p className="text-[10px] opacity-50">ID: {profileData.userID}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button 
                  onClick={() => { setConfirmAction('verify'); setIsModModalOpen(false); }}
                  className={`w-full p-4 rounded-xl border-4 border-chrome-900 font-black uppercase flex items-center justify-between transition-all active:scale-95 ${profileData.is_verified ? 'bg-chrome-100 text-chrome-900' : 'bg-yellow-400 text-chrome-900'}`}
                >
                  <div className="flex items-center space-x-3">
                    <Check size={24} />
                    <span>{profileData.is_verified ? 'Quitar Verificación' : 'Verificar Usuario'}</span>
                  </div>
                  <ArrowRight size={20} />
                </button>

                <button 
                  onClick={() => { setConfirmAction('verify-food'); setIsModModalOpen(false); }}
                  className={`w-full p-4 rounded-xl border-4 border-chrome-900 font-black uppercase flex items-center justify-between transition-all active:scale-95 ${profileData.is_food_local ? 'bg-chrome-100 text-chrome-900' : 'bg-orange-500 text-white'}`}
                >
                  <div className="flex items-center space-x-3">
                    <Store size={24} />
                    <span>{profileData.is_food_local ? 'Quitar Verif. Local' : 'Verificar Local'}</span>
                  </div>
                  <ArrowRight size={20} />
                </button>

                <button 
                  onClick={() => { setConfirmAction('verify-matustar'); setIsModModalOpen(false); }}
                  className={`w-full p-4 rounded-xl border-4 border-chrome-900 font-black uppercase flex items-center justify-between transition-all active:scale-95 ${profileData.is_matustar ? 'bg-chrome-100 text-chrome-900' : 'bg-yellow-500 text-white'}`}
                >
                  <div className="flex items-center space-x-3">
                    <Star size={24} />
                    <span>{profileData.is_matustar ? 'Quitar MatuStar' : 'Dar MatuStar'}</span>
                  </div>
                  <ArrowRight size={20} />
                </button>

                <button 
                  onClick={() => { setConfirmAction('ban'); setIsModModalOpen(false); }}
                  className="w-full p-4 rounded-xl border-4 border-chrome-900 bg-red-600 text-white font-black uppercase flex items-center justify-between transition-all active:scale-95"
                >
                  <div className="flex items-center space-x-3">
                    <ShieldAlert size={24} />
                    <span>Banear Usuario</span>
                  </div>
                  <ArrowRight size={20} />
                </button>
              </div>

              <p className="text-[10px] text-center opacity-50 font-bold uppercase italic">
                ✨ Las acciones de moderación son permanentes y quedan registradas.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="px-4 sm:px-6 -mt-16 relative z-10 space-y-6">
        <div className="flex items-end justify-between">
          <div className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 p-1 bg-white shadow-2xl overflow-hidden ${stats?.hasStatus ? 'border-purple-600' : 'border-chrome-900'}`}>
            <img 
              src={profileData.profilePic || `https://picsum.photos/seed/${targetId}/200/200`} 
              className="w-full h-full rounded-full object-cover cursor-pointer" 
              referrerPolicy="no-referrer"
              onClick={() => {
                if (stats?.hasStatus) setView('discover');
              }} 
            />
          </div>
          <div className="flex space-x-2 mb-2">
            {!isOwnProfile ? (
              <>
                <button onClick={toggleFollow} className={`chrome-button px-4 sm:px-6 py-2 sm:py-3 ${isFollowing ? 'bg-chrome-100' : 'bg-chrome-900 text-white'}`}>
                  {isFollowing ? 'SIGUIENDO' : 'SEGUIR'}
                </button>
                <button onClick={() => { setSelectedChat(profileData); setView('chat'); }} className="chrome-button p-3 sm:p-4 bg-white">
                  <MessageSquare size={24} className="sm:w-7 sm:h-7" />
                </button>
                <button 
                  onClick={() => setConfirmAction(displayStats.is_blocking ? 'unblock' : 'block')} 
                  className={`chrome-button p-3 sm:p-4 ${displayStats.is_blocking ? 'bg-red-600 text-white' : 'bg-white text-red-600'}`}
                  title={displayStats.is_blocking ? 'Desbloquear' : 'Bloquear'}
                >
                  <UserX size={24} className="sm:w-7 sm:h-7" />
                </button>
              </>
            ) : (
              <div className="flex space-x-2">
                <button onClick={() => setIsEditing(true)} className="chrome-button p-3 sm:p-4 bg-white">
                  <Settings size={24} className="sm:w-7 sm:h-7" />
                </button>
                <button onClick={handleLogout} className="chrome-button p-3 sm:p-4 bg-red-600 text-white border-red-900">
                  <LogOut size={24} className="sm:w-7 sm:h-7" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h2 className="text-3xl font-black uppercase italic tracking-tighter">{profileData.username}</h2>
              {profileData.is_owner && (
                <div className="flex items-center justify-center bg-yellow-400 rounded-full p-1 shadow-[0_0_10px_rgba(250,204,21,0.5)] border border-yellow-600" title="Owner">
                  <span className="text-sm">👑</span>
                </div>
              )}
              {profileData.is_verified && (
                <Check size={18} className="bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full p-0.5" />
              )}
              {profileData.is_food_local && (
                <Store size={18} className="bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-full p-0.5" />
              )}
              {profileData.is_matustar && (
                <Star size={18} className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-white rounded-full p-0.5" />
              )}
            </div>
          </div>
          <p className="text-xs font-bold opacity-50 uppercase tracking-widest">ID: {profileData.userID}</p>
          <p className="font-bold text-sm leading-tight">{profileData.bio || 'Sin biografía aún.'}</p>
        </div>

        <div className="flex chrome-card bg-white p-5 divide-x-2 divide-chrome-900">
          <div className="text-center flex-1 cursor-pointer hover:bg-chrome-100 transition-colors" onClick={() => setShowFollows('followers')}>
            <p className="font-black text-2xl">{displayStats.followers}</p>
            <p className="text-xs font-bold uppercase opacity-50">Seguidores</p>
          </div>
          <div className="text-center flex-1 cursor-pointer hover:bg-chrome-100 transition-colors" onClick={() => setShowFollows('following')}>
            <p className="font-black text-2xl">{displayStats.following}</p>
            <p className="text-xs font-bold uppercase opacity-50">Siguiendo</p>
          </div>
          <div className="text-center flex-1">
            <p className="font-black text-2xl">🤟 {displayStats.reactions}</p>
            <p className="text-xs font-bold uppercase opacity-50">Reacciones</p>
          </div>
        </div>

        <div className="p-10 text-center space-y-4 border-2 border-dashed border-chrome-400 rounded-3xl opacity-50">
          <User size={48} className="mx-auto" />
          <p className="font-black uppercase italic text-sm">Este usuario es parte de MatuSocial</p>
          <p className="text-[10px] uppercase font-bold tracking-tighter">¡Envía un mensaje para empezar a socializar!</p>
        </div>
      </div>

      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
            <div className="chrome-card p-6 w-full max-w-md bg-white space-y-4 overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between border-b-4 border-chrome-900 pb-2">
                <h2 className="text-xl font-black uppercase italic">Configuración</h2>
                <button onClick={() => { setIsEditing(false); setEditTab('profile'); }} className="p-1 hover:bg-chrome-100 rounded-full">
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              <div className="flex border-b-2 border-chrome-900">
                <button onClick={() => setEditTab('profile')} className={`flex-1 py-2 text-[10px] font-black uppercase ${editTab === 'profile' ? 'bg-chrome-900 text-white' : ''}`}>Perfil</button>
                <button onClick={() => setEditTab('password')} className={`flex-1 py-2 text-[10px] font-black uppercase ${editTab === 'password' ? 'bg-chrome-900 text-white' : ''}`}>Contraseña</button>
                <button onClick={() => setEditTab('delete')} className={`flex-1 py-2 text-[10px] font-black uppercase ${editTab === 'delete' ? 'bg-red-600 text-white' : 'text-red-600'}`}>Eliminar</button>
              </div>
              
              {editTab === 'profile' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase opacity-50">Foto de Portada (Rectangular)</p>
                    <input 
                      type="file" 
                      ref={coverInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={(e) => handleEditFile(e, 'coverPic')} 
                    />
                    <div 
                      onClick={() => !isUpdatingPic && coverInputRef.current?.click()}
                      className={`h-32 bg-chrome-100 border-2 border-dashed border-chrome-900 rounded-xl overflow-hidden cursor-pointer flex items-center justify-center relative ${isUpdatingPic ? 'opacity-50 cursor-wait' : 'active:scale-95 transition-transform'}`}
                    >
                      {editData.coverPic ? (
                        <img src={editData.coverPic} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <Camera size={32} className="opacity-30" />
                      )}
                      {isUpdatingPic && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase opacity-50">Foto de Perfil</p>
                    <input 
                      type="file" 
                      ref={profileInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={(e) => handleEditFile(e, 'profilePic')} 
                    />
                    <div className="flex justify-center">
                      <div 
                        onClick={() => !isUpdatingPic && profileInputRef.current?.click()}
                        className={`w-24 h-24 rounded-full bg-chrome-100 border-2 border-dashed border-chrome-900 overflow-hidden cursor-pointer flex items-center justify-center relative ${isUpdatingPic ? 'opacity-50 cursor-wait' : 'active:scale-95 transition-transform'}`}
                      >
                        {editData.profilePic ? (
                          <img src={editData.profilePic} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Camera size={24} className="opacity-30" />
                        )}
                        {isUpdatingPic && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase opacity-50">Nombre de Usuario</p>
                    <input 
                      className="chrome-input w-full" 
                      value={editData.username} 
                      onChange={e => setEditData({ ...editData, username: e.target.value })} 
                      onBlur={() => handleUpdate()}
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase opacity-50">Biografía</p>
                    <textarea 
                      className="chrome-input w-full h-24 resize-none" 
                      value={editData.bio} 
                      onChange={e => setEditData({ ...editData, bio: e.target.value })} 
                      onBlur={() => handleUpdate()}
                    />
                  </div>
                </div>
              )}

              {editTab === 'password' && (
                <div className="space-y-4">
                  {passwordError && (
                    <div className="p-3 bg-red-50 border-2 border-red-600 rounded-xl">
                      <p className="text-[10px] text-red-600 font-black uppercase italic">⚠️ {passwordError}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase opacity-50">Contraseña Actual</p>
                    <input 
                      type="password"
                      className="chrome-input w-full" 
                      value={passwordData.currentPassword} 
                      onChange={e => { setPasswordData({ ...passwordData, currentPassword: e.target.value }); setPasswordError(null); }} 
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase opacity-50">Nueva Contraseña</p>
                    <input 
                      type="password"
                      className="chrome-input w-full" 
                      value={passwordData.newPassword} 
                      onChange={e => { setPasswordData({ ...passwordData, newPassword: e.target.value }); setPasswordError(null); }} 
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase opacity-50">Confirmar Nueva Contraseña</p>
                    <input 
                      type="password"
                      className="chrome-input w-full" 
                      value={passwordData.confirmNewPassword} 
                      onChange={e => { setPasswordData({ ...passwordData, confirmNewPassword: e.target.value }); setPasswordError(null); }} 
                    />
                  </div>
                  <button onClick={handlePasswordChange} className="chrome-button w-full bg-chrome-900 text-white py-4">CAMBIAR CONTRASEÑA</button>
                </div>
              )}

              {editTab === 'delete' && (
                <div className="space-y-6">
                  <div className="p-4 bg-red-50 border-4 border-red-600 rounded-2xl text-center">
                    <AlertTriangle className="text-red-600 mx-auto mb-2" size={48} />
                    <h3 className="text-xl font-black uppercase italic text-red-600">Zona de Peligro</h3>
                    <p className="text-[10px] font-bold uppercase opacity-70">Al borrar tu cuenta perderás todos tus posts, mensajes, seguidores y racha para siempre.</p>
                  </div>

                  {deleteStep === 0 && (
                    <button 
                      onClick={() => setDeleteStep(1)} 
                      className="chrome-button w-full bg-red-600 text-white py-6 text-xl"
                    >
                      ELIMINAR MI CUENTA PARA SIEMPRE
                    </button>
                  )}

                  {deleteStep === 1 && (
                    <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                      <p className="text-center font-black uppercase text-red-600 text-lg italic">¿estas seguro de ELIMINAR LA CUENTA PARA SIEMPRE?</p>
                      <div className="flex space-x-4">
                        <button 
                          onClick={() => setDeleteStep(2)} 
                          className="chrome-button flex-1 bg-red-600 text-white py-4"
                        >
                          SI
                        </button>
                        <button 
                          onClick={() => setDeleteStep(0)} 
                          className="chrome-button flex-1 bg-chrome-200 py-4"
                        >
                          NO
                        </button>
                      </div>
                    </div>
                  )}

                  {deleteStep === 2 && (
                    <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                      <p className="text-center font-black uppercase text-red-600 text-xl italic animate-pulse">¿SI quieres ELIMINAR LA CUENTA?</p>
                      <div className="flex space-x-4">
                        <button 
                          onClick={handleDeleteAccount} 
                          className="chrome-button flex-1 bg-red-600 text-white py-4"
                        >
                          SI, ELIMINAR
                        </button>
                        <button 
                          onClick={() => setDeleteStep(0)} 
                          className="chrome-button flex-1 bg-chrome-200 py-4"
                        >
                          NO, CANCELAR
                        </button>
                      </div>
                    </div>
                  )}

                  {deleteError && (
                    <p className="text-[10px] text-red-600 font-black uppercase italic text-center">
                      ⚠️ {deleteError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProfileView;
