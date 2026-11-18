(() => {
const rs = n => 'Rs ' + Number(n).toLocaleString('en-IN');
const card = (t, v, s = '') => `<div class="bg-white rounded-xl p-4 border"><p class="text-sm text-stone-500">${t}</p><p class="text-2xl mt-1">${v}</p><p class="text-xs text-stone-400">${s}</p></div>`;

FEAT.views.reports = async () => {
  const d = await api('/reports/summary'), nowOcc = d.forecast[0];
  const beds = d.byType.reduce((a, t) => a + t.beds, 0), occ = d.byType.reduce((a, t) => a + t.occupied, 0);
  return `<div class="flex justify-between flex-wrap gap-2 mb-4"><h2 class="text-2xl">Reports and forecast</h2><div class="flex gap-2">
    <button class="${BTN}" onclick="dl('/reports/pdf','hostel-report.pdf')">Download PDF</button><button class="${GHOST}" onclick="dl('/reports/excel','hostel-report.xlsx')">Download Excel</button></div></div>
  <div class="grid sm:grid-cols-4 gap-4 mb-6">${card('Occupancy now', beds ? Math.round(occ * 100 / beds) + '%' : '0%', `${occ} of ${beds} beds`)}
  ${card('Pending fees', rs(d.pendingTotal), 'all active students')}${card('Vacant-bed revenue loss', rs(nowOcc.loss), 'per month, this month')}${card('Pending requests', d.pendingRequests, 'could fill open beds')}</div>
  <h3 class="text-lg mb-2">Beds by room type</h3><div class="bg-white rounded-xl border overflow-x-auto mb-6"><table class="w-full text-sm"><tr class="text-left bg-stone-50"><th class="p-3">Type</th><th>Rooms</th><th>Total beds</th><th>Occupied</th><th>Available</th><th>Maintenance</th></tr>
  ${d.byType.map(t => `<tr class="border-t"><td class="p-3 font-medium">${t.type}</td><td>${t.rooms}</td><td>${t.beds}</td><td>${t.occupied}</td><td><b>${t.available}</b></td><td>${t.maintenance}</td></tr>`).join('')}</table></div>
  <h3 class="text-lg mb-1">Six month forecast</h3><p class="text-sm text-stone-500 mb-3">Current residents minus the exit dates you set on the Fee arrears page. Pending requests are not counted.</p>
  <div class="bg-white rounded-xl border p-4">${d.forecast.map(m => `<div class="mb-3"><div class="flex justify-between text-sm"><span>${m.month}</span><span>${m.occupied}/${m.beds} beds · ${m.leaving} leaving · ${rs(m.revenue)} revenue · ${rs(m.loss)} lost</span></div>
  <div class="h-3 rounded bg-stone-200 mt-1"><div class="h-3 rounded" style="width:${m.pct}%;background:#fca311"></div></div></div>`).join('')}</div>`;
};

FEAT.views.fees = async () => {
  const d = await api('/reports/summary');
  return `<h2 class="text-2xl mb-1">Fee arrears</h2><p class="text-sm text-stone-500 mb-4">Billed as one monthly fee for every month since check-in. Total pending: <b>${rs(d.pendingTotal)}</b></p>
  <div class="bg-white rounded-xl border overflow-x-auto"><table class="w-full text-sm"><tr class="text-left bg-stone-50"><th class="p-3">Student</th><th>Room</th><th>Billed</th><th>Paid</th><th>Pending</th><th>Exit date</th><th></th></tr>
  ${d.fees.map(s => `<tr class="border-t"><td class="p-3">${esc(s.name)}<div class="text-xs text-stone-500">${esc(s.studentId)}</div></td><td>${esc(s.room)}</td><td>${rs(s.billed)}</td><td>${rs(s.paid)}</td>
  <td class="${s.pending ? 'text-red-700 font-semibold' : 'text-emerald-700'}">${rs(s.pending)}</td><td>${s.exitDate || 'Not set'}</td>
  <td class="p-2 whitespace-nowrap"><button class="${GHOST}" onclick="payFee('${s.loginId}')">Record payment</button> <button class="${GHOST}" onclick="setExit('${s.loginId}')">Set exit date</button></td></tr>`).join('') || '<tr><td class="p-3" colspan=7>No active students.</td></tr>'}</table></div>`;
};

FEAT.navM.splice(0, 0, ['reports', 'Reports'], ['fees', 'Fee arrears']);
Object.assign(FEAT.guard, { reports: 'manager', fees: 'manager' });

Object.assign(window, {
  dl: async (p, name) => {
    const r = await fetch('/api' + p, { headers: { Authorization: sess.token } });
    if (!r.ok) return alert('Export failed. Check that you ran npm install.');
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  },
  payFee: async id => { const v = prompt('Amount received (Rs)'); if (v) try { await api(`/students/${id}/payment`, 'POST', { amount: +v }); route(); } catch (x) { alert(x.message); } },
  setExit: async id => { const v = prompt('Expected exit date (YYYY-MM-DD)'); if (v) try { await api(`/students/${id}/exit`, 'PUT', { date: v }); route(); } catch (x) { alert(x.message); } },
  filterBar: () => `<div class="flex gap-2 mb-4"><input id="fq" oninput="filterRooms()" class="${I}" placeholder="Search rooms"><select id="ft" onchange="filterRooms()" class="${I} sm:w-44"><option value="">All types</option><option>Single</option><option>Double</option><option>Triple</option></select></div>`,
  filterRooms: () => { const t = $('#ft').value, q = $('#fq').value.toLowerCase();
    document.querySelectorAll('[data-type]').forEach(e => e.style.display = (!t || e.dataset.type === t) && e.textContent.toLowerCase().includes(q) ? '' : 'none'); }
});
})();
