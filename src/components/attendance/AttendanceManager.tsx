'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Calendar } from 'lucide-react';


type AttendanceStatus = 'Present' | 'Absent' | 'Half Day';

interface AttendanceManagerProps {
  ownerId: string;
  ownerName: string;
}

export default function AttendanceManager({ ownerId, ownerName }: AttendanceManagerProps) {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState(true);

  const workers = useLiveQuery(() => db.users.where('role').equals('worker').toArray());

  const attendanceRecords = useLiveQuery(() =>
    db.attendance.orderBy('date').reverse().toArray()
  );

  const today = new Date().toISOString().split('T')[0];

  // Map of workerId -> today's status
  const todayMap = attendanceRecords?.reduce((acc, r) => {
    if (r.date === today) acc[r.worker_id] = r.status;
    return acc;
  }, {} as Record<string, AttendanceStatus>) ?? {};

  async function markAttendance(worker_id: string, worker_name: string, status: AttendanceStatus) {
    const key = `${worker_id}_${status}`;
    setLoading(prev => ({ ...prev, [key]: true }));

    try {
      // Remove any existing record for this worker today
      const existing = await db.attendance
        .where('worker_id').equals(worker_id)
        .and(r => r.date === today)
        .toArray();
      if (existing.length > 0) {
        await db.attendance.bulkDelete(existing.map(r => r.id));
      }

      const id = crypto.randomUUID();
      const record = {
        id,
        worker_id,
        worker_name,
        date: today,
        status,
        marked_by: ownerId,
        sync_status: 'pending' as const,
      };

      await db.attendance.add(record);
      await db.sync_queue.add({
        table: 'attendance',
        action: 'INSERT',
        payload: record,
        created_at: Date.now(),
      });
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }

  // Group history by date
  const groupedHistory = attendanceRecords?.reduce((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {} as Record<string, typeof attendanceRecords>) ?? {};

  const sortedDates = Object.keys(groupedHistory).sort((a, b) => b.localeCompare(a));

  const statusConfig: Record<AttendanceStatus, { label: string; activeBg: string; activeText: string; dot: string; badgeBg: string; badgeText: string; icon: React.ReactNode }> = {
    Present: {
      label: 'Present',
      activeBg: 'bg-green-600',
      activeText: 'text-white',
      dot: 'bg-green-500',
      badgeBg: 'bg-green-100',
      badgeText: 'text-green-700',
      icon: <CheckCircle className="w-4 h-4" />,
    },
    Absent: {
      label: 'Absent',
      activeBg: 'bg-red-500',
      activeText: 'text-white',
      dot: 'bg-red-500',
      badgeBg: 'bg-red-100',
      badgeText: 'text-red-700',
      icon: <XCircle className="w-4 h-4" />,
    },
    'Half Day': {
      label: 'Half Day',
      activeBg: 'bg-orange-500',
      activeText: 'text-white',
      dot: 'bg-orange-400',
      badgeBg: 'bg-orange-100',
      badgeText: 'text-orange-700',
      icon: <Clock className="w-4 h-4" />,
    },
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Mark Today Section */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-emerald-500 p-5">
          <div className="flex items-center space-x-2 text-white">
            <Calendar className="w-5 h-5" />
            <div>
              <h2 className="font-black text-lg leading-tight">Mark Today's Attendance</h2>
              <p className="text-green-100 text-xs font-semibold mt-0.5">{formatDate(today)}</p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {(workers || []).map(worker => {
            const currentStatus = todayMap[worker.id];
            return (
              <div key={worker.id} className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center font-black text-gray-600 text-sm">
                      {worker.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-gray-900">{worker.name}</p>
                      {currentStatus && (
                        <div className={`flex items-center space-x-1 text-xs font-bold mt-0.5 ${statusConfig[currentStatus].badgeText}`}>
                          <span className={`w-2 h-2 rounded-full ${statusConfig[currentStatus].dot}`} />
                          <span>{currentStatus}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {(['Present', 'Absent', 'Half Day'] as AttendanceStatus[]).map(status => {
                    const cfg = statusConfig[status];
                    const isActive = currentStatus === status;
                    const isLoading = loading[`${worker.id}_${status}`];
                    return (
                      <button
                        key={status}
                        onClick={() => markAttendance(worker.id, worker.name, status)}
                        disabled={isLoading}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 border
                          ${isActive
                            ? `${cfg.activeBg} ${cfg.activeText} border-transparent shadow-md`
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                          }
                          ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}
                        `}
                      >
                        {cfg.icon}
                        <span className="hidden sm:inline">{status}</span>
                        <span className="sm:hidden">{status === 'Half Day' ? 'Half' : status}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* History Section */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <div>
            <h2 className="font-black text-gray-900 text-lg">Attendance History</h2>
            <p className="text-xs font-semibold text-gray-400 mt-0.5">{sortedDates.length} day(s) recorded</p>
          </div>
          {historyOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {historyOpen && (
          <div className="border-t border-gray-50">
            {sortedDates.length === 0 && (
              <div className="text-center py-10 text-gray-400 font-semibold">
                No attendance records yet.
              </div>
            )}
            {sortedDates.map(date => (
              <div key={date} className="border-b border-gray-50 last:border-0">
                <div className="px-5 py-3 bg-gray-50">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">
                    {date === today ? '📅 Today — ' : ''}{formatDate(date)}
                  </p>
                </div>
                <div className="divide-y divide-gray-50">
                  {(groupedHistory[date] ?? []).map(record => {
                    const cfg = statusConfig[record.status];
                    return (
                      <div key={record.id} className="flex items-center justify-between px-5 py-3.5">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-black text-gray-500 text-xs">
                            {record.worker_name.charAt(0)}
                          </div>
                          <span className="font-bold text-gray-800">{record.worker_name}</span>
                        </div>
                        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black ${cfg.badgeBg} ${cfg.badgeText}`}>
                          {cfg.icon}
                          {record.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
