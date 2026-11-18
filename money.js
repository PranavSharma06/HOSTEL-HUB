const crypto = require('crypto'), PDF = require('pdfkit');
module.exports = (app, S, auth, uid) => {
  for (const k of ['payments', 'charges', 'assets', 'clearances', 'meters']) S.d[k] ??= [];
  S.d.orders ??= {};
  const T = auth('student'), M = auth('manager'), now = () => new Date().toISOString();
  const RZ = process.env.RAZORPAY_KEY_ID, RS = process.env.RAZORPAY_KEY_SECRET;
  const FREE = +process.env.FREE_UNITS || 100, RATE = +process.env.UNIT_RATE || 8, LATE = +process.env.LATE_FEE_PER_DAY || 50;
  const bad = (r, e, c = 400) => r.status(c).json({ error: e });
  const done = (r, o) => { S.save(); r.json(o ?? { ok: true }); };
  const stu = id => S.d.students.find(s => s.loginId === id);
  const roomNo = s => S.d.rooms.find(x => x.id === s.roomId)?.number || '-';
  const pdf = (res, name, fn) => { const d = new PDF({ margin: 50 }); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=${name}`); d.pipe(res); fn(d); d.end(); };

  const addPayment = (s, amount, method, ref = '') => {
    const p = { id: uid('PAY-', 3), loginId: s.loginId, amount, method, ref, at: now() };
    S.d.payments.push(p); s.paid = (s.paid || 0) + amount;
    s.feeStatus = S.fees().find(x => x.loginId === s.loginId).pending > 0 ? 'Due' : 'Paid';
    S.mail(s.email, 'Payment received', `<p>We received <b>Rs ${amount}</b> (${method}). Receipt no. ${p.id}. You can download it from My fees.</p>`);
    S.save(); return p;
  };

  // ---- Student fee ledger ----
  app.get('/api/my/fees', T, (q, r) => {
    const f = S.fees().find(x => x.loginId === q.user.id); if (!f) return bad(r, 'No active booking');
    const charges = S.d.charges.filter(c => c.loginId === q.user.id), day = new Date().getDate();
    r.json({ ...f, rent: f.billed - charges.reduce((a, c) => a + c.amount, 0), charges, payments: S.d.payments.filter(p => p.loginId === q.user.id).reverse(), gateway: !!(RZ && RS),
      warning: f.pending > 0 && day > 10 ? `Rent was due by the 10th. A late fee of Rs ${LATE} per day may apply (about Rs ${LATE * (day - 10)} so far).` : '' });
  });

  // ---- Razorpay (orders API over fetch, signature checked on our server) ----
  app.post('/api/my/pay/order', T, async (q, r) => {
    if (!RZ || !RS) return bad(r, 'Online payments are not set up yet. Ask the manager to record your payment.');
    const amt = Math.round(+q.body.amount), f = S.fees().find(x => x.loginId === q.user.id);
    if (!f || !(amt > 0) || amt > f.pending) return bad(r, 'Enter an amount up to your pending balance');
    try {
      const res = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(RZ + ':' + RS).toString('base64') },
        body: JSON.stringify({ amount: amt * 100, currency: 'INR', receipt: uid('rc', 4) }) });
      const o = await res.json(); if (!res.ok) return bad(r, o.error?.description || 'Gateway error', 502);
      S.d.orders[o.id] = { loginId: q.user.id, amount: amt }; S.save();
      r.json({ orderId: o.id, amount: o.amount, key: RZ });
    } catch { bad(r, 'Could not reach Razorpay', 502); }
  });
  app.post('/api/my/pay/verify', T, (q, r) => {
    const { razorpay_order_id: o, razorpay_payment_id: p, razorpay_signature: g } = q.body, ord = S.d.orders[o];
    if (!ord || ord.loginId !== q.user.id) return bad(r, 'Unknown order');
    const ok = crypto.createHmac('sha256', RS).update(o + '|' + p).digest('hex') === g;
    if (!ok) return bad(r, 'Payment verification failed');
    delete S.d.orders[o]; addPayment(stu(q.user.id), ord.amount, 'Razorpay', p); r.json({ ok: true });
  });

  // ---- Receipts and invoice (PDF) ----
  const receipt = (q, r) => {
    const p = S.d.payments.find(x => x.id === q.params.id && (q.user.role === 'manager' || x.loginId === q.user.id));
    if (!p) return bad(r, 'Not found', 404);
    const s = stu(p.loginId);
    pdf(r, `receipt-${p.id}.pdf`, d => {
      d.fontSize(20).text('Hostel Hub payment receipt').moveDown().fontSize(12).text(`Receipt no: ${p.id}`).text(`Date: ${new Date(p.at).toLocaleString()}`)
        .text(`Student: ${s.name} (${s.studentId})`).text(`Room: ${roomNo(s)}`).text(`Amount: Rs ${p.amount}`).text(`Method: ${p.method}${p.ref ? ' / ' + p.ref : ''}`)
        .moveDown().fontSize(9).fillColor('#666').text('Computer generated receipt for fees received. It is not a certified tax document.');
    });
  };
  app.get('/api/my/receipt/:id', T, receipt); app.get('/api/receipt/:id', M, receipt);
  app.get('/api/my/invoice', T, (q, r) => {
    const f = S.fees().find(x => x.loginId === q.user.id), s = stu(q.user.id); if (!f) return bad(r, 'No active booking');
    const ch = S.d.charges.filter(c => c.loginId === s.loginId), rent = f.billed - ch.reduce((a, c) => a + c.amount, 0);
    pdf(r, 'invoice.pdf', d => {
      d.fontSize(20).text('Hostel Hub invoice').moveDown().fontSize(12).text(`${s.name} (${s.studentId}), room ${f.room}`).text(`Date: ${new Date().toLocaleDateString()}`).moveDown();
      d.text(`Rent: Rs ${rent} (Rs ${f.fee} per month since check-in)`); ch.forEach(c => d.text(`${c.label}: Rs ${c.amount}`));
      d.moveDown().text(`Total billed: Rs ${f.billed}`).text(`Paid: Rs ${f.paid}`).fontSize(14).text(`Balance due: Rs ${f.pending}`);
    });
  });

  // ---- Room assets ----
  app.get('/api/assets', M, (_, r) => r.json(S.d.assets));
  app.post('/api/assets', M, (q, r) => {
    const rm = S.d.rooms.find(x => x.id === q.body.roomId), qty = Math.max(1, +q.body.qty || 1);
    if (!rm || !q.body.item) return bad(r, 'Choose a room and an item');
    S.d.assets.push({ id: uid('A-', 2), roomId: rm.id, number: rm.number, item: q.body.item, qty, at: now() }); done(r);
  });
  app.delete('/api/assets/:id', M, (q, r) => { S.d.assets = S.d.assets.filter(x => x.id !== q.params.id); done(r); });

  // ---- Checkout clearance and deposit refund ----
  app.post('/api/clearance/:id', M, (q, r) => {
    const s = stu(q.params.id), f = S.fees().find(x => x.loginId === q.params.id);
    if (!s || !s.active || !f) return bad(r, 'Student is not active');
    const deposit = Math.max(0, +q.body.deposit || 0), deductions = Math.max(0, +q.body.deductions || 0);
    const items = S.d.assets.filter(a => a.roomId === s.roomId), back = q.body.returned || [];
    const missing = items.filter(a => !back.includes(a.id)).map(a => `${a.qty} x ${a.item}`);
    const refund = Math.max(0, deposit - f.pending - deductions);
    S.d.clearances.push({ id: uid('CL-', 2), loginId: s.loginId, name: s.name, room: roomNo(s), deposit, pending: f.pending, deductions, refund, missing, at: now() });
    Object.assign(s, { active: false, checkOut: now().slice(0, 10) });
    S.mail(s.email, 'Hostel checkout clearance', `<p>Your clearance is complete.</p><p>Deposit Rs ${deposit}, unpaid fees Rs ${f.pending}, deductions Rs ${deductions}.<br><b>Refund: Rs ${refund}</b></p>${missing.length ? `<p>Items not returned: ${missing.join(', ')}</p>` : ''}`);
    done(r, { refund, missing });
  });

  // ---- Electricity: excess units split equally among active roommates ----
  app.get('/api/meters', M, (_, r) => r.json({ free: FREE, rate: RATE, rows: [...S.d.meters].reverse() }));
  app.post('/api/meters', M, (q, r) => {
    const { roomId, month, reading } = q.body, rm = S.d.rooms.find(x => x.id === roomId), val = +reading;
    if (!rm || !/^\d{4}-\d{2}$/.test(month) || reading === '' || !(val >= 0)) return bad(r, 'Choose a room, month and reading');
    const hist = S.d.meters.filter(m => m.roomId === roomId);
    if (hist.some(m => m.month === month)) return bad(r, 'A reading for that month already exists', 409);
    const prev = hist.length ? hist[hist.length - 1].reading : null;
    if (prev !== null && val < prev) return bad(r, `Reading cannot be below the last one (${prev})`);
    const units = prev === null ? 0 : val - prev, excess = Math.max(0, units - FREE), amount = excess * RATE;
    const mates = S.d.students.filter(s => s.roomId === roomId && s.active), share = mates.length ? Math.round(amount / mates.length) : 0;
    if (share > 0) mates.forEach(s => {
      S.d.charges.push({ id: uid('C-', 3), loginId: s.loginId, label: `Electricity ${month}, room ${rm.number} (${excess} extra units)`, amount: share, at: now() });
      S.mail(s.email, 'Electricity charge added', `<p>Room ${rm.number} used ${units} units in ${month}, ${excess} above the free ${FREE}. Your share: <b>Rs ${share}</b>.</p>`);
    });
    S.d.meters.push({ id: uid('M-', 2), roomId, number: rm.number, month, reading: val, prev, units, excess, amount, share, n: mates.length, at: now() });
    done(r, { units, excess, share });
  });
};
