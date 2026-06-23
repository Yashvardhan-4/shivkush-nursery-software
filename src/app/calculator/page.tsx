'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { generateId, resolvePlantPrice } from '@/lib/utils';
import { Leaf, Info, Trash2, Plus, Share2, Printer, X, FileText } from 'lucide-react';

interface TempItem {
  id: string;
  plantName: string;
  variety: string;
  hectares: number;
  acres: number;
  gunthas: number;
  rowSpacing: number;
  plantSpacing: number;
  unit: 'feet' | 'meters';
  quantity: number;
  price: number;
  amount: number;
}

export default function CalculatorPage() {
  // Navigation & Mode
  const [isPrintMode, setIsPrintMode] = useState(false);

  // Customer Details (Optional, for printing/sharing)
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [city, setCity] = useState('');

  // Quotation Cart (In-Memory)
  const [cart, setCart] = useState<TempItem[]>([]);

  // Current Input Form
  const [plantId, setPlantId] = useState('');
  const [customPlantName, setCustomPlantName] = useState('');
  const [customVariety, setCustomVariety] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  
  // Land Area Inputs
  const [hectares, setHectares] = useState('');
  const [acres, setAcres] = useState('');
  const [gunthas, setGunthas] = useState('');
  
  // Spacing Inputs
  const [rowSpacing, setRowSpacing] = useState('');
  const [plantSpacing, setPlantSpacing] = useState('');
  const [unit, setUnit] = useState<'feet' | 'meters'>('feet');

  // Overall Financials
  const [transportCharges, setTransportCharges] = useState('');
  const [discount, setDiscount] = useState('');

  // Database Query for Plants dropdown
  const { data: plants } = useQuery({
    queryKey: ['plants'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plants').select('*').eq('active', true);
      if (error) throw error;
      return data || [];
    }
  });
  const selectedPlant = plants?.find(p => p.id === plantId);

  // Constants for conversions
  const sqFtPerGuntha = 1089;
  const sqFtPerAcre = 43560;
  const sqFtPerHectare = 107639;
  const sqMPerGuntha = 101.171;
  const sqMPerAcre = 4046.86;
  const sqMPerHectare = 10000;

  // Real-time calculations for the current input row
  const h = parseFloat(hectares) || 0;
  const a = parseFloat(acres) || 0;
  const g = parseFloat(gunthas) || 0;

  let currentArea = 0;
  if (unit === 'feet') {
    currentArea = (h * sqFtPerHectare) + (a * sqFtPerAcre) + (g * sqFtPerGuntha);
  } else {
    currentArea = (h * sqMPerHectare) + (a * sqMPerAcre) + (g * sqMPerGuntha);
  }

  const rSp = parseFloat(rowSpacing) || 0;
  const pSp = parseFloat(plantSpacing) || rSp;
  const spacingArea = rSp * pSp;
  const currentQty = spacingArea > 0 ? Math.floor(currentArea / spacingArea) : 0;

  const currentPrice = selectedPlant ? resolvePlantPrice(selectedPlant, currentQty) : (parseFloat(customPrice) || 0);
  const currentAmount = currentQty * currentPrice;

  // Add Item to Quotation List
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    
    let itemName = '';
    let itemVariety = '';

    if (plantId) {
      if (selectedPlant) {
        itemName = selectedPlant.plant_name;
        itemVariety = selectedPlant.variety || 'Standard';
      }
    } else {
      itemName = customPlantName || 'Custom Plant';
      itemVariety = customVariety || 'Standard';
    }

    if (currentQty <= 0) {
      alert('Please enter land size and planting spacing to calculate required plants.');
      return;
    }

    const newItem: TempItem = {
      id: generateId(),
      plantName: itemName,
      variety: itemVariety,
      hectares: h,
      acres: a,
      gunthas: g,
      rowSpacing: rSp,
      plantSpacing: pSp,
      unit: unit,
      quantity: currentQty,
      price: currentPrice,
      amount: currentAmount
    };

    setCart([...cart, newItem]);

    // Reset current item inputs (except units/spacing if they want to repeat)
    setPlantId('');
    setCustomPlantName('');
    setCustomVariety('');
    setCustomPrice('');
    setHectares('');
    setAcres('');
    setGunthas('');
  };

  const handleRemoveItem = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  // Calculations for entire Quotation
  const subtotal = cart.reduce((sum, item) => sum + item.amount, 0);
  const transport = parseFloat(transportCharges) || 0;
  const disc = parseFloat(discount) || 0;
  const netTotal = subtotal + transport - disc;

  // WhatsApp Message Generator
  const handleShareWhatsApp = () => {
    if (cart.length === 0) return;

    let text = `🌿 *SHIVKUSH NURSERY QUOTATION* 🌿\n`;
    text += `------------------------------------------\n`;
    if (customerName) text += `*Customer:* ${customerName}\n`;
    if (customerPhone) text += `*Phone:* ${customerPhone}\n`;
    if (city) text += `*City:* ${city}\n`;
    text += `*Date:* ${new Date().toLocaleDateString('en-IN')}\n`;
    text += `------------------------------------------\n\n`;

    cart.forEach((item, index) => {
      text += `*${index + 1}. ${item.plantName} (${item.variety})*\n`;
      
      // Land size description
      const sizes: string[] = [];
      if (item.hectares > 0) sizes.push(`${item.hectares} हेक्टर`);
      if (item.acres > 0) sizes.push(`${item.acres} एकड़`);
      if (item.gunthas > 0) sizes.push(`${item.gunthas} गुंठा`);
      text += `   • Land Area: ${sizes.join(' + ') || 'Custom'}\n`;
      text += `   • Spacing: ${item.rowSpacing} × ${item.plantSpacing} ${item.unit}\n`;
      text += `   • Plants Required: *${item.quantity.toLocaleString()}*\n`;
      text += `   • Rate: ₹${item.price} per plant\n`;
      text += `   • Amount: *₹${item.amount.toLocaleString()}*\n\n`;
    });

    text += `------------------------------------------\n`;
    text += `*Subtotal:* ₹${subtotal.toLocaleString()}\n`;
    if (transport > 0) text += `*Transport Charges:* ₹${transport.toLocaleString()}\n`;
    if (disc > 0) text += `*Discount:* -₹${disc.toLocaleString()}\n`;
    text += `*Net Total Quotation:* *₹${netTotal.toLocaleString()}*\n`;
    text += `------------------------------------------\n`;
    text += `_Thank you for choosing Shivkush Nursery!_\n`;
    text += `For details, call 9999999999.`;

    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  // Trigger browser print
  const handlePrint = () => {
    setIsPrintMode(true);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  // If in print mode, render clean invoice layout
  if (isPrintMode) {
    return (
      <div className="bg-white min-h-screen p-8 text-black print:p-0 print:text-xs">
        {/* Print Controls (hidden on printing) */}
        <div className="flex justify-between items-center bg-gray-100 p-4 rounded-xl mb-8 border border-gray-200 print:hidden">
          <div className="flex items-center space-x-2 text-sm text-gray-700 font-bold">
            <Info className="w-5 h-5 text-green-600" />
            <span>Ready for printing. Use margins: None, and check Header/Footer options if needed.</span>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setIsPrintMode(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-bold active:scale-95 transition-all text-xs"
            >
              Go Back
            </button>
            <button
              onClick={() => window.print()}
              className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold active:scale-95 transition-all text-xs flex items-center gap-1.5 shadow-md"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>

        {/* Invoice Layout */}
        <div className="space-y-6 max-w-3xl mx-auto border border-gray-200 p-8 rounded-2xl bg-white print:border-0 print:p-0">
          <header className="flex justify-between items-start border-b-2 border-green-800 pb-4">
            <div>
              <h1 className="text-3xl font-black text-green-800 tracking-tight">SHIVKUSH NURSERY</h1>
              <p className="text-xs text-gray-500 font-semibold mt-1">High Quality Grafted Plants & Seedlings</p>
              <p className="text-[11px] text-gray-600 mt-2">
                At: Kadethan, Pune-Solapur Highway, Tal. Daund, Dist. Pune<br/>
                Contact: +91 9999999999 | Email: info@shivkushnursery.com
              </p>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-black text-gray-800">QUOTATION</h2>
              <p className="text-xs text-gray-500 font-semibold mt-1">Date: {new Date().toLocaleDateString('en-IN')}</p>
              <p className="text-xs text-gray-500 font-semibold">Ref No: SKN-QTN-{Math.floor(Date.now() / 100000)}</p>
            </div>
          </header>

          {/* Customer info */}
          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl text-xs border border-gray-100">
            <div>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Quotation Prepared For</p>
              <p className="text-sm font-black text-gray-900 mt-1">{customerName || 'Valued Farmer / Customer'}</p>
              {customerPhone && <p className="text-gray-700 font-semibold mt-0.5">Mob: {customerPhone}</p>}
              {city && <p className="text-gray-700 font-semibold">City: {city}</p>}
            </div>
            <div className="text-right flex flex-col justify-end">
              <p className="text-gray-700 font-semibold">Validity: 15 Days from Date</p>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-green-800 text-white font-black uppercase text-[10px]">
                <th className="p-3 rounded-l-lg">Sr.No.</th>
                <th className="p-3">Plant Name & Variety</th>
                <th className="p-3 text-center">Land Details</th>
                <th className="p-3 text-center">Spacing</th>
                <th className="p-3 text-right">Plants Needed</th>
                <th className="p-3 text-right">Rate</th>
                <th className="p-3 text-right rounded-r-lg">Total Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {cart.map((item, index) => {
                const sizes = [];
                if (item.hectares > 0) sizes.push(`${item.hectares} He`);
                if (item.acres > 0) sizes.push(`${item.acres} Ac`);
                if (item.gunthas > 0) sizes.push(`${item.gunthas} Gu`);

                return (
                  <tr key={item.id} className="hover:bg-gray-50 font-medium">
                    <td className="p-3 text-gray-600">{index + 1}</td>
                    <td className="p-3 font-bold">
                      {item.plantName}
                      <span className="block text-[10px] text-gray-500 font-semibold">{item.variety}</span>
                    </td>
                    <td className="p-3 text-center text-gray-700">{sizes.join(' + ') || '-'}</td>
                    <td className="p-3 text-center text-gray-700">{item.rowSpacing} × {item.plantSpacing} {item.unit}</td>
                    <td className="p-3 text-right font-bold">{item.quantity.toLocaleString()}</td>
                    <td className="p-3 text-right">₹{item.price}</td>
                    <td className="p-3 text-right font-black">₹{item.amount.toLocaleString()}</td>
                  </tr>
                );
              })}
              {cart.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-400 font-semibold">No items added to quotation.</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pricing Totals */}
          <div className="flex justify-end pt-4">
            <div className="w-64 space-y-2.5 text-xs">
              <div className="flex justify-between font-semibold text-gray-600 border-b border-gray-100 pb-1.5">
                <span>Subtotal</span>
                <span>₹{subtotal.toLocaleString()}</span>
              </div>
              {transport > 0 && (
                <div className="flex justify-between font-semibold text-gray-600 border-b border-gray-100 pb-1.5">
                  <span>Transport Charges</span>
                  <span>₹{transport.toLocaleString()}</span>
                </div>
              )}
              {disc > 0 && (
                <div className="flex justify-between font-semibold text-gray-600 border-b border-gray-100 pb-1.5">
                  <span>Discount</span>
                  <span>-₹{disc.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm text-green-900 bg-green-50 p-2.5 rounded-lg border border-green-100">
                <span>Total Quotation</span>
                <span>₹{netTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="pt-8 border-t border-gray-100 space-y-2">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Terms & Conditions</p>
            <ol className="list-decimal list-inside text-[10px] text-gray-600 space-y-1 font-semibold leading-relaxed">
              <li>Prices quoted above are ex-nursery rates. Transport charges extra.</li>
              <li>Calculations are based strictly on inputs provided by the client. Actual field counts may vary by 5% depending on topography.</li>
              <li>Booking confirmation requires 30% advance payment. Balance due at delivery.</li>
              <li>All plants are supplied subject to growth and health standard approvals.</li>
            </ol>
          </div>

          {/* Signatures */}
          <div className="flex justify-between pt-12 text-[11px] font-bold text-gray-700">
            <div className="border-t border-gray-300 w-44 pt-2 text-center">
              Customer Signature
            </div>
            <div className="border-t border-gray-300 w-44 pt-2 text-center text-green-800">
              For Shivkush Nursery
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Normal Form view
  return (
    <div className="p-6 mb-24 space-y-6 max-w-xl mx-auto">
      <header className="flex items-center space-x-3">
        <div className="bg-green-100 p-2.5 rounded-2xl">
          <Leaf className="w-7 h-7 text-green-600 animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Quotation Calculator</h1>
          <p className="text-xs font-semibold text-gray-500 mt-0.5">Quickly plan farm layout and estimate pricing</p>
        </div>
      </header>

      {/* Customer Info Card (Optional) */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Customer & Project Details</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2">
            <label className="text-[11px] font-black text-gray-500 uppercase">Customer Name</label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-sm"
              placeholder="e.g. Ramesh Kumar"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-gray-500 uppercase">Phone Number</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-sm"
              placeholder="e.g. 9876543210"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-gray-500 uppercase">City / Village</label>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-sm"
              placeholder="e.g. Pune"
            />
          </div>
        </div>
      </div>

      {/* Calculation Form */}
      <form onSubmit={handleAddItem} className="space-y-5 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-1">Calculate & Add Item</h2>
        
        {/* Plant Selection */}
        <div className="space-y-2">
          <label className="text-[11px] font-black text-gray-500 uppercase">Select Plant (Loaded from DB)</label>
          <select
            value={plantId}
            onChange={e => setPlantId(e.target.value)}
            className="w-full p-3.5 bg-white border border-green-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-sm text-green-950"
          >
            <option value="">Custom Plant (Enter details manually)...</option>
            {plants?.map(p => (
              <option key={p.id} value={p.id}>
                {p.plant_name} ({p.variety || 'Standard'}) - ₹{p.selling_price}
              </option>
            ))}
          </select>
        </div>

        {/* Custom fields when no Plant selected */}
        {!plantId && (
          <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase">Plant Name</label>
              <input
                type="text"
                required={!plantId}
                value={customPlantName}
                onChange={e => setCustomPlantName(e.target.value)}
                className="w-full p-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-xs"
                placeholder="Mango, Guava etc."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase">Price (₹)</label>
              <input
                type="number"
                min="0"
                required={!plantId}
                value={customPrice}
                onChange={e => setCustomPrice(e.target.value)}
                className="w-full p-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-xs text-center"
                placeholder="0"
              />
            </div>
            <div className="col-span-3 space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase">Variety (e.g. Grafted, Seedling)</label>
              <input
                type="text"
                value={customVariety}
                onChange={e => setCustomVariety(e.target.value)}
                className="w-full p-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-xs"
                placeholder="e.g. Kesar Grafted"
              />
            </div>
          </div>
        )}

        {/* Spacing Units Selector */}
        <div className="flex justify-between items-center py-1 border-t border-b border-gray-50">
          <span className="text-[11px] font-black text-gray-400 uppercase">Land & Spacing Unit</span>
          <div className="flex bg-gray-100 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setUnit('feet')}
              className={`px-3 py-1 text-xs font-black rounded-md transition-all ${
                unit === 'feet' ? 'bg-green-600 text-white shadow-sm' : 'text-gray-500'
              }`}
            >
              Feet (ft)
            </button>
            <button
              type="button"
              onClick={() => setUnit('meters')}
              className={`px-3 py-1 text-xs font-black rounded-md transition-all ${
                unit === 'meters' ? 'bg-green-600 text-white shadow-sm' : 'text-gray-500'
              }`}
            >
              Meters (m)
            </button>
          </div>
        </div>

        {/* Land Size Inputs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase">Hectares (हेक्टर)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={hectares}
              onChange={e => setHectares(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-base text-center"
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase">Acres (एकड़)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={acres}
              onChange={e => setAcres(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-base text-center"
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase">Gunthas (गुंठा)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={gunthas}
              onChange={e => setGunthas(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-base text-center"
              placeholder="0"
            />
          </div>
        </div>

        {/* Spacing Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 relative">
            <label className="text-[10px] font-black text-gray-400 uppercase">Row to Row ({unit})</label>
            <input
              type="number"
              min="0"
              step="0.1"
              required
              value={rowSpacing}
              onChange={e => setRowSpacing(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-base text-center"
              placeholder="e.g. 10"
            />
          </div>
          <div className="space-y-1 relative">
            <label className="text-[10px] font-black text-gray-400 uppercase">Plant to Plant ({unit})</label>
            <input
              type="number"
              min="0"
              step="0.1"
              required
              value={plantSpacing}
              onChange={e => setPlantSpacing(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-base text-center"
              placeholder="e.g. 10"
            />
          </div>
        </div>

        {/* Row Calculation Info */}
        {currentQty > 0 && (
          <div className="bg-green-50 p-3 rounded-xl border border-green-100 flex justify-between items-center text-xs font-bold text-green-800">
            <span>Plants Calculated: {currentQty.toLocaleString()}</span>
            <span>Total Rate: ₹{currentAmount.toLocaleString()}</span>
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all active:scale-[0.98] text-sm flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Item to Quotation
        </button>
      </form>

      {/* Cart Summary (Calculated items) */}
      {cart.length > 0 && (
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2 flex items-center gap-1">
            <FileText className="w-4 h-4 text-green-600" />
            <span>Quotation Items Summary</span>
          </h2>
          
          <div className="space-y-2">
            {cart.map((item, idx) => {
              const sizes = [];
              if (item.hectares > 0) sizes.push(`${item.hectares} He`);
              if (item.acres > 0) sizes.push(`${item.acres} Ac`);
              if (item.gunthas > 0) sizes.push(`${item.gunthas} Gu`);

              return (
                <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3.5 rounded-2xl border border-gray-100">
                  <div className="space-y-0.5">
                    <p className="font-black text-sm text-gray-900">{item.plantName}</p>
                    <p className="text-[10px] font-bold text-gray-500">
                      {item.variety} • {sizes.join(' + ') || 'Custom Area'} • Spacing: {item.rowSpacing}x{item.plantSpacing} {item.unit}
                    </p>
                    <p className="text-[10px] font-bold text-green-700">
                      {item.quantity.toLocaleString()} plants × ₹{item.price}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 shrink-0">
                    <span className="font-black text-sm text-gray-950">₹{item.amount.toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-2 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pricing Adjuts */}
          <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase">Transport / Other Charges (₹)</label>
              <input
                type="number"
                min="0"
                value={transportCharges}
                onChange={e => setTransportCharges(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-sm text-center"
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase">Special Discount (₹)</label>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-sm text-center text-red-600"
                placeholder="0"
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 flex justify-between items-center font-black">
            <span className="text-xs text-gray-400 uppercase tracking-widest">Total Quotation</span>
            <span className="text-2xl text-green-800">₹{netTotal.toLocaleString()}</span>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handlePrint}
              className="py-3 px-4 bg-gray-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-gray-800 active:scale-95 transition-all shadow-md"
            >
              <Printer className="w-4 h-4" /> Print Quotation
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="py-3 px-4 bg-green-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-green-700 active:scale-95 transition-all shadow-md"
            >
              <Share2 className="w-4 h-4" /> Share WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


