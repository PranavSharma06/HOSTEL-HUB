const express = require('express'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const nodemailer = require('nodemailer');
// Real email is on only when both variables are set (see .env.example). Otherwise emails are mock-only.
const tx = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } }) : null;
const wrap = (title, body) => `<div style="background:#eef1f6;padding:24px;font-family:Arial,sans-serif"><div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">
<div style="background:#14213d;color:#fff;padding:18px 24px;font-size:18px;font-weight:bold">Hostel Hub <span style="color:#fca311">&bull;</span> ${title}</div>
<div style="padding:24px;color:#222;line-height:1.6">${body}</div><div style="padding:12px 24px;background:#f6f7fb;color:#777;font-size:12px">This is an automated message from Hostel Hub.</div></div></div>`;
const FILE = path.join(__dirname, 'data.json');
const hash = p => crypto.scryptSync(p, 'hostel-salt', 32).toString('hex');
const uid = (p, n = 3) => p + crypto.randomBytes(n).toString('hex').toUpperCase();

/* Singleton: the only object that reads/writes state, so every request sees one consistent copy. */
class Store {
  static #inst;
  static get() { return Store.#inst ??= new Store(); }
  constructor() {
    this.d = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : {
      managers: [{ id: 'admin', name: 'Hostel Manager', pass: hash('admin123') }],
      rooms: [
        { id: 'r101', number: '101', type: 'Single', capacity: 1, floor: 1, fee: 8000, status: 'Available' },
        { id: 'r102', number: '102', type: 'Double', capacity: 2, floor: 1, fee: 6000, status: 'Available' },
        { id: 'r201', number: '201', type: 'Triple', capacity: 3, floor: 2, fee: 4500, status: 'Available' },
        { id: 'r202', number: '202', type: 'Double', capacity: 2, floor: 2, fee: 6000, status: 'Available' }],
      bookings: [], students: [], outbox: []
    };
    this.save();
  }
  save() { fs.writeFileSync(FILE, JSON.stringify(this.d, null, 1)); }
  occ(room) { return this.d.students.filter(s => s.roomId === room.id && s.active).length; }
  free(room) { return room.status === 'Available' ? room.capacity - this.occ(room) : 0; }
  view(r) {
    const o = this.occ(r);
    return { ...r, occupied: o, free: this.free(r),
      state: r.status === 'Maintenance' ? 'Maintenance' : o >= r.capacity ? 'Full' : o ? 'Partial' : 'Vacant' };
  }
  mail(to, subject, html) {
    const rec = { to, subject, html, at: new Date().toISOString(), sent: false };
    this.d.outbox.push(rec);
    if (!tx) return console.log(`\n[MAIL mock] to=${to} subject="${subject}" (set GMAIL_USER and GMAIL_APP_PASSWORD to send for real)`);
    tx.sendMail({ from: `"Hostel Hub" <${process.env.GMAIL_USER}>`, to, subject, html: wrap(subject, html) })
      .then(() => { rec.sent = true; this.save(); console.log(`[MAIL sent] ${to}`); })
      .catch(e => { rec.error = e.message; this.save(); console.error('[MAIL failed]', e.message); });
  }
}
const S = Store.get();

const app = express();
app.use(express.json({ limit: '3mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const sessions = new Map();
const auth = role => (req, res, next) => {
  const s = sessions.get(req.headers.authorization);
  if (!s || s.role !== role) return res.status(401).json({ error: 'Please sign in' });
  req.user = s; next();
};
const find = (arr, id) => arr.find(x => x.id === id);

// ---------- Public ----------
app.get('/api/rooms', (_, res) => res.json(S.d.rooms.map(r => S.view(r))));

app.post('/api/bookings', (req, res) => {
  const b = req.body, need = ['name', 'studentId', 'email', 'phone', 'roomType', 'checkIn', 'emergency'];
  if (need.some(k => !b[k])) return res.status(400).json({ error: 'Please fill every required field' });
  const dup = S.d.bookings.find(x => x.email === b.email && x.status === 'Pending');
  if (dup) return res.status(409).json({ error: `A pending request already exists (${dup.id})` });
  const bk = { id: uid('APP-'), ...b, status: 'Pending', createdAt: new Date().toISOString() };
  S.d.bookings.push(bk); S.save(); res.json(bk);
});

app.get('/api/status', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const list = S.d.bookings.filter(b => b.id.toLowerCase() === q || b.email.toLowerCase() === q);
  if (!list.length) return res.status(404).json({ error: 'No request found for that reference or email' });
  res.json(list.map(({ id, status, roomType, reason, createdAt }) => ({ id, status, roomType, reason, createdAt })));
});

app.post('/api/login', (req, res) => {
  const { role, id, password } = req.body;
  const u = (role === 'manager' ? S.d.managers.find(m => m.id === id)
    : S.d.students.find(s => s.loginId === id && s.active));
  if (!u || u.pass !== hash(password || '')) return res.status(401).json({ error: 'Wrong ID or password' });
  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, { role, id });
  res.json({ token, role, name: u.name });
});

// ---------- Student ----------
app.get('/api/me', auth('student'), (req, res) => {
  const s = S.d.students.find(x => x.loginId === req.user.id);
  const room = find(S.d.rooms, s.roomId);
  const roommates = S.d.students.filter(x => x.roomId === s.roomId && x.active && x !== s).map(x => x.name);
  const { pass, ...safe } = s;
  res.json({ student: safe, room: room && S.view(room), roommates,
    rules: ['Quiet hours 10 pm to 6 am', 'Visitors only in the lobby until 8 pm', 'No cooking or heaters in rooms', 'Report damage to the manager within 24 hours'] });
});

// ---------- Manager ----------
const mgr = auth('manager');
app.get('/api/bookings', mgr, (_, res) => res.json([...S.d.bookings].reverse()));

app.post('/api/bookings/:id/approve', mgr, (req, res) => {
  const b = find(S.d.bookings, req.params.id);
  if (!b || b.status !== 'Pending') return res.status(400).json({ error: 'Request is not pending' });
  const room = req.body.roomId ? find(S.d.rooms, req.body.roomId)
    : S.d.rooms.find(r => r.type === b.roomType && S.free(r) > 0);
  if (!room || S.free(room) < 1) return res.status(409).json({ error: 'That room has no free bed (full or under maintenance)' });
  const password = crypto.randomBytes(4).toString('hex'), loginId = uid('STU', 2);
  S.d.students.push({ loginId, pass: hash(password), name: b.name, studentId: b.studentId, email: b.email,
    phone: b.phone, roomId: room.id, checkIn: b.checkIn, checkOut: '', active: true, feeStatus: 'Due', bookingId: b.id });
  Object.assign(b, { status: 'Approved', roomId: room.id, decidedAt: new Date().toISOString() });
  S.mail(b.email, 'Hostel booking approved', `<h2>Welcome, ${b.name}</h2><p>Your request ${b.id} is approved.</p>
    <p><b>Room ${room.number}</b> (${room.type}, floor ${room.floor}), fee Rs ${room.fee}/month, check-in ${b.checkIn}.</p>
    <p>Login ID: <b>${loginId}</b><br>Temporary password: <b>${password}</b></p>`);
  S.save();
  res.json({ ok: true, loginId, password, room: room.number });
});

app.post('/api/bookings/:id/reject', mgr, (req, res) => {
  const b = find(S.d.bookings, req.params.id);
  if (!b || b.status !== 'Pending') return res.status(400).json({ error: 'Request is not pending' });
  if (!req.body.reason) return res.status(400).json({ error: 'Enter a reason' });
  Object.assign(b, { status: 'Rejected', reason: req.body.reason, decidedAt: new Date().toISOString() });
  S.mail(b.email, 'Hostel booking update', `<p>Hi ${b.name}, we could not approve request ${b.id}.</p><p>Reason: ${req.body.reason}</p>`);
  S.save(); res.json({ ok: true });
});

const roomFields = b => ({ number: String(b.number), type: b.type, capacity: +b.capacity, floor: +b.floor, fee: +b.fee, status: b.status || 'Available' });
app.get('/api/manager/rooms', mgr, (_, res) => res.json(S.d.rooms.map(r => S.view(r))));
app.post('/api/rooms', mgr, (req, res) => {
  const r = { id: uid('r', 2), ...roomFields(req.body) };
  if (!r.number || r.capacity < 1) return res.status(400).json({ error: 'Room number and capacity are required' });
  if (S.d.rooms.some(x => x.number === r.number)) return res.status(409).json({ error: 'Room number already exists' });
  S.d.rooms.push(r); S.save(); res.json(r);
});
app.put('/api/rooms/:id', mgr, (req, res) => {
  const r = find(S.d.rooms, req.params.id); if (!r) return res.status(404).json({ error: 'Not found' });
  const n = roomFields(req.body);
  if (n.capacity < S.occ(r)) return res.status(409).json({ error: `Capacity cannot be below current occupants (${S.occ(r)})` });
  Object.assign(r, n); S.save(); res.json(r);
});
app.delete('/api/rooms/:id', mgr, (req, res) => {
  const r = find(S.d.rooms, req.params.id); if (!r) return res.status(404).json({ error: 'Not found' });
  if (S.occ(r)) return res.status(409).json({ error: 'Room has occupants. Check them out first' });
  S.d.rooms = S.d.rooms.filter(x => x !== r); S.save(); res.json({ ok: true });
});

app.get('/api/students', mgr, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  res.json(S.d.students.filter(s => s.active && (s.name + s.studentId + s.loginId).toLowerCase().includes(q))
    .map(({ pass, ...s }) => ({ ...s, room: find(S.d.rooms, s.roomId)?.number })));
});
app.post('/api/students/:id/checkout', mgr, (req, res) => {
  const s = S.d.students.find(x => x.loginId === req.params.id); if (!s) return res.status(404).json({ error: 'Not found' });
  Object.assign(s, { active: false, checkOut: new Date().toISOString().slice(0, 10) }); S.save(); res.json({ ok: true });
});
app.get('/api/outbox', mgr, (_, res) => res.json(S.d.outbox));

require('./features')(app, S, auth, uid);
require('./reports')(app, S, auth);
require('./money')(app, S, auth, uid);
app.listen(3000, () => console.log('Hostel Hub running at http://localhost:3000'));
