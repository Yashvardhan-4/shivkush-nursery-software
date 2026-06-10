'use client';

import { useEffect, useState, createContext, useContext } from 'react';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { usePathname } from 'next/navigation';

export const SyncContext = createContext({
  isSyncing: false,
  forceSync: async () => {}
});

export function useSync() {
  return useContext(SyncContext);
}

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Make sure we only run on client side
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      processSyncQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) {
      processSyncQueue();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const pullSync = async () => {
    if (typeof window !== 'undefined' && !localStorage.getItem('snms_user')) {
      return;
    }
    try {
      const res = await fetch('/api/sync/pull');
      if (res.status === 401) {
        localStorage.removeItem('snms_user');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) return;
      const { success, data } = await res.json();
      if (success && data) {
        // Bulk put all data into IndexedDB
        await db.transaction('rw', [db.plants, db.lots, db.bookings, db.allotments, db.direct_sales, db.attendance, db.audit_logs, db.customers, db.users], async () => {
          if (data.plants?.length) await db.plants.bulkPut(data.plants);
          if (data.lots?.length) await db.lots.bulkPut(data.lots);
          if (data.bookings?.length) await db.bookings.bulkPut(data.bookings);
          if (data.allotments?.length) await db.allotments.bulkPut(data.allotments);
          if (data.direct_sales?.length) await db.direct_sales.bulkPut(data.direct_sales);
          if (data.attendance?.length) await db.attendance.bulkPut(data.attendance);
          if (data.audit_logs?.length) await db.audit_logs.bulkPut(data.audit_logs);
          if (data.customers?.length) await db.customers.bulkPut(data.customers);
          if (data.users?.length) await db.users.bulkPut(data.users);
        });
        console.log('Successfully pulled and updated local offline database from Supabase.');
      }
    } catch (err) {
      console.error('Failed to pull sync data:', err);
    }
  };

  const processSyncQueue = async () => {
    if (typeof window !== 'undefined' && !localStorage.getItem('snms_user')) {
      return;
    }
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      const queue = await db.sync_queue.orderBy('created_at').toArray();
      if (queue.length === 0) {
        setIsSyncing(false);
        await pullSync();
        return;
      }

      console.log(`Pushing ${queue.length} items to API...`);

      const processedQueue = queue.map(item => {
        const payload = { ...item.payload };
        delete payload.sync_status;
        if (item.table === 'bookings' && payload.status === 'Confirmed') {
           payload.status = 'Allocated';
        }
        return { ...item, payload };
      });

      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue: processedQueue })
      });

      if (res.status === 401) {
        localStorage.removeItem('snms_user');
        window.location.href = '/login';
        return;
      }

      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          const ids = queue.map(q => q.id!);
          await db.sync_queue.bulkDelete(ids);
          
          for (const item of queue) {
             if (item.action !== 'DELETE') {
               const localTable = (db as any)[item.table];
               if (localTable && localTable.update) {
                  await localTable.update(item.payload.id, { sync_status: 'synced' }).catch(() => {});
               }
             }
          }
          console.log('Successfully pushed local changes to server via ACID transaction.');
        } else {
          console.error('Push sync API returned error:', result.error);
        }
      } else {
        console.error('Push sync request failed:', res.status);
      }
      
      await pullSync();
    } catch (err) {
      console.error('Fatal error during queue sync:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Initial sync on mount/route change
    const hasUser = !!localStorage.getItem('snms_user');
    if (pathname !== '/login' && hasUser && isOnline) {
      processSyncQueue();
    }

    // Polling interval every 10 seconds for real-time feel
    const interval = setInterval(() => {
      const currentUser = !!localStorage.getItem('snms_user');
      if (pathname !== '/login' && currentUser && isOnline) {
        processSyncQueue();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [pathname, isOnline]);

  return (
    <SyncContext.Provider value={{ isSyncing, forceSync: processSyncQueue }}>
      {!isOnline && (
        <div className="bg-yellow-500 text-white text-center p-1.5 text-sm font-semibold sticky top-0 z-50 w-full shadow-md">
          Offline Mode - Data saved safely on device.
        </div>
      )}
      {children}
    </SyncContext.Provider>
  );
}
