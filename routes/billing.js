const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { hospitalCollection, getDb } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');

// POST /api/billing - Create bill (simplified - no patientId required)
router.post('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const {
      patientName, patientId, billType, type,
      amount, items, discount = 0,
      paymentMethod, paymentMode = 'cash',
      notes, status = 'paid'
    } = req.body;

    const pName = patientName || 'Walk-in Patient';
    const bType = billType || type || 'OPD';
    const totalAmount = amount || (items ? items.reduce((s, i) => s + (i.amount||0), 0) : 0);

    if (!totalAmount) return res.status(400).json({ error: 'Amount is required' });

    // Generate bill number
    let billCount = 1;
    try {
      const snap = await hospitalCollection(hospitalId, 'bills').count().get();
      billCount = (snap.data().count || 0) + 1;
    } catch(e) {}

    const billNumber = `BILL-${new Date().getFullYear()}-${String(billCount).padStart(5, '0')}`;
    const id = uuidv4();

    const bill = {
      id, billNumber,
      patientName: pName,
      patientId: patientId || null,
      billType: bType, type: bType,
      items: items || [{ description: bType + ' Charges', amount: totalAmount }],
      amount: totalAmount, totalAmount,
      discount, paymentMethod: paymentMethod || paymentMode,
      paymentMode: paymentMethod || paymentMode,
      notes: notes || '',
      status,
      hospitalId,
      createdAt: new Date().toISOString(),
      createdBy: req.user.uid
    };

    await hospitalCollection(hospitalId, 'bills').doc(id).set(bill);
    res.status(201).json({ bill, message: 'Bill created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing - List bills
router.get('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { limit = 50, status } = req.query;

    let query = hospitalCollection(hospitalId, 'bills').orderBy('createdAt', 'desc').limit(parseInt(limit));
    if (status) query = query.where('status', '==', status);

    const snap = await query.get();
    const bills = snap.docs.map(d => d.data());

    const totalRevenue = bills.filter(b => b.status === 'paid').reduce((s, b) => s + (b.totalAmount || b.amount || 0), 0);

    res.json({ bills, total: bills.length, totalRevenue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const doc = await hospitalCollection(hospitalId, 'bills').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Bill not found' });
    res.json({ bill: doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/billing/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const doc = await hospitalCollection(hospitalId, 'bills').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Bill not found' });
    await hospitalCollection(hospitalId, 'bills').doc(req.params.id).update({ ...req.body, updatedAt: new Date().toISOString() });
    res.json({ message: 'Bill updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
