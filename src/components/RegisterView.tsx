import React, { useState } from 'react';
import { UserData, View } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';

interface RegisterViewProps {
  setView: (view: View) => void;
  setUser: (user: UserData | null) => void;
}

const RegisterView = ({ setView, setUser }: RegisterViewProps) => {
  const [authData, setAuthData] = useState({ username: '', password: '', email: '', phone: '', affiliateCode: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAffiliateMode, setIsAffiliateMode] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
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

      // Check if username is taken and valid
      try {
        if (!/^[a-zA-Z0-9_]+$/.test(authData.username)) {
          setError('El nombre de usuario solo puede contener letras, números y guiones bajos');
          setLoading(false);
          return;
        }

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', authData.username));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          setError('El nombre de usuario ya está en uso');
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Check username failed", err);
      }

      const email = authData.email || `${authData.username.toLowerCase()}@matuchat.com`;
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, authData.password);
      const firebaseUser = userCredential.user;

      const newUser: UserData = {
        id: firebaseUser.uid,
        userID: Math.floor(1000 + Math.random() * 9000),
        username: authData.username,
        email: email,
        phone: authData.phone,
        is_owner: isAffiliateMode,
        is_affiliate_owner: isAffiliateMode,
        is_verified: isAffiliateMode,
        follower_count: 0,
        following_count: 0,
        reaction_count: 0,
        created_at: new Date().toISOString()
      };

      // Save user to Firestore
      try {
        await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
        setUser(newUser);
        setView('discover');
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${firebaseUser.uid}`);
        setError('Error al crear el perfil');
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError('El correo electrónico ya está en uso');
      } else if (err.code === 'auth/weak-password') {
        setError('La contraseña es demasiado débil');
      } else {
        setError('Error al registrarse: ' + (err.message || 'Desconocido'));
      }
    } finally {
      setLoading(false);
    }
  };

  const onRegister = (e: any) => {
    e.preventDefault();
    handleRegister(e);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-8 space-y-10">
      <h1 className="matu-title text-center text-5xl sm:text-6xl">MatuChat!</h1>
      <div className="chrome-card p-8 sm:p-10 w-full max-w-md space-y-8">
        <h2 className="text-3xl font-black uppercase italic border-b-4 border-chrome-900 pb-2">
          {isAffiliateMode ? 'Affiliate Registro' : 'Registro'}
        </h2>
        {isAffiliateMode && (
          <p className="text-[10px] font-black uppercase text-yellow-600 bg-yellow-50 p-2 border-2 border-yellow-500 animate-pulse">
            ✨ Los registros con código de afiliado reciben verificación automática y corona de owner.
          </p>
        )}
        
        <form onSubmit={onRegister} className="flex flex-col space-y-4">
          <input 
            type="text" 
            placeholder="USUARIO" 
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
          <input 
            type="email" 
            placeholder="EMAIL (OPCIONAL)" 
            className="chrome-input"
            value={authData.email}
            onChange={e => setAuthData({...authData, email: e.target.value})}
          />
          <input 
            type="tel" 
            placeholder="TELÉFONO (OPCIONAL)" 
            className="chrome-input"
            value={authData.phone}
            onChange={e => setAuthData({...authData, phone: e.target.value})}
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
            {loading ? 'REGISTRANDO...' : 'REGISTRARSE'}
          </button>
        </form>
        
        <div className="flex flex-col space-y-2 text-center">
          <button onClick={() => setView('login')} className="font-bold uppercase hover:underline">Ya tengo cuenta</button>
          <button 
            onClick={() => setIsAffiliateMode(!isAffiliateMode)} 
            className="text-xs font-black uppercase opacity-70 hover:opacity-100 transition-opacity"
          >
            {isAffiliateMode ? 'Volver al registro normal' : 'Codigo de afiliados:'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegisterView;
