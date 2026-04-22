import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { UserData, View } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';

interface LoginViewProps {
  setUser: React.Dispatch<React.SetStateAction<UserData | null>>;
  setView: (view: View) => void;
}

const LoginView = ({ setUser, setView }: LoginViewProps) => {
  const [authData, setAuthData] = useState({ username: '', password: '', affiliateCode: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAffiliateMode, setIsAffiliateMode] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<UserData[]>(() => {
    try {
      const saved = localStorage.getItem('matu_saved_accounts');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Failed to parse matu_saved_accounts from localStorage", e);
      return [];
    }
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const OWNER_CODE = "SamuelEduardo5524$Samypider067";
      
      // If they provided an affiliate code, it MUST be correct
      if (isAffiliateMode && authData.affiliateCode !== OWNER_CODE) {
        setError("CODIGO IINCORRECTO, INTENTE DE NUEVO.");
        setLoading(false);
        return;
      }

      let email = authData.username;
      
      // If it doesn't look like an email, try to find it by username
      if (!email.includes('@')) {
        try {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('username', '==', authData.username));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            email = querySnapshot.docs[0].data().email;
          } else {
            setError('Nombre de usuario no encontrado');
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error("Fetch user by username failed", err);
          setError('Error al buscar el usuario');
          setLoading(false);
          return;
        }
      }

      const userCredential = await signInWithEmailAndPassword(auth, email, authData.password);
      const firebaseUser = userCredential.user;

      // Fetch full user data from Firestore
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        
        if (userDoc.exists()) {
          let loggedUser = { id: firebaseUser.uid, ...userDoc.data() } as UserData;
          
          // If logged in with affiliate code, ensure they have owner benefits
          if (isAffiliateMode && (!loggedUser.is_owner || !loggedUser.is_verified || !loggedUser.is_affiliate_owner)) {
            const updates = { is_owner: true, is_verified: true, is_affiliate_owner: true };
            await updateDoc(doc(db, 'users', firebaseUser.uid), updates);
            loggedUser = { ...loggedUser, ...updates };
          }

          setUser(loggedUser);
          
          // Save to saved accounts
          const updated = [loggedUser, ...savedAccounts.filter((a: any) => a && a.id !== loggedUser.id)].slice(0, 5);
          setSavedAccounts(updated);
          localStorage.setItem('matu_saved_accounts', JSON.stringify(updated));
          setView('discover');
        } else {
          setError('No se encontró el perfil del usuario');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
        setError('Error al cargar el perfil');
      }
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Usuario o contraseña incorrectos');
      } else {
        setError('Error al iniciar sesión: ' + (err.message || 'Desconocido'));
      }
    } finally {
      setLoading(false);
    }
  };

  const removeAccount = (id: string | number) => {
    const updated = savedAccounts.filter((a: any) => a.id !== id);
    setSavedAccounts(updated);
    localStorage.setItem('matu_saved_accounts', JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-8 space-y-10">
      <h1 className="matu-title text-center text-5xl sm:text-6xl">MatuChat!</h1>
      
      {savedAccounts.length > 0 && !isAffiliateMode && (
        <div className="w-full max-w-md space-y-4">
          <p className="text-center font-black uppercase text-xs opacity-50 italic">Cuentas Guardadas</p>
          <div className="flex space-x-4 overflow-x-auto pb-4 scrollbar-hide">
            {savedAccounts.map((acc: any) => (
              <div key={acc.id} className="flex-shrink-0 flex flex-col items-center space-y-2 relative group">
                <div 
                  onClick={async () => {
                    setLoading(true);
                    try {
                      // For saved accounts, we might need to re-auth or just use the saved data
                      // For now, let's try to fetch fresh data if they are already authed
                      if (auth.currentUser && auth.currentUser.uid === acc.id) {
                        const userDoc = await getDoc(doc(db, 'users', acc.id as string));
                        if (userDoc.exists()) {
                          setUser({ id: acc.id, ...userDoc.data() } as UserData);
                          setView('discover');
                        }
                      } else {
                        // If not authed as this user, they need to enter password
                        // For simplicity in this demo, we'll just set the username and let them enter password
                        setAuthData(prev => ({ ...prev, username: acc.username }));
                        setError('Por favor ingresa tu contraseña para esta cuenta.');
                      }
                    } catch (e) {
                      console.error("Quick login failed", e);
                      setError('Error al acceder a la cuenta guardada');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-chrome-200 border-2 border-chrome-900 overflow-hidden cursor-pointer hover:scale-110 transition-transform shadow-lg"
                >
                  <img src={acc.profilePic || `https://picsum.photos/seed/u${acc.id}/100/100`} alt={acc.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <p className="text-[10px] font-black uppercase truncate max-w-[64px]">@{acc.username}</p>
                <button 
                  onClick={() => removeAccount(acc.id)}
                  className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <LogOut size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="chrome-card p-8 sm:p-10 w-full max-w-md space-y-8">
        <h2 className="text-3xl font-black uppercase italic border-b-4 border-chrome-900 pb-2">
          {isAffiliateMode ? 'Affiliate Login' : 'Login'}
        </h2>
        {isAffiliateMode && (
          <p className="text-[10px] font-black uppercase text-yellow-600 bg-yellow-50 p-2 border-2 border-yellow-500 animate-pulse">
            ✨ Ingresa con tu código de afiliado para reclamar o mantener tus beneficios de Owner y Verificación.
          </p>
        )}
        <form onSubmit={handleLogin} className="flex flex-col space-y-4">
          <input 
            type="text" 
            placeholder="USUARIO O TELÉFONO" 
            className="chrome-input"
            value={authData.username}
            onChange={e => setAuthData({...authData, username: e.target.value})}
            required
          />
          <input 
            type="password" 
            placeholder="CONTRASEÑA" 
            className="chrome-input"
            value={authData.password}
            onChange={e => setAuthData({...authData, password: e.target.value})}
            required
          />
          {isAffiliateMode && (
            <input 
              type="text" 
              placeholder="CÓDIGO DE AFILIADO" 
              className="chrome-input border-yellow-500"
              value={authData.affiliateCode}
              onChange={e => setAuthData({...authData, affiliateCode: e.target.value})}
              required
            />
          )}
          {error && <p className="text-red-600 font-bold uppercase text-sm">{error}</p>}
          <button type="submit" className="chrome-button text-xl py-4" disabled={loading}>
            {loading ? 'CARGANDO...' : 'ENTRAR'}
          </button>
        </form>
        <div className="flex flex-col space-y-2 text-center">
          <button onClick={() => setView('register')} className="font-bold uppercase hover:underline">¿No tienes cuenta? Regístrate</button>
          <button 
            onClick={() => setIsAffiliateMode(!isAffiliateMode)} 
            className="text-xs font-black uppercase opacity-70 hover:opacity-100 transition-opacity"
          >
            {isAffiliateMode ? 'Volver al login normal' : 'Codigo de afiliados:'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
