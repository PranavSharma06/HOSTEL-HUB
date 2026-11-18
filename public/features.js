const FEAT = (() => {
const C = { Open: 'bg-amber-100 text-amber-800', 'In Progress': 'bg-sky-100 text-sky-800', Resolved: 'bg-emerald-100 text-emerald-800', Pending: 'bg-amber-100 text-amber-800', Approved: 'bg-emerald-100 text-emerald-800', Rejected: 'bg-red-100 text-red-800', High: 'bg-red-100 text-red-800', Medium: 'bg-amber-100 text-amber-800' };
const tag = s => `<span class="b ${C[s] || 'bg-stone-200 text-stone-700'}">${s}</span>`;
const H = t => `<h2 class="text-2xl mb-4">${t}</h2>`;
const post = (p, b, m = 'POST') => api(p, m, b).then(() => route(), x => alert(x.message));
const readFile = f => new Promise(res => { const x = f.files[0]; if (!x) return res(''); if (x.size > 1.5e6) { alert('Photo must be under 1.5 MB'); return res(''); } const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(x); });
const form = (id, h, fn) => { setTimeout(() => $('#' + id).onsubmit = e => { e.preventDefault(); fn(e.target); }); return `<form id="${id}" class="bg-white rounded-xl p-5 border mb-5">${h}</form>`; };
const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() + 864e5 * (i + 1)).toISOString().slice(0, 10));
const when = p => `${p.outAt ? 'Out ' + new Date(p.outAt).toLocaleString() : ''} ${p.inAt ? ' · In ' + new Date(p.inAt).toLocaleString() : ''}`;
const MEALS = ['Breakfast', 'Lunch', 'Dinner'];

const views = {
async mytickets() {
  const l = await api('/my/tickets');
  return H('Maintenance tickets') + form('tf', `<div class="grid sm:grid-cols-2 gap-x-4">${sel('Category', 'category', ['Plumbing', 'Electrical', 'Wi-Fi', 'Carpentry'])}${sel('Priority', 'priority', ['Low', 'Medium', 'High'])}</div>${field('What is wrong?', 'text', 'text', 'required')}<label class="block text-sm mb-3">Photo<input name="photo" type="file" accept="image/*" class="${I} mt-1"></label><button class="${BTN}">Submit ticket</button>`,
    async f => { const d = fd(f); d.photo = await readFile(f.photo); post('/my/tickets', d); })
  + l.map(t => `<div class="bg-white rounded-xl p-4 border mb-3"><div class="flex justify-between"><b>${t.category} · ${esc(t.text)}</b>${tag(t.status)}</div><p class="text-sm text-stone-500">${t.id} · ${tag(t.priority)} · ${t.assignee ? 'Assigned to ' + esc(t.assignee) : 'Not assigned yet'}</p>${t.photo ? `<img src="${t.photo}" class="h-24 rounded mt-2">` : ''}${t.status === 'Resolved' ? (t.rating ? `<p class="mt-2 text-sm">You rated ${t.rating}/5</p>` : `<p class="mt-2 text-sm">Rate the fix: ${[1, 2, 3, 4, 5].map(n => `<button class="${GHOST}" onclick="rateT('${t.id}',${n})">${n}</button>`).join(' ')}</p>`) : ''}</div>`).join('');
},
async tickets() {
  const l = await api('/tickets');
  return H('Maintenance tickets') + (l.map(t => `<div class="bg-white rounded-xl p-4 border mb-3"><div class="flex justify-between"><b>Room ${esc(t.room)} · ${t.category}</b>${tag(t.priority)}</div><p class="text-sm mt-1">${esc(t.text)} <span class="text-stone-500">(${esc(t.name)}${t.rating ? ', rated ' + t.rating + '/5' : ''})</span></p>${t.photo ? `<img src="${t.photo}" class="h-24 rounded mt-2">` : ''}<div class="flex gap-2 mt-3 flex-wrap"><input id="as-${t.id}" class="${I} sm:w-48" placeholder="Assign to staff" value="${esc(t.assignee)}"><select id="st-${t.id}" class="${I} sm:w-40">${['Open', 'In Progress', 'Resolved'].map(o => `<option ${o == t.status ? 'selected' : ''}>${o}</option>`).join('')}</select><button class="${BTN}" onclick="saveT('${t.id}')">Save</button></div></div>`).join('') || '<p>No tickets.</p>');
},
async mymess() {
  const [menu, k] = await Promise.all([api('/menu'), api('/my/skips')]);
  const has = (d, m) => k.skips.some(x => x.date == d && x.meal == m);
  return H('Weekly menu') + `<p class="mb-4 text-stone-600">Skip a meal at least a day ahead. Rebate so far: <b>Rs ${k.rebate}</b> (Rs 40 per skipped meal).</p><div class="bg-white rounded-xl border overflow-x-auto"><table class="w-full text-sm"><tr class="text-left bg-stone-50"><th class="p-3">Day</th>${MEALS.map(m => `<th>${m}</th>`).join('')}</tr>${days.map(d => { const m = menu[new Date(d).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })]; return `<tr class="border-t"><td class="p-3">${d}${m.special ? `<div class="text-xs text-amber-600">Special: ${m.special}</div>` : ''}</td>${MEALS.map(x => `<td class="py-2">${m[x]}<label class="block text-xs text-stone-500"><input type="checkbox" ${has(d, x) ? 'checked' : ''} onchange="skipM('${d}','${x}',this.checked)"> Skip</label></td>`).join('')}</tr>`; }).join('')}</table></div>`;
},
async mess() {
  const h = await api('/headcount?date=' + days[0]);
  return H('Kitchen headcount for ' + days[0]) + `<div class="grid sm:grid-cols-3 gap-4">${Object.entries(h).map(([m, v]) => `<div class="bg-white rounded-xl p-4 border"><b>${m}</b><p class="text-3xl mt-2">${v.total - v.skipping}</p><p class="text-sm text-stone-500">${v.skipping} skipping of ${v.total}</p></div>`).join('')}</div>`;
},
async mypasses() {
  const l = await api('/my/passes');
  setTimeout(() => l.forEach(p => p.qr && new QRCode($('#qr-' + p.id), { text: p.qr, width: 120, height: 120 })));
  return H('Gate passes') + form('pf', `<div class="grid sm:grid-cols-2 gap-x-4">${sel('Type', 'type', ['Night-out', 'Weekend', 'Medical'])}${field('Parent email', 'parentEmail', 'email', 'required')}${field('From', 'from', 'date', 'required')}${field('Back by', 'to', 'date', 'required')}</div>${field('Reason', 'reason', 'text', 'required')}<button class="${BTN}">Request pass</button>`, f => post('/my/passes', fd(f)))
  + l.map(p => `<div class="bg-white rounded-xl p-4 border mb-3 flex justify-between gap-3 flex-wrap"><div><b>${p.type}</b> ${tag(p.status)}<p class="text-sm text-stone-500">${p.from} to ${p.to} · ${esc(p.reason)}</p><p class="text-xs">${when(p)}</p>${p.qr ? `<p class="text-xs mt-2 break-all text-stone-400">${p.qr}</p><p class="text-xs">The code is valid for 2 minutes. Reopen this page for a fresh one.</p>` : ''}</div>${p.qr ? `<div id="qr-${p.id}"></div>` : ''}</div>`).join('');
},
async gate() {
  const l = await api('/passes');
  return H('Gate passes') + form('gf', `${field('Paste the scanned QR text', 'payload', 'text', 'required')}<button class="${BTN}">Scan</button>`, async f => { try { const r = await api('/gate/scan', 'POST', fd(f)); alert(`${r.name} marked ${r.action}`); route(); } catch (x) { alert(x.message); } })
  + l.map(p => `<div class="bg-white rounded-xl p-4 border mb-3"><div class="flex justify-between"><b>${esc(p.name)} · ${p.type}</b>${tag(p.status)}</div><p class="text-sm text-stone-500">${p.from} to ${p.to} · ${esc(p.reason)} · parent ${esc(p.parentEmail)}</p><p class="text-xs">${when(p)}</p>${p.status === 'Pending' ? `<div class="mt-2 flex gap-2"><button class="${BTN}" onclick="post2('/passes/${p.id}/approve')">Approve</button><button class="${GHOST}" onclick="post2('/passes/${p.id}/reject')">Reject</button></div>` : ''}</div>`).join('');
},
async sos() {
  const l = await api('/sos');
  return H('SOS alerts') + (l.map(s => `<div class="bg-white rounded-xl p-4 border mb-3 ${s.resolved ? '' : 'border-l-4 border-l-red-500'}"><b>${esc(s.name)} · Room ${esc(s.room)}</b><p class="text-sm">${new Date(s.at).toLocaleString()} ${s.lat ? `· <a class="underline" target="_blank" href="https://maps.google.com/?q=${s.lat},${s.lng}">Live location</a>` : '· location unavailable'}</p>${s.resolved ? '' : `<button class="${BTN} mt-2" onclick="post2('/sos/${s.id}/resolve')">Mark resolved</button>`}</div>`).join('') || '<p>No alerts.</p>');
},
async board() {
  const l = await api('/board'), mgr = sess?.role === 'manager', stu = sess?.role === 'student';
  return H('Notice board') + (mgr ? form('bf', `${field('Title', 'title', 'text', 'required')}${field('Details', 'body')}<label class="text-sm block mb-3"><input type="checkbox" name="urgent"> Urgent</label><button class="${BTN}">Pin notice</button>`, f => post('/board', fd(f))) : '')
  + (stu ? form('bf', `${sel('Item', 'kind', ['lost', 'found'])}${field('What and where', 'title', 'text', 'required')}${field('Contact or details', 'body')}<button class="${BTN}">Post to lost and found</button>`, f => post('/my/board', fd(f))) : '')
  + l.map(n => `<div class="bg-white rounded-xl p-4 border mb-3 ${n.urgent ? 'border-l-4 border-l-red-500' : ''}"><div class="flex justify-between"><b>${esc(n.title)}</b><span class="b bg-stone-200 text-stone-700">${n.kind === 'notice' ? (n.urgent ? 'Urgent notice' : 'Notice') : n.kind === 'lost' ? 'Lost' : 'Found'}</span></div><p class="text-sm">${esc(n.body)}</p><p class="text-xs text-stone-400">${esc(n.by)} · ${new Date(n.at).toLocaleDateString()}</p>${mgr ? `<button class="${GHOST} mt-2" onclick="post2('/board/${n.id}','DELETE')">Remove</button>` : ''}</div>`).join('');
},
async incidents() {
  const [l, ss] = await Promise.all([api('/incidents'), api('/students')]);
  return H('Incident log (managers only)') + form('inf', `${sel('Student', 'loginId', ss.map(s => s.loginId + ' · ' + s.name))}${sel('Type', 'type', ['Warning', 'Noise complaint', 'Curfew violation', 'Other'])}${field('Notes', 'note', 'text', 'required')}<button class="${BTN}">Add entry</button>`, f => { const d = fd(f); d.loginId = d.loginId.split(' · ')[0]; post('/incidents', d); })
  + l.map(i => `<div class="bg-white rounded-xl p-4 border mb-3"><b>${esc(i.name)}</b> · ${i.type}<p class="text-sm">${esc(i.note)}</p><p class="text-xs text-stone-400">${new Date(i.at).toLocaleString()}</p></div>`).join('');
}};

Object.assign(window, {
  saveT: id => post('/tickets/' + id, { status: $('#st-' + id).value, assignee: $('#as-' + id).value }, 'PUT'),
  rateT: (id, n) => post(`/my/tickets/${id}/rate`, { rating: n }),
  skipM: (date, meal, skip) => api('/my/skips', 'POST', { date, meal, skip }).then(() => route(), x => { alert(x.message); route(); }),
  post2: (p, m = 'POST') => post(p, {}, m)
});

// Floating SOS button (students only)
const b = document.createElement('button');
b.textContent = 'SOS'; b.hidden = true;
b.className = 'fixed bottom-5 right-5 w-16 h-16 rounded-full bg-red-600 text-white font-bold shadow-lg z-50';
b.onclick = () => {
  if (!confirm('Send an emergency alert to the wardens?')) return;
  const go = (lat, lng) => api('/my/sos', 'POST', { lat, lng }).then(() => alert('Alert sent. Help is on the way.'), x => alert(x.message));
  navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => go(p.coords.latitude, p.coords.longitude), () => go()) : go();
};
document.body.append(b);
let seen = -1;
setInterval(async () => {
  b.hidden = !(sess && sess.role === 'student');
  if (sess?.role !== 'manager') return seen = -1;
  try { const n = (await api('/sos')).filter(s => !s.resolved).length; if (seen >= 0 && n > seen) push('SOS alert', 'A student pressed the SOS button'); seen = n; } catch {}
}, 8000);

return { views,
  guard: { tickets: 'manager', mess: 'manager', gate: 'manager', sos: 'manager', incidents: 'manager', mytickets: 'student', mymess: 'student', mypasses: 'student' },
  navM: [['tickets', 'Maintenance'], ['mess', 'Mess headcount'], ['gate', 'Gate passes'], ['sos', 'SOS alerts'], ['board', 'Notice board'], ['incidents', 'Incidents']],
  navS: [['mytickets', 'Maintenance'], ['mymess', 'Meals'], ['mypasses', 'Gate pass'], ['board', 'Notice board']] };
})();
