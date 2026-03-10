const express = require('express');
const router = express.Router();
const { hospitalCollection, getDb } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.get('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { date, status, patientId } = req.query;
    const snapshot = await hospitalCollection(hospitalId, 'bills')
      .orderBy('createdAt', 'desc').limit(100).get();

    let bills = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (date) bills = bills.filter(b => b.createdAt?.startsWith(date));
    if (status) bills = bills.filter(b => b.status === status);
    if (patientId) bills = bills.filter(b => b.patientId === patientId);

    res.json({ bills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const {
      patientId, billType, items, discount = 0,
      paymentMethod = 'cash', gstEnabled = true, gstRate = 18,
      insuranceDetails, notes
    } = req.body;

    if (!patientId || !items?.length) return res.status(400).json({ error: 'Patient and items required' });

    const patientDoc = await hospitalCollection(hospitalId, 'patients').doc(patientId).get();
    if (!patientDoc.exists) return res.status(404).json({ error: 'Patient not found' });

    const patient = patientDoc.data();
    const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const discountAmount = (subtotal * discount) / 100;
    const taxableAmount = subtotal - discountAmount;
    const gstAmount = gstEnabled ? (taxableAmount * gstRate) / 100 : 0;
    const totalAmount = taxableAmount + gstAmount;

    // Generate bill number
    const billsCount = await hospitalCollection(hospitalId, 'bills').count().get();
    const billNumber = `BILL-${new Date().getFullYear()}-${String(billsCount.data().count + 1).padStart(5, '0')}`;

    const id = uuidv4();
    const bill = {
      id, billNumber, patientId,
      patientName: patient.name, patientUHID: patient.uhid, patientPhone: patient.phone,
      billType: billType || 'OPD',
      items, subtotal, discount, discountAmount,
      gstEnabled, gstRate, gstAmount,
      totalAmount, paymentMethod,
      insuranceDetails: insuranceDetails || null,
      notes: notes || '',
      status: 'paid',
      hospitalId,
      createdAt: new Date().toISOString(),
      createdBy: req.user.uid
    };

    await hospitalCollection(hospitalId, 'bills').doc(id).set(bill);
    res.status(201).json({ bill });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const doc = await hospitalCollection(hospitalId, 'bills').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Bill not found' });

    // Get hospital info for bill header
    const hospDoc = await getDb().collection('hospitals').doc(hospitalId).get();

    res.json({
      bill: { id: doc.id, ...doc.data() },
      hospital: hospDoc.data()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    await hospitalCollection(hospitalId, 'bills').doc(req.params.id).update(updates);
    res.json({ message: 'Bill updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

