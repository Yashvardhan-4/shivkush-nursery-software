'use client';
import { useEffect, useState } from 'react';
import NotebookLedger from '@/components/notebook/NotebookLedger';

export default function NotebookPage() {
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
    setRole(user.role || '');
    setUserId(user.id || '');
  }, []);

  // Wait for role to be determined
  if (!role) {
    return <div className="p-10 text-center text-gray-500 font-bold">Loading ledger...</div>;
  }

  return (
    <div className="p-6 mb-24">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900">Digital Ledger</h1>
        <p className="text-sm font-medium text-gray-500 mt-1">
          All bookings and sales history
        </p>
      </header>
      <NotebookLedger role={role} userId={userId} />
    </div>
  );
}
