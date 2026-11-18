const ExcelJS = require('exceljs'), PDF = require('pdfkit');
module.exports = (app, S, auth) => {
  const M = auth('manager');
  const room = id => S.d.rooms.find(r => r.id === id);
  // Billing rule: one monthly fee per calendar month from the check-in month until now.
  const months = from => { const a = new Date(from), b = new Date(); return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1); };
  const fees = () => S.d.students.filter(s => s.active).map(s => {
    const fee = room(s.roomId)?.fee || 0, extra = (S.d.charges || []).filter(c => c.loginId === s.loginId).reduce((a, c) => a + c.amount, 0), billed = months(s.checkIn) * fee + extra, paid = s.paid || 0;
    return { loginId: s.loginId, name: s.name, studentId: s.studentId, room: room(s.roomId)?.number, fee, billed, paid, pending: Math.max(0, billed - paid), exitDate: s.exitDate || '' };
  }).sort((a, b) => b.pending - a.pending);

  S.fees = fees;
  const byType = () => {
    const t = {};
    for (const r of S.d.rooms) {
      const v = S.view(r), x = t[r.type] ??= { type: r.type, rooms: 0, beds: 0, occupied: 0, available: 0, maintenance: 0 };
      x.rooms++; x.beds += r.capacity; x.occupied += v.occupied;
      r.status === 'Maintenance' ? x.maintenance += r.capacity - v.occupied : x.available += v.free;
    }
    return Object.values(t);
  };

  // Projection: current residents minus planned exit dates. Pending requests are reported separately.
  const forecast = () => {
    const live = S.d.rooms.filter(r => r.status === 'Available');
    const beds = live.reduce((a, r) => a + r.capacity, 0), potential = live.reduce((a, r) => a + r.capacity * r.fee, 0);
    const people = S.d.students.filter(s => s.active), now = new Date(), out = [];
    for (let i = 0; i < 6; i++) {
      const end = new Date(now.getFullYear(), now.getMonth() + i + 1, 0).toISOString().slice(0, 10), month = end.slice(0, 7);
      const stay = people.filter(s => !s.exitDate || s.exitDate > end);
      const revenue = stay.reduce((a, s) => a + (room(s.roomId)?.fee || 0), 0);
      out.push({ month, occupied: stay.length, beds, pct: beds ? Math.round(stay.length * 100 / beds) : 0,
        leaving: people.filter(s => s.exitDate?.slice(0, 7) === month).length, revenue, loss: potential - revenue });
    }
    return out;
  };

  app.get('/api/reports/summary', M, (_, r) => {
    const f = fees();
    r.json({ byType: byType(), forecast: forecast(), fees: f, pendingTotal: f.reduce((a, x) => a + x.pending, 0),
      pendingRequests: S.d.bookings.filter(b => b.status === 'Pending').length });
  });
  app.post('/api/students/:id/payment', M, (q, r) => {
    const s = S.d.students.find(x => x.loginId === q.params.id), amt = +q.body.amount;
    if (!s || !(amt > 0)) return r.status(400).json({ error: 'Enter a valid amount' });
    (S.d.payments ??= []).push({ id: 'PAY-' + Date.now().toString(36).toUpperCase(), loginId: s.loginId, amount: amt, method: 'Cash/manager', ref: '', at: new Date().toISOString() });
    s.paid = (s.paid || 0) + amt;
    s.feeStatus = fees().find(x => x.loginId === s.loginId).pending > 0 ? 'Due' : 'Paid';
    S.save(); r.json({ ok: true });
  });
  app.put('/api/students/:id/exit', M, (q, r) => {
    const s = S.d.students.find(x => x.loginId === q.params.id);
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(q.body.date)) return r.status(400).json({ error: 'Use the date format YYYY-MM-DD' });
    s.exitDate = q.body.date; S.save(); r.json({ ok: true });
  });

  app.get('/api/reports/excel', M, async (_, res) => {
    const wb = new ExcelJS.Workbook();
    const add = (name, cols, rows) => {
      const ws = wb.addWorksheet(name);
      ws.columns = cols.map(c => ({ header: c[0], key: c[1], width: c[2] || 16 }));
      ws.addRows(rows); ws.getRow(1).font = { bold: true };
    };
    add('Room types', [['Type', 'type'], ['Rooms', 'rooms'], ['Total beds', 'beds'], ['Occupied', 'occupied'], ['Available', 'available'], ['Maintenance beds', 'maintenance']], byType());
    add('Fee arrears', [['Login ID', 'loginId'], ['Name', 'name', 22], ['Student ID', 'studentId'], ['Room', 'room'], ['Monthly fee', 'fee'], ['Billed', 'billed'], ['Paid', 'paid'], ['Pending', 'pending']], fees());
    add('Forecast', [['Month', 'month'], ['Occupied', 'occupied'], ['Beds', 'beds'], ['Occupancy %', 'pct'], ['Leaving', 'leaving'], ['Revenue', 'revenue'], ['Vacant-bed loss', 'loss']], forecast());
    add('Leave records', [['Student', 'name', 22], ['Type', 'type'], ['From', 'from'], ['To', 'to'], ['Status', 'status'], ['Out', 'outAt', 24], ['In', 'inAt', 24]], S.d.passes || []);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=hostel-report.xlsx');
    await wb.xlsx.write(res); res.end();
  });

  app.get('/api/reports/pdf', M, (_, res) => {
    const d = new PDF({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=hostel-report.pdf');
    d.pipe(res);
    const h = t => d.moveDown().fontSize(14).fillColor('#14213d').text(t).fontSize(11).fillColor('#000');
    d.fontSize(20).text('Hostel Hub report').fontSize(10).fillColor('#666').text(new Date().toLocaleString()).fillColor('#000');
    h('Beds by room type');
    byType().forEach(t => d.text(`${t.type}: ${t.available} available of ${t.beds} beds (${t.occupied} occupied, ${t.rooms} rooms)`));
    h('Fee arrears');
    const f = fees().filter(x => x.pending > 0);
    f.forEach(x => d.text(`${x.name} (room ${x.room}): Rs ${x.pending} pending`));
    if (!f.length) d.text('No pending fees');
    h('Six month forecast');
    forecast().forEach(m => d.text(`${m.month}: ${m.occupied}/${m.beds} beds (${m.pct}%), revenue Rs ${m.revenue}, vacant-bed loss Rs ${m.loss}`));
    d.end();
  });
};
