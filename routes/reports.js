const express = require('express');
const router = express.Router();
const { hospitalCollection } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');

router.get('/patients', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { from, to } = req.query;
    const snapshot = await hospitalCollection(hospitalId, 'patients')
      .orderBy('createdAt', 'desc').limit(500).get();
    let patients = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (from) patients = patients.filter(p => p.createdAt >= from);
    if (to) patients = patients.filter(p => p.createdAt <= to + 'T23:59:59');
    res.json({ patients, total: patients.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/billing-summary', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { from, to } = req.query;
    const snapshot = await hospitalCollection(hospitalId, 'bills')
      .orderBy('createdAt', 'desc').limit(500).get();
    let bills = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (from) bills = bills.filter(b => b.createdAt >= from);
    if (to) bills = bills.filter(b => b.createdAt <= to + 'T23:59:59');

    const summary = {
      totalBills: bills.length,
      totalRevenue: bills.reduce((s, b) => s + (b.totalAmount || 0), 0),
      byType: {},
      byPaymentMethod: {}
    };

    bills.forEach(b => {
      summary.byType[b.billType] = (summary.byType[b.billType] || 0) + (b.totalAmount || 0);
      summary.byPaymentMethod[b.paymentMethod] = (summary.byPaymentMethod[b.paymentMethod] || 0) + (b.totalAmount || 0);
    });

    res.json({ bills, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/doctor-revenue', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const snapshot = await hospitalCollection(hospitalId, 'bills')
      .orderBy('createdAt', 'desc').limit(500).get();

    const doctorRevenue = {};
    snapshot.docs.forEach(d => {
      const bill = d.data();
      if (bill.doctorName) {
        doctorRevenue[bill.doctorName] = (doctorRevenue[bill.doctorName] || 0) + (bill.totalAmount || 0);
      }
    });

    res.json({ doctorRevenue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/lab-tests', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const snapshot = await hospitalCollection(hospitalId, 'lab_tests')
      .orderBy('createdAt', 'desc').limit(500).get();
    const tests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const summary = {
      total: tests.length,
      pending: tests.filter(t => t.status === 'pending').length,
      completed: tests.filter(t => t.status === 'completed').length,
    };

    res.json({ tests, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

