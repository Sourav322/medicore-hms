const express = require('express');
const router = express.Router();
const { hospitalCollection } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const LAB_TESTS = [
  { name: 'Complete Blood Count (CBC)', category: 'Blood Test', price: 250 },
  { name: 'Blood Glucose Fasting', category: 'Blood Test', price: 80 },
  { name: 'Lipid Profile', category: 'Blood Test', price: 400 },
  { name: 'Liver Function Test', category: 'Blood Test', price: 600 },
  { name: 'Kidney Function Test', category: 'Blood Test', price: 500 },
  { name: 'Thyroid Function Test', category: 'Blood Test', price: 800 },
  { name: 'Urine Routine', category: 'Urine Test', price: 100 },
  { name: 'Chest X-Ray', category: 'X-Ray', price: 300 },
  { name: 'MRI Brain', category: 'MRI', price: 5000 },
  { name: 'MRI Spine', category: 'MRI', price: 6000 },
  { name: 'CT Scan Abdomen', category: 'CT Scan', price: 4000 },
  { name: 'ECG', category: 'ECG', price: 150 },
  { name: 'Echocardiogram', category: 'Echo', price: 1500 },
  { name: 'Ultrasound Abdomen', category: 'Ultrasound', price: 800 },
];

router.get('/tests-catalog', authenticate, (req, res) => {
  res.json({ tests: LAB_TESTS });
});

router.get('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { status, patientId, date } = req.query;
    const snapshot = await hospitalCollection(hospitalId, 'lab_tests')
      .orderBy('createdAt', 'desc').limit(100).get();

    let tests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (status) tests = tests.filter(t => t.status === status);
    if (patientId) tests = tests.filter(t => t.patientId === patientId);
    if (date) tests = tests.filter(t => t.createdAt?.startsWith(date));

    res.json({ tests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { patientId, tests, referredBy, urgent = false, notes } = req.body;

    if (!patientId || !tests?.length) return res.status(400).json({ error: 'Patient and tests required' });

    const patientDoc = await hospitalCollection(hospitalId, 'patients').doc(patientId).get();
    if (!patientDoc.exists) return res.status(404).json({ error: 'Patient not found' });

    const patient = patientDoc.data();
    const id = uuidv4();

    const totalAmount = tests.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);

    const labOrder = {
      id, patientId, tests, referredBy: referredBy || '',
      urgent, notes: notes || '',
      patientName: patient.name, patientUHID: patient.uhid,
      totalAmount, status: 'pending',
      hospitalId,
      createdAt: new Date().toISOString(),
      createdBy: req.user.uid
    };

    await hospitalCollection(hospitalId, 'lab_tests').doc(id).set(labOrder);
    res.status(201).json({ labOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const doc = await hospitalCollection(hospitalId, 'lab_tests').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Lab order not found' });
    res.json({ labOrder: { id: doc.id, ...doc.data() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - update test results/status
router.put('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    await hospitalCollection(hospitalId, 'lab_tests').doc(req.params.id).update(updates);
    res.json({ message: 'Lab order updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - upload report
router.post('/:id/report', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { results, remarks } = req.body;

    await hospitalCollection(hospitalId, 'lab_tests').doc(req.params.id).update({
      results: results || {},
      remarks: remarks || '',
      status: 'completed',
      completedAt: new Date().toISOString(),
      completedBy: req.user.name
    });

    res.json({ message: 'Report uploaded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

