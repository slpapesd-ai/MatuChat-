import React, { useState, useEffect, useRef } from 'react';
import { Plus, Upload, ArrowLeft, ShoppingBag, ChevronLeft, ChevronRight, Trash2, Share2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserData, View } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, getDocs, where, deleteDoc, doc } from 'firebase/firestore';

interface ShopViewProps {
  user: UserData;
  setView: (view: View) => void;
  setViewingUserId: (id: string | null) => void;
  setSelectedChat: (chat: any) => void;
  setContacts: (c: any[]) => void;
  setSharingProduct: (product: any | null) => void;
}

const compressImage = (base64Str: string, maxWidth = 1000, maxHeight = 1000, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
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
  });
};

const ShopView = ({ user, setView, setViewingUserId, setSelectedChat, setContacts, setSharingProduct }: ShopViewProps) => {
  if (!user) return null;
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [newProduct, setNewProduct] = useState({ title: '', description: '', price: '', image_url: '', category: 'General', media_type: 'image' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const productsRef = collection(db, 'products');
    const q = query(productsRef, orderBy('created_at', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(productsData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'products'));

    return () => unsubscribe();
  }, []);

  const handleCreate = async () => {
    if (!newProduct.title || !newProduct.price) return;
    try {
      await addDoc(collection(db, 'products'), {
        ...newProduct,
        user_id: user.id,
        username: user.username,
        profilePic: user.profilePic || null,
        userID: user.userID,
        is_verified: user.is_verified || false,
        is_food_local: user.is_food_local || false,
        is_matustar: user.is_matustar || false,
        price: parseFloat(newProduct.price),
        created_at: new Date().toISOString()
      });
      setIsCreating(false);
      setNewProduct({ title: '', description: '', price: '', image_url: '', category: 'General', media_type: 'image' });
    } catch (err) {
      console.error("Create product failed", err);
      handleFirestoreError(err, OperationType.CREATE, 'products');
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isVideo = file.type.startsWith('video/');
      const reader = new FileReader();
      reader.onloadend = async () => {
        let result = reader.result as string;
        if (!isVideo && file.type.startsWith('image/') && result.length > 200000) {
          result = await compressImage(result);
        }
        setNewProduct({ 
          ...newProduct, 
          image_url: result,
          media_type: isVideo ? 'video' : 'image'
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAsk = async (product: any) => {
    const initialMessage = `Hola @${product.username}, estoy interesado en tu producto: "${product.title}" ($${product.price})`;
    
    try {
      // Send message to initialize chat
      await addDoc(collection(db, 'messages'), {
        sender_id: user.id,
        receiver_id: product.user_id,
        content: initialMessage,
        is_group: false,
        is_read: false,
        created_at: new Date().toISOString()
      });
      
      setSelectedChat({
        id: product.user_id,
        username: product.username,
        profilePic: product.profilePic,
        userID: product.userID,
        is_verified: product.is_verified,
        is_food_local: product.is_food_local,
        is_matustar: product.is_matustar
      });
      setView('chat');
      
      // Refresh contacts (this will be handled by real-time listener in ChatView, 
      // but we can manually trigger if needed or just rely on the listener)
      const messagesRef = collection(db, 'messages');
      const q = query(messagesRef, where('receiver_id', '==', user.id));
      const q2 = query(messagesRef, where('sender_id', '==', user.id));
      
      const [snap1, snap2] = await Promise.all([getDocs(q), getDocs(q2)]);
      const contactIds = new Set<string>();
      snap1.docs.forEach(d => contactIds.add(d.data().sender_id));
      snap2.docs.forEach(d => contactIds.add(d.data().receiver_id));
      
      const contactsData = [];
      for (const id of contactIds) {
        if (id === user.id) continue;
        const uDoc = await getDocs(query(collection(db, 'users'), where('id', '==', id)));
        if (!uDoc.empty) {
          contactsData.push({ id: uDoc.docs[0].id, ...uDoc.docs[0].data() });
        }
      }
      setContacts(contactsData);
    } catch (err) {
      console.error("Ask failed", err);
      handleFirestoreError(err, OperationType.CREATE, 'messages');
    }
  };

  const handleDelete = async (productId: string) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este producto?')) return;
    try {
      await deleteDoc(doc(db, 'products', productId));
      if (selectedProduct?.id === productId) setSelectedProduct(null);
    } catch (err) {
      console.error("Delete product failed", err);
      handleFirestoreError(err, OperationType.DELETE, `products/${productId}`);
    }
  };

  const handleShare = (product: any) => {
    setSharingProduct(product);
  };

  const filteredProducts = products.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-6 sm:p-8 space-y-8 pb-32">
      <div className="flex justify-between items-center">
        <h1 className="matu-title text-3xl sm:text-4xl italic">MatuShop</h1>
        <div className="flex space-x-2">
          <button onClick={() => setIsCreating(true)} className="chrome-button p-3"><Plus size={28} /></button>
        </div>
      </div>

      <div className="relative">
        <input 
          className="chrome-input w-full pl-12" 
          placeholder="BUSCAR PRODUCTOS..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30" size={20} />
      </div>

      <AnimatePresence>
        {isCreating && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[100] bg-chrome-900/90 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <div className="chrome-card p-6 w-full max-w-md space-y-4 bg-white">
              <h2 className="text-2xl font-black italic uppercase">Vender Artículo</h2>
              <input className="chrome-input w-full" placeholder="TÍTULO DEL ARTÍCULO" value={newProduct.title} onChange={e => setNewProduct({...newProduct, title: e.target.value})} />
              <input className="chrome-input w-full" placeholder="PRECIO ($)" type="number" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} />
              <textarea className="chrome-input w-full h-24" placeholder="DESCRIPCIÓN" value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} />
              
              <div 
                className="aspect-square bg-chrome-100 border-2 border-dashed border-chrome-900 flex flex-col items-center justify-center cursor-pointer overflow-hidden"
                onClick={() => fileInputRef.current?.click()}
              >
                {newProduct.image_url ? (
                  newProduct.media_type === 'video' || newProduct.image_url.startsWith('data:video') || newProduct.image_url.includes('video') || newProduct.image_url.includes('.mp4') ? (
                    <video src={newProduct.image_url} className="w-full h-full object-cover" />
                  ) : (
                    <img src={newProduct.image_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  )
                ) : (
                  <>
                    <Upload size={32} className="opacity-50" />
                    <span className="text-[10px] font-black uppercase opacity-50">Subir Imagen</span>
                  </>
                )}
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFile} />

              <div className="flex space-x-2">
                <button onClick={handleCreate} className="chrome-button flex-1">PUBLICAR</button>
                <button onClick={() => setIsCreating(false)} className="chrome-button flex-1 bg-red-100 border-red-900 text-red-900">CANCELAR</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedProduct && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-white flex flex-col"
          >
            <div className="p-4 flex items-center justify-between border-b-4 border-chrome-900">
              <div className="flex items-center space-x-4">
                <button onClick={() => setSelectedProduct(null)} className="p-2 bg-chrome-100 rounded-full border-2 border-chrome-900"><ArrowLeft size={28} /></button>
                <h2 className="text-xl sm:text-2xl font-black uppercase italic truncate max-w-[150px] sm:max-w-xs">{selectedProduct.title}</h2>
              </div>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => handleShare(selectedProduct)}
                  className="p-3 bg-chrome-100 rounded-xl border-2 border-chrome-900 hover:bg-chrome-200"
                >
                  <Share2 size={20} />
                </button>
                {(selectedProduct.user_id === user.id || user.is_owner || user.is_affiliate_owner) && (
                  <button 
                    onClick={() => handleDelete(selectedProduct.id)}
                    className="p-3 bg-red-100 text-red-600 rounded-xl border-2 border-red-900 hover:bg-red-200"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8">
              <div className="aspect-square bg-chrome-100 border-4 border-chrome-900 rounded-2xl overflow-hidden">
                {selectedProduct.image_url ? (
                  selectedProduct.media_type === 'video' || selectedProduct.image_url.startsWith('data:video') || selectedProduct.image_url.includes('video') || selectedProduct.image_url.includes('.mp4') ? (
                    <video 
                      src={selectedProduct.image_url} 
                      className="w-full h-full object-cover" 
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
                    <img src={selectedProduct.image_url} alt="Product" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-20"><ShoppingBag size={128} /></div>
                )}
              </div>
              <div className="space-y-3">
                <p className="text-4xl font-black text-chrome-900">${selectedProduct.price}</p>
                <p className="font-bold text-chrome-600 uppercase italic text-sm">{selectedProduct.category}</p>
                <p className="text-base font-medium leading-relaxed">{selectedProduct.description}</p>
              </div>
              <div className="p-5 bg-chrome-100 border-2 border-chrome-900 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-full border-2 border-chrome-900 overflow-hidden">
                    <img src={selectedProduct.profilePic || `https://picsum.photos/seed/${selectedProduct.user_id}/100/100`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <p className="font-black uppercase text-base">@{selectedProduct.username}</p>
                    <p className="text-xs font-bold opacity-50">Vendedor</p>
                  </div>
                </div>
                <button onClick={() => handleAsk(selectedProduct)} className="chrome-button bg-emerald-600 text-white border-emerald-900 px-6 py-3 text-sm">PREGUNTAR</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="grid grid-cols-2 gap-4">
        {filteredProducts.map(product => (
          <div key={product.id} className="chrome-card overflow-hidden flex flex-col cursor-pointer group relative" onClick={() => setSelectedProduct(product)}>
            {(product.user_id === user.id || user.is_owner || user.is_affiliate_owner) && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }}
                className="absolute top-2 right-2 z-10 p-2 bg-red-600 text-white rounded-full border-2 border-red-900 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); handleShare(product); }}
              className="absolute top-2 left-2 z-10 p-2 bg-white text-black rounded-full border-2 border-chrome-900 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Share2 size={14} />
            </button>
            <div className="aspect-square bg-chrome-200 border-b-2 border-chrome-900 overflow-hidden">
              {product.image_url ? (
                product.media_type === 'video' || product.image_url.startsWith('data:video') || product.image_url.includes('video') || product.image_url.includes('.mp4') ? (
                  <video src={product.image_url} className="w-full h-full object-cover" />
                ) : (
                  <img src={product.image_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center opacity-20"><ShoppingBag size={48} /></div>
              )}
            </div>
            <div className="p-4 space-y-2 flex-1 flex flex-col">
              <p className="font-black uppercase text-sm truncate">{product.title}</p>
              <p className="text-chrome-900 font-black text-xl">${product.price}</p>
              <div className="flex items-center space-x-2 mt-auto pt-3">
                <div className="w-6 h-6 rounded-full bg-chrome-400 border border-chrome-900 overflow-hidden">
                  {product.profilePic ? <img src={product.profilePic} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center text-[8px] font-black">{product.username[0]}</div>}
                </div>
                <p className="text-[10px] font-bold uppercase opacity-50 truncate">{product.username}</p>
              </div>
            </div>
          </div>
        ))}
        {products.length === 0 && (
          <div className="col-span-2 py-20 text-center space-y-4">
            <ShoppingBag size={64} className="mx-auto opacity-20" />
            <p className="font-black uppercase opacity-50">No hay artículos en venta</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShopView;
