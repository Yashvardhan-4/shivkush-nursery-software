'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { serverAddExpense } from '@/lib/actions/finance';
import { Receipt, Plus, Calendar, DollarSign, FileText, Tag } from 'lucide-react';

const EXPENSE_CATEGORIES = [
  'Raw Materials',
  'Labor',
  'Logistics',
  'Operations',
  'Misc',
];

const PAYMENT_MODES = ['Cash', 'UPI'];

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const { data: expenses, isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });
      return data || [];
    },
  });

  const resetForm = () => {
    setCategory(EXPENSE_CATEGORIES[0]);
    setAmount('');
    setPaymentMode('Cash');
    setDescription('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
  };

  const handleSubmit = async () => {
    if (!navigator.onLine) {
      alert('You must be online to save.');
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    setLoading(true);
    try {
      const result = await serverAddExpense({
        p_category: category,
        p_amount: amt,
        p_payment_mode: paymentMode,
        p_description: description || null,
      });

      if (!result?.success) {
        alert(result?.error || 'Failed to add expense');
        return;
      }

      resetForm();
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['vw_daily_cashbook'] });
      queryClient.invalidateQueries({ queryKey: ['vw_profit_summary'] });
    } catch (e: any) {
      console.error(e);
      alert('Failed to add expense: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const todayExpenses =
    expenses?.filter(
      (e: any) =>
        new Date(e.expense_date).toDateString() === new Date().toDateString()
    ) || [];
  const todayTotal = todayExpenses.reduce(
    (sum: number, e: any) => sum + Number(e.amount),
    0
  );

  return (
    <div className="p-6 mb-24 space-y-6 max-w-2xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-8 h-8 text-orange-600" /> Expenses
          </h1>
          <p className="text-gray-500 font-medium text-sm mt-1">
            Track nursery expenses
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-5 rounded-2xl shadow-md active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" />
          Add
        </button>
      </header>

      {/* Today's Summary */}
      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
        <p className="text-xs font-bold text-orange-400 uppercase tracking-wider">
          Today&apos;s Total Expenses
        </p>
        <p className="text-2xl font-black text-orange-900 mt-1">
          ₹{todayTotal.toLocaleString('en-IN')}
        </p>
      </div>

      {/* Add Expense Form */}
      {showForm && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-black text-lg text-gray-900">New Expense</h2>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Tag className="w-3 h-3" /> Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold text-gray-800"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Amount (₹)
            </label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold text-gray-800"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Payment Mode
            </label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              {PAYMENT_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`py-3 rounded-xl font-bold border-2 transition-all ${
                    paymentMode === mode
                      ? mode === 'Cash'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3 h-3" /> Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Bought fertilizer"
              className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold text-gray-800"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Date
            </label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-bold text-gray-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !amount}
              className="py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl active:scale-95 transition-all shadow-md disabled:opacity-60"
            >
              {loading ? 'Saving...' : 'Save Expense'}
            </button>
          </div>
        </div>
      )}

      {/* Expense List */}
      <div className="space-y-3">
        <h2 className="font-black text-lg text-gray-900">Recent Expenses</h2>
        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && (!expenses || expenses.length === 0) && (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
            <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">No expenses recorded yet</p>
          </div>
        )}
        {expenses?.map((exp: any) => (
          <div
            key={exp.id}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
                  {exp.category}
                </span>
                <span className="text-xs font-bold text-gray-400">
                  {new Date(exp.expense_date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    exp.payment_mode === 'Cash'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-purple-50 text-purple-700'
                  }`}
                >
                  {exp.payment_mode}
                </span>
              </div>
              {exp.description && (
                <p className="text-sm font-medium text-gray-600 mt-1 truncate">
                  {exp.description}
                </p>
              )}
            </div>
            <p className="font-black text-lg text-red-600 ml-4 whitespace-nowrap">
              -₹{Number(exp.amount).toLocaleString('en-IN')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
