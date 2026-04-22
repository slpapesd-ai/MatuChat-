import React, { useState, useEffect, useRef } from 'react';
import { Camera, RotateCcw, Check, Plus, AlertTriangle, Video } from 'lucide-react';

interface PhotoCaptureProps {
  onComplete: (blob: string, type: 'image') => void;
  onCancel: () => void;
}

const PhotoCapture = ({ onComplete, onCancel }: PhotoCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const startCamera = async () => {
    try {
      setError(null);
      console.log("Starting camera...");
      const constraints = { 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: false 
      };
      
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (s) {
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.error("Error playing video:", e));
          };
        }
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError("Permiso denegado. Por favor, permite el acceso a la cámara en tu navegador.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError("No se encontró ninguna cámara conectada.");
      } else {
        setError("Error al acceder a la cámara: " + err.message);
      }
    }
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn("Video dimensions not ready yet");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setPreviewUrl(dataUrl);
    }
  };

  const handleConfirm = () => {
    if (previewUrl) {
      onComplete(previewUrl, 'image');
    }
  };

  const handleReset = () => {
    setPreviewUrl(null);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center">
      {error ? (
        <div className="flex flex-col items-center space-y-4 p-6 text-center">
          <AlertTriangle size={64} className="text-yellow-500" />
          <p className="text-white font-black uppercase">{error}</p>
          <button onClick={onCancel} className="chrome-button bg-white text-black border-white">VOLVER</button>
        </div>
      ) : !previewUrl ? (
        <>
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          
          <div className="absolute bottom-10 left-0 right-0 flex justify-around items-center px-10">
            <button onClick={onCancel} className="p-4 bg-white/10 rounded-full text-white"><Plus className="rotate-45" size={32} /></button>
            
            <div className="flex flex-col items-center space-y-4">
              <button 
                onClick={takePhoto}
                className="w-20 h-20 rounded-full border-4 border-white bg-white/20 transition-all flex items-center justify-center"
              >
                <div className="w-16 h-16 rounded-full bg-white" />
              </button>
              <p className="text-white text-[10px] font-black uppercase tracking-widest opacity-50">
                Toca para foto
              </p>
            </div>

            <div className="w-16" /> {/* Spacer */}
          </div>
        </>
      ) : (
        <>
          <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute bottom-10 left-0 right-0 flex justify-around items-center px-10">
            <button onClick={handleReset} className="flex flex-col items-center text-white space-y-2">
              <div className="p-4 bg-white/20 rounded-full"><RotateCcw size={32} /></div>
              <span className="text-xs font-black uppercase">Repetir</span>
            </button>
            <button onClick={handleConfirm} className="flex flex-col items-center text-white space-y-2">
              <div className="p-4 bg-emerald-600 rounded-full"><Check size={32} /></div>
              <span className="text-xs font-black uppercase">Confirmar</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default PhotoCapture;
