const crypto = require('crypto');
module.exports = (app, S, auth, uid) => {
  for (const k of ['tickets', 'skips', 'passes', 'sos', 'board', 'incidents']) S.d[k] ??= [];
  S.d.menu ??= Object.fromEntries(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => [d, {
    Breakfast: ['Poha', 'Idli sambar', 'Paratha', 'Upma', 'Dosa', 'Puri bhaji', 'Pancakes'][i],
    Lunch: ['Dal rice', 'Rajma rice', 'Veg biryani', 'Kadhi rice', 'Chole rice', 'Paneer thali', 'Khichdi'][i],
    Dinner: ['Roti sabzi', 'Pulao raita', 'Pasta', 'Dal tadka', 'Fried rice', 'Pizza night', 'Chapati curry'][i],
    special: ['', '', '', '', '', 'Gulab jamun', 'Kheer'][i] }]));
  const T = auth('student'), M = auth('manager'), now = () => new Date().toISOString();
  const me = q => S.d.students.find(s => s.loginId === q.user.id);
  const roomNo = s => S.d.rooms.find(x => x.id === s.roomId)?.number;
  const done = (r, o) => { S.save(); r.json(o ?? { ok: true }); };
  const bad = (r, e, c = 400) => r.status(c).json({ error: e });
  const SECRET = crypto.randomBytes(16).toString('hex');
  const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('hex').slice(0, 10);

  // ---- Maintenance tickets ----
  app.post('/api/my/tickets', T, (q, r) => {
    const { category, priority, text, photo } = q.body, s = me(q);
    if (!text) return bad(r, 'Describe the problem');
    S.d.tickets.push({ id: uid('T-', 2), loginId: s.loginId, name: s.name, room: roomNo(s), category, priority, text,
      photo: photo || '', status: 'Open', assignee: '', rating: 0, at: now() });
    done(r);
  });
  app.get('/api/my/tickets', T, (q, r) => r.json(S.d.tickets.filter(t => t.loginId === q.user.id).reverse()));
  app.post('/api/my/tickets/:id/rate', T, (q, r) => {
    const t = S.d.tickets.find(x => x.id === q.params.id && x.loginId === q.user.id);
    if (!t || t.status !== 'Resolved') return bad(r, 'Only resolved tickets can be rated');
    t.rating = Math.min(5, Math.max(1, +q.body.rating)); done(r);
  });
  app.get('/api/tickets', M, (_, r) => r.json([...S.d.tickets].reverse()));
  app.put('/api/tickets/:id', M, (q, r) => {
    const t = S.d.tickets.find(x => x.id === q.params.id); if (!t) return bad(r, 'Not found', 404);
    Object.assign(t, { status: q.body.status, assignee: q.body.assignee });
    const s = S.d.students.find(x => x.loginId === t.loginId);
    if (t.status === 'Resolved' && s) S.mail(s.email, 'Maintenance ticket resolved', `<p>Your ticket ${t.id} (${t.category}) is marked Resolved. Please rate the fix in your portal.</p>`);
    done(r);
  });

  // ---- Mess ----
  app.get('/api/menu', (_, r) => r.json(S.d.menu));
  app.get('/api/my/skips', T, (q, r) => { const l = S.d.skips.filter(x => x.loginId === q.user.id); r.json({ skips: l, rebate: l.length * 40 }); });
  app.post('/api/my/skips', T, (q, r) => {
    const { date, meal, skip } = q.body;
    if (date <= now().slice(0, 10)) return bad(r, 'Skips must be set at least a day ahead');
    S.d.skips = S.d.skips.filter(x => !(x.loginId === q.user.id && x.date === date && x.meal === meal));
    if (skip) S.d.skips.push({ loginId: q.user.id, date, meal });
    done(r);
  });
  app.get('/api/headcount', M, (q, r) => {
    const total = S.d.students.filter(s => s.active).length;
    r.json(Object.fromEntries(['Breakfast', 'Lunch', 'Dinner'].map(m => [m, { total, skipping: S.d.skips.filter(x => x.date === q.query.date && x.meal === m).length }])));
  });

  // ---- Gate passes (QR payload = code.timestamp.signature, valid 2 minutes) ----
  app.post('/api/my/passes', T, (q, r) => {
    const { type, from, to, reason, parentEmail } = q.body, s = me(q);
    if (![type, from, to, reason, parentEmail].every(Boolean) || to < from) return bad(r, 'Fill all fields with valid dates');
    S.d.passes.push({ id: uid('P-', 2), loginId: s.loginId, name: s.name, type, from, to, reason, parentEmail, status: 'Pending', at: now() });
    done(r);
  });
  app.get('/api/my/passes', T, (q, r) => r.json(S.d.passes.filter(p => p.loginId === q.user.id).reverse().map(p => {
    const ts = Date.now();
    return { ...p, qr: p.status === 'Approved' && !p.inAt ? `${p.code}.${ts}.${sign(p.code + ts)}` : null };
  })));
  app.get('/api/passes', M, (_, r) => r.json([...S.d.passes].reverse()));
  app.post('/api/passes/:id/:act', M, (q, r) => {
    const p = S.d.passes.find(x => x.id === q.params.id);
    if (!p || p.status !== 'Pending') return bad(r, 'Not pending');
    if (q.params.act === 'approve') { p.status = 'Approved'; p.code = uid('GP-', 4); } else p.status = 'Rejected';
    const s = S.d.students.find(x => x.loginId === p.loginId);
    if (s) S.mail(s.email, `Gate pass ${p.status.toLowerCase()}`, `<p>Your ${p.type} pass (${p.from} to ${p.to}) was ${p.status.toLowerCase()}.${p.status === 'Approved' ? ' Open Gate pass in your portal to show your QR code at the gate.' : ''}</p>`);
    done(r);
  });
  app.post('/api/gate/scan', M, (q, r) => {
    const [code, ts, sig] = String(q.body.payload || '').trim().split('.');
    const p = S.d.passes.find(x => x.code && x.code === code);
    if (!p || sig !== sign(code + ts)) return bad(r, 'Invalid QR');
    if (Date.now() - ts > 120000) return bad(r, 'QR expired. Ask the student to reopen the page');
    const day = now().slice(0, 10);
    if (day < p.from || day > p.to) return bad(r, 'Pass is not valid today');
    if (!p.outAt) {
      p.outAt = now();
      S.mail(p.parentEmail, 'Your ward has left the hostel', `<p>${p.name} left the hostel at ${new Date().toLocaleString()} on ${p.type} leave. Expected back by ${p.to}.</p>`);
      return done(r, { action: 'OUT', name: p.name });
    }
    if (p.inAt) return bad(r, 'Pass already used');
    p.inAt = now(); done(r, { action: 'IN', name: p.name });
  });

  // ---- SOS ----
  app.post('/api/my/sos', T, (q, r) => {
    const s = me(q), { lat, lng } = q.body, room = roomNo(s);
    S.d.sos.push({ id: uid('SOS-', 2), name: s.name, room, lat, lng, at: now(), resolved: false });
    S.mail(process.env.WARDEN_EMAIL || process.env.GMAIL_USER || 'warden@example.com', `SOS from room ${room}`,
      `<p><b>${s.name}</b> in room ${room} pressed the SOS button.</p>${lat ? `<p><a href="https://maps.google.com/?q=${lat},${lng}">Live location</a></p>` : '<p>Location unavailable.</p>'}`);
    done(r);
  });
  app.get('/api/sos', M, (_, r) => r.json([...S.d.sos].reverse()));
  app.post('/api/sos/:id/resolve', M, (q, r) => { const x = S.d.sos.find(s => s.id === q.params.id); if (x) x.resolved = true; done(r); });

  // ---- Notice board + lost and found ----
  app.get('/api/board', (_, r) => r.json([...S.d.board].reverse()));
  app.post('/api/my/board', T, (q, r) => {
    if (!q.body.title) return bad(r, 'Add a title');
    S.d.board.push({ id: uid('B-', 2), kind: q.body.kind === 'found' ? 'found' : 'lost', title: q.body.title, body: q.body.body || '', by: me(q).name, at: now() }); done(r);
  });
  app.post('/api/board', M, (q, r) => {
    if (!q.body.title) return bad(r, 'Add a title');
    S.d.board.push({ id: uid('B-', 2), kind: 'notice', urgent: !!q.body.urgent, title: q.body.title, body: q.body.body || '', by: 'Manager', at: now() }); done(r);
  });
  app.delete('/api/board/:id', M, (q, r) => { S.d.board = S.d.board.filter(x => x.id !== q.params.id); done(r); });

  // ---- Incident log (manager only) ----
  app.get('/api/incidents', M, (_, r) => r.json([...S.d.incidents].reverse()));
  app.post('/api/incidents', M, (q, r) => {
    const s = S.d.students.find(x => x.loginId === q.body.loginId);
    if (!s || !q.body.note) return bad(r, 'Choose a student and add notes');
    S.d.incidents.push({ id: uid('I-', 2), loginId: s.loginId, name: s.name, type: q.body.type, note: q.body.note, at: now() }); done(r);
  });
};
