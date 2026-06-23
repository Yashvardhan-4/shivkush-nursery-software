'use client';

import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, generateId } from '@/lib/db';
import { QrCode, Upload, Trash2, Plus, ChevronLeft, Check } from 'lucide-react';
import Link from 'next/link';

export default function QRManagementPage() {
  const qrs = useLiveQuery(() => db.payment_qrs.toArray());
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageData(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !upiId || !imageData) return alert("Please fill all details and upload an image.");
    
    setLoading(true);
    try {
      const qrId = generateId();
      const qrData = {
        id: qrId,
        name,
        upi_id: upiId,
        image_data: imageData,
        active: true,
        sync_status: 'pending' as const,
        created_at: new Date().toISOString()
      };
      
      await db.payment_qrs.add(qrData);
      await db.sync_queue.add({
        table: 'payment_qrs',
        action: 'INSERT',
        payload: qrData,
        created_at: Date.now()
      });
      
      window.dispatchEvent(new Event('online'));
      
      setName('');
      setUpiId('');
      setImageData(null);
      setShowAdd(false);
    } catch (err) {
      console.error(err);
      alert('Failed to save QR code.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this QR code?')) return;
    try {
      const deletedAt = new Date().toISOString();
      const oldQr = await db.payment_qrs.get(id);
      if (oldQr) {
        await db.payment_qrs.update(id, { deleted_at: deletedAt, sync_status: 'pending' });
        await db.sync_queue.add({
          table: 'payment_qrs',
          action: 'UPDATE',
          payload: { ...oldQr, deleted_at: deletedAt },
          created_at: Date.now()
        });
      }
      window.dispatchEvent(new Event('online'));
    } catch (err) {
      console.error(err);
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const updates = { active: !currentStatus };
      await db.payment_qrs.update(id, updates);
      
      const qr = await db.payment_qrs.get(id);
      if (qr) {
        await db.sync_queue.add({
          table: 'payment_qrs',
          action: 'UPDATE',
          payload: { ...qr, sync_status: undefined },
          created_at: Date.now()
        });
        window.dispatchEvent(new Event('online'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-2 -ml-2 rounded-xl text-gray-500 bg-gray-100 active:scale-95 transition-transform">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-black tracking-tight text-gray-900">Manage QR Codes</h1>
        </div>
        {!showAdd && (
          <button 
            onClick={() => setShowAdd(true)}
            className="p-2 rounded-xl bg-purple-100 text-purple-700 active:scale-95 transition-transform"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6 mt-4">
        {showAdd && (
          <form onSubmit={handleSave} className="bg-white p-5 rounded-3xl border border-purple-200 shadow-md space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Display Name</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Nursery PhonePe" 
                className="w-full border border-gray-200 rounded-xl px-4 py-3 font-medium bg-gray-50 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">UPI ID</label>
              <input 
                type="text" 
                value={upiId}
                onChange={e => setUpiId(e.target.value)}
                placeholder="e.g. shop@ybl" 
                className="w-full border border-gray-200 rounded-xl px-4 py-3 font-medium bg-gray-50 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Upload QR Image</label>
              <label className="border-2 border-dashed border-purple-300 bg-purple-50 rounded-2xl h-32 flex flex-col items-center justify-center cursor-pointer active:scale-[0.98] transition-transform overflow-hidden relative block">
                {imageData ? (
                  <img src={imageData} alt="QR Preview" className="h-full object-contain" />
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-purple-400 mb-2" />
                    <span className="text-sm font-bold text-purple-600">Tap to upload QR</span>
                  </>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setShowAdd(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl active:scale-95 transition-transform"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={loading}
                className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl active:scale-95 transition-transform shadow-md disabled:opacity-50"
              >
                Save QR
              </button>
            </div>
          </form>
        )}

        <div className="space-y-4">
          <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-gray-400" />
            Active QR Codes
          </h2>
          
          {qrs === undefined ? (
             <div className="text-center py-10 text-gray-400"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div></div>
          ) : qrs.length === 0 ? (
             <div className="bg-white border border-gray-100 border-dashed rounded-3xl p-8 text-center">
               <QrCode className="w-10 h-10 text-gray-300 mx-auto mb-3" />
               <p className="text-gray-500 font-medium">No QR codes added yet.</p>
             </div>
          ) : (
            <div className="grid gap-4">
              {qrs.map(qr => (
                <div key={qr.id} className={`bg-white rounded-3xl border shadow-sm overflow-hidden transition-colors ${qr.active ? 'border-purple-200' : 'border-gray-200 opacity-70'}`}>
                  <div className="flex items-start gap-4 p-4">
                    <div className="w-20 h-20 bg-gray-50 rounded-2xl flex-shrink-0 border border-gray-100 overflow-hidden p-1 flex items-center justify-center">
                      {qr.image_data ? (
                        <img src={qr.image_data} alt={qr.name} className="max-w-full max-h-full object-contain" />
                      ) : <QrCode className="w-8 h-8 text-gray-300" />}
                    </div>
                    <div className="flex-1 pt-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-black text-gray-900">{qr.name}</h3>
                          <p className="text-xs font-semibold text-gray-500">{qr.upi_id}</p>
                        </div>
                        <button 
                          onClick={() => handleDelete(qr.id)}
                          className="p-2 bg-red-50 text-red-600 rounded-xl active:scale-95 transition-transform"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="mt-3">
                        <button 
                          onClick={() => toggleActive(qr.id, qr.active)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${qr.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                        >
                          {qr.active ? <><Check className="w-3.5 h-3.5" /> Active in Checkout</> : 'Disabled'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
