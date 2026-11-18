(() => {
const rs = n => 'Rs ' + Number(n).toLocaleString('en-IN');
const H = t => `<h2 class="text-2xl mb-4">${t}</h2>`;
const box = h => `<div class="bg-white rounded-xl p-4 border mb-3">${h}</div>`;
const run = fn => async (...a) => { try { await fn(...a); } catch (x) { alert(x.message); } };
const sub = (id, h, fn) => { setTimeout(() => $('#' + id).onsubmit = e => { e.preventDefault(); run(fn)(e.target); }); return `<form id="${id}" class="bg-white rounded-xl p-5 border mb-5">${h}</form>`; };

FEAT.views.myfees = async () => {
  const f = await api('/my/fees');
  return H('My fees') + (f.warning ? `<div class="rounded-xl p-4 mb-4 bg-red-50 border border-red-200 text-red-800 text-sm">${f.warning}</div>` : '')
  + `<div class="grid sm:grid-cols-3 gap-4 mb-5">${[['Billed', f.billed], ['Paid', f.paid], ['Pending', f.pending]].map(([t, v]) => `<div class="bg-white rounded-xl p-4 border"><p class="text-sm text-stone-500">${t}</p><p class="text-2xl">${rs(v)}</p></div>`).join('')}</div>`
  + (f.pending > 0 ? box(`<b>Pay now</b><div class="flex gap-2 flex-wrap mt-2"><select class="${I} sm:w-48" onchange="$('#amt').value=Math.ceil(${f.pending}/this.value)"><option value="1">Pay in full</option><option value="2">2 installments</option><option value="3">3 installments</option></select>
    <input id="amt" type="number" min="1" max="${f.pending}" value="${f.pending}" class="${I} sm:w-40"><button class="${BTN}" onclick="payNow()">Pay online</button></div>
    ${f.gateway ? '' : '<p class="text-xs text-stone-500 mt-2">Online payment is not switched on. Pay the manager and ask them to record it.</p>'}`) : '')
  + `<div class="flex gap-2 mb-3"><button class="${GHOST}" onclick="dl('/my/invoice','invoice.pdf')">Download invoice</button></div>`
  + box(`<b>Ledger</b><table class="w-full text-sm mt-2"><tr class="border-b"><td class="py-1">Rent</td><td></td><td class="text-right">${rs(f.rent)}</td></tr>
    ${f.charges.map(c => `<tr class="border-b"><td class="py-1">${esc(c.label)}</td><td></td><td class="text-right">${rs(c.amount)}</td></tr>`).join('')}
    ${f.payments.map(p => `<tr class="border-b text-emerald-700"><td class="py-1">Payment ${new Date(p.at).toLocaleDateString()} (${p.method})</td><td><button class="${GHOST}" onclick="dl('/my/receipt/${p.id}','receipt-${p.id}.pdf')">Receipt</button></td><td class="text-right">- ${rs(p.amount)}</td></tr>`).join('')}</table>`);
};

FEAT.views.assets = async () => {
  const [rooms, as] = await Promise.all([api('/manager/rooms'), api('/assets')]);
  return H('Room assets') + sub('af', `<div class="grid sm:grid-cols-3 gap-x-4">${sel('Room', 'roomId', rooms.map(r => r.id + ' · Room ' + r.number))}${sel('Item', 'item', ['Mattress', 'Study lamp', 'Room key', 'Cupboard lock', 'Chair', 'Study table'])}${field('Quantity', 'qty', 'number', 'min=1 value=1')}</div><button class="${BTN}">Issue to room</button>`,
    async f => { const d = fd(f); d.roomId = d.roomId.split(' · ')[0]; await api('/assets', 'POST', d); route(); })
  + rooms.map(r => { const l = as.filter(a => a.roomId === r.id); return box(`<b>Room ${esc(r.number)}</b> <span class="text-sm text-stone-500">${r.occupied} resident(s)</span>${l.map(a => `<div class="flex justify-between text-sm mt-1"><span>${a.qty} x ${esc(a.item)}</span><button class="${GHOST}" onclick="delAsset('${a.id}')">Remove</button></div>`).join('') || '<p class="text-sm text-stone-400">Nothing issued.</p>'}`); }).join('');
};

FEAT.views.clearance = async () => {
  const [ss, as, sm] = await Promise.all([api('/students'), api('/assets'), api('/reports/summary')]);
  return H('Checkout clearance') + (ss.map(s => { const items = as.filter(a => a.roomId === s.roomId), p = sm.fees.find(x => x.loginId === s.loginId)?.pending || 0;
    return box(`<b>${esc(s.name)}</b> <span class="text-sm text-stone-500">room ${esc(s.room)} · ${s.loginId}</span>
    <p class="text-sm mt-2">Unpaid fees: <b class="${p ? 'text-red-700' : 'text-emerald-700'}">${rs(p)}</b></p>
    <div class="text-sm my-2">${items.map(a => `<label class="block"><input type="checkbox" class="it-${s.loginId}" value="${a.id}"> ${a.qty} x ${esc(a.item)} returned</label>`).join('') || 'No items issued to this room.'}</div>
    <div class="flex gap-2 flex-wrap items-center"><input id="dep-${s.loginId}" type="number" min="0" placeholder="Deposit held" class="${I} sm:w-36" oninput="calcRf('${s.loginId}',${p})"><input id="ded-${s.loginId}" type="number" min="0" placeholder="Damage deduction" class="${I} sm:w-40" oninput="calcRf('${s.loginId}',${p})">
    <span class="text-sm">Refund: <b id="rf-${s.loginId}">Rs 0</b></span><button class="${BTN}" onclick="doClear('${s.loginId}')">Complete clearance</button></div>`); }).join('') || '<p>No active students.</p>');
};

FEAT.views.meters = async () => {
  const [rooms, m] = await Promise.all([api('/manager/rooms'), api('/meters')]);
  return H('Electricity metering') + `<p class="text-sm text-stone-500 mb-3">Free allowance ${m.free} units per room per month, then ${rs(m.rate)} per unit, split equally among current roommates. The first reading for a room is its baseline.</p>`
  + sub('mf', `<div class="grid sm:grid-cols-3 gap-x-4">${sel('Room', 'roomId', rooms.map(r => r.id + ' · Room ' + r.number))}${field('Month', 'month', 'month', 'required')}${field('Meter reading', 'reading', 'number', 'min=0 required')}</div><button class="${BTN}">Save reading</button>`,
    async f => { const d = fd(f); d.roomId = d.roomId.split(' · ')[0]; const x = await api('/meters', 'POST', d); alert(`Used ${x.units} units, ${x.excess} above the allowance. Each roommate is charged ${rs(x.share)}.`); route(); })
  + `<div class="bg-white rounded-xl border overflow-x-auto"><table class="w-full text-sm"><tr class="text-left bg-stone-50"><th class="p-3">Room</th><th>Month</th><th>Reading</th><th>Units</th><th>Extra</th><th>Charge</th><th>Per student</th></tr>
  ${m.rows.map(x => `<tr class="border-t"><td class="p-3">${esc(x.number)}</td><td>${x.month}</td><td>${x.reading}</td><td>${x.units}</td><td>${x.excess}</td><td>${rs(x.amount)}</td><td>${rs(x.share)} (${x.n})</td></tr>`).join('') || '<tr><td class="p-3" colspan=7>No readings yet.</td></tr>'}</table></div>`;
};

FEAT.navS.push(['myfees', 'My fees']);
FEAT.navM.push(['assets', 'Room assets'], ['clearance', 'Checkout clearance'], ['meters', 'Electricity']);
Object.assign(FEAT.guard, { myfees: 'student', assets: 'manager', clearance: 'manager', meters: 'manager' });

Object.assign(window, {
  delAsset: run(async id => { await api('/assets/' + id, 'DELETE'); route(); }),
  calcRf: (id, p) => { $('#rf-' + id).textContent = rs(Math.max(0, (+$('#dep-' + id).value || 0) - p - (+$('#ded-' + id).value || 0))); },
  doClear: run(async id => {
    if (!confirm('Complete clearance and check this student out?')) return;
    const returned = [...document.querySelectorAll('.it-' + id + ':checked')].map(e => e.value);
    const r = await api('/clearance/' + id, 'POST', { deposit: $('#dep-' + id).value, deductions: $('#ded-' + id).value, returned });
    alert(`Cleared. Refund ${rs(r.refund)}.${r.missing.length ? ' Not returned: ' + r.missing.join(', ') : ''}`); route();
  }),
  payNow: run(async () => {
    const o = await api('/my/pay/order', 'POST', { amount: +$('#amt').value });
    if (!window.Razorpay) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = ok; s.onerror = () => no(Error('Could not load Razorpay. Check your internet connection.')); document.head.append(s); });
    new Razorpay({ key: o.key, amount: o.amount, currency: 'INR', order_id: o.orderId, name: 'Hostel Hub',
      handler: run(async resp => { await api('/my/pay/verify', 'POST', resp); alert('Payment received. Your receipt is in the ledger.'); route(); }) }).open();
  })
});
})();
