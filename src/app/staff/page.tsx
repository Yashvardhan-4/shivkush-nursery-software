'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus, Trash2, ShieldCheck, User } from 'lucide-react';
import Link from 'next/link';

type Staff = {
  id: string;
  name: string;
  mobile: string;
  role: 'owner' | 'worker';
  created_at: string;
};

export default function StaffManagementPage() {
  const router = useRouter();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  // New Staff form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState<'worker' | 'owner'>('worker');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Basic owner check
    const userStr = localStorage.getItem('snms_user');
    const user = userStr ? JSON.parse(userStr) : null;
    if (user?.role !== 'owner') {
      router.push('/dashboard');
      return;
    }
    fetchStaff();
  }, [router]);

  async function fetchStaff() {
    try {
      const res = await fetch('/api/staff');
      const data = await res.json();
      if (Array.isArray(data)) {
        setStaffList(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mobile, role, password })
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setStaffList([...staffList, data]);
        setShowForm(false);
        setName('');
        setMobile('');
        setPassword('');
        setRole('worker');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to add staff');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to remove this worker account?')) return;
    try {
      const res = await fetch(`/api/staff?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setStaffList(staffList.filter(s => s.id !== id));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete staff');
    }
  }

  return (
    <div className="p-6 mb-24 space-y-6">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            Manage Staff
          </h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Create and manage your nursery's login credentials</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-gray-900 text-white p-3 rounded-full shadow-lg active:scale-95 transition-transform"
        >
          <UserPlus className="w-6 h-6" />
        </button>
      </header>

      {showForm && (
        <form onSubmit={handleAddStaff} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-black text-gray-800 border-b border-gray-50 pb-2">Add New Account</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Full Name</label>
              <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="e.g. Rahul" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mobile / Login ID</label>
              <input required type="tel" value={mobile} onChange={e => setMobile(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="10 digit mobile" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Role</label>
              <select value={role} onChange={e => setRole(e.target.value as 'worker' | 'owner')} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold">
                <option value="worker">Worker</option>
                <option value="owner">Owner (Admin)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Password PIN</label>
              <input required type="text" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold tracking-widest" placeholder="****" />
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-blue-600 text-white font-black py-4 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
            {isSubmitting ? 'Creating...' : 'Create Account'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-center py-10 font-bold text-gray-400">Loading staff accounts...</p>
      ) : (
        <div className="space-y-3">
          {staffList.map(staff => (
            <div key={staff.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${staff.role === 'owner' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                  {staff.role === 'owner' ? <ShieldCheck className="w-6 h-6" /> : <User className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                    {staff.name}
                    {staff.role === 'owner' && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Owner</span>}
                  </h3>
                  <p className="text-sm font-bold text-gray-500 mt-0.5 tracking-wider">{staff.mobile}</p>
                </div>
              </div>

              {staff.role !== 'owner' && (
                <button onClick={() => handleDelete(staff.id)} className="p-3 text-red-500 bg-red-50 rounded-xl active:scale-95 transition-transform hover:bg-red-100">
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
