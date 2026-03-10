const express = require('express');
const router = express.Router();
const { hospitalCollection, generateUHID } = require('../config/firebase');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

// GET /api/patients
router.get('/', async (req, res) => {
  try {
    const hospitalId = "demo-hospital";
    const snapshot = await hospitalCollection(hospitalId, 'patients')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const patients = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    res.json({ patients, total: patients.length });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/patients
router.post('/', async (req, res) => {
  try {

    const hospitalId = "demo-hospital";

    const {
      name, age, gender, phone
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone required' });
    }

    const id = uuidv4();
    const uhid = generateUHID(hospitalId);

    const qrData = JSON.stringify({ uhid, name, phone, hospitalId });
    const qrCode = await QRCode.toDataURL(qrData);

    const patient = {
      id,
      uhid,
      name,
      age: parseInt(age) || 0,
      gender,
      phone,
      hospitalId,
      qrCode,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    await hospitalCollection(hospitalId, 'patients').doc(id).set(patient);

    res.status(201).json({ patient });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET patient by id
router.get('/:id', async (req, res) => {
  try {

    const hospitalId = "demo-hospital";

    const doc = await hospitalCollection(hospitalId, 'patients')
      .doc(req.params.id)
      .get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json({ patient: { id: doc.id, ...doc.data() } });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE patient
router.put('/:id', async (req, res) => {
  try {

    const hospitalId = "demo-hospital";

    const updates = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    await hospitalCollection(hospitalId, 'patients')
      .doc(req.params.id)
      .update(updates);

    res.json({ message: 'Patient updated' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE patient
router.delete('/:id', async (req, res) => {
  try {

    const hospitalId = "demo-hospital";

    await hospitalCollection(hospitalId, 'patients')
      .doc(req.params.id)
      .update({
        status: 'inactive',
        deletedAt: new Date().toISOString()
      });

    res.json({ message: 'Patient deactivated' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
