const express = require('express');
const router = express.Router();
const { hospitalCollection, generateUHID } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

// GET /api/patients - List patients
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, limit = 50, page = 1 } = req.query;
    const hospitalId = req.user.hospitalId;

    let query = hospitalCollection(hospitalId, 'patients').orderBy('createdAt', 'desc');

    const snapshot = await query.limit(parseInt(limit)).get();
    let patients = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Client-side search filter
    if (search) {
      const s = search.toLowerCase();
      patients = patients.filter(p =>
        p.name?.toLowerCase().includes(s) ||
        p.phone?.includes(s) ||
        p.uhid?.toLowerCase().includes(s)
      );
    }

    res.json({ patients, total: patients.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/patients - Add patient
router.post('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const {
      name, age, gender, phone, address, bloodGroup,
      allergyNotes, email, emergencyContact, emergencyPhone
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone required' });
    }

    const id = uuidv4();
    const uhid = generateUHID(hospitalId);

    // Generate QR code
    const qrData = JSON.stringify({ uhid, name, phone, hospitalId });
    const qrCode = await QRCode.toDataURL(qrData);

    const patient = {
      id, uhid, name, age: parseInt(age) || 0, gender, phone,
      address: address || '', bloodGroup: bloodGroup || '',
      allergyNotes: allergyNotes || '', email: email || '',
      emergencyContact: emergencyContact || '',
      emergencyPhone: emergencyPhone || '',
      qrCode, hospitalId,
      status: 'active',
      createdAt: new Date().toISOString(),
      createdBy: req.user.uid
    };

    await hospitalCollection(hospitalId, 'patients').doc(id).set(patient);

    res.status(201).json({ patient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patients/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const doc = await hospitalCollection(hospitalId, 'patients').doc(req.params.id).get();

    if (!doc.exists) return res.status(404).json({ error: 'Patient not found' });

    // Get medical history
    const historySnap = await hospitalCollection(hospitalId, 'opd_records')
      .where('patientId', '==', req.params.id)
      .orderBy('createdAt', 'desc').limit(20).get();

    const history = historySnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Get appointments
    const apptSnap = await hospitalCollection(hospitalId, 'appointments')
      .where('patientId', '==', req.params.id)
      .orderBy('createdAt', 'desc').limit(10).get();

    const appointments = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    res.json({ patient: { id: doc.id, ...doc.data() }, history, appointments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/patients/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    delete updates.id; delete updates.uhid; delete updates.hospitalId;

    await hospitalCollection(hospitalId, 'patients').doc(req.params.id).update(updates);
    res.json({ message: 'Patient updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/patients/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    await hospitalCollection(hospitalId, 'patients').doc(req.params.id).update({
      status: 'inactive', deletedAt: new Date().toISOString()
    });
    res.json({ message: 'Patient deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

