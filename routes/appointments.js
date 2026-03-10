const express = require('express');
const router = express.Router();
const { hospitalCollection } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// GET /api/appointments
router.get('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { date, status, limit = 50 } = req.query;

    let query = hospitalCollection(hospitalId, 'appointments').orderBy('createdAt', 'desc').limit(parseInt(limit));
    const snapshot = await query.get();
    let appointments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    if (date) appointments = appointments.filter(a => a.date === date);
    if (status) appointments = appointments.filter(a => a.status === status);

    res.json({ appointments, total: appointments.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/appointments - Accept name-based booking
router.post('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const {
      patientId, patientName, doctorId, doctorName,
      date, time, type = 'scheduled', notes
    } = req.body;

    if ((!patientId && !patientName) || (!doctorId && !doctorName) || !date) {
      return res.status(400).json({ error: 'Patient, doctor and date required' });
    }

    let pName = patientName, dName = doctorName;
    let pPhone = '', pUHID = '', dSpec = '', dFee = 0;

    // Try to get from DB if IDs provided
    if (patientId) {
      try {
        const pd = await hospitalCollection(hospitalId, 'patients').doc(patientId).get();
        if (pd.exists) { const p = pd.data(); pName = p.name; pPhone = p.phone; pUHID = p.uhid; }
      } catch(e) {}
    }
    if (doctorId) {
      try {
        const dd = await hospitalCollection(hospitalId, 'doctors').doc(doctorId).get();
        if (dd.exists) { const d = dd.data(); dName = d.name; dSpec = d.specialization; dFee = d.consultationFee; }
      } catch(e) {}
    }

    // Token number for day
    let tokenNumber = 1;
    try {
      const snap = await hospitalCollection(hospitalId, 'appointments').where('date', '==', date).get();
      tokenNumber = snap.size + 1;
    } catch(e) {}

    const id = uuidv4();
    const appointment = {
      id, date, time: time || '',
      patientId: patientId || null, patientName: pName, patientPhone: pPhone, patientUHID: pUHID,
      doctorId: doctorId || null, doctorName: dName, doctorSpecialization: dSpec, consultationFee: dFee,
      type, notes: notes || '',
      tokenNumber, status: 'scheduled',
      hospitalId,
      createdAt: new Date().toISOString(),
      createdBy: req.user.uid
    };

    await hospitalCollection(hospitalId, 'appointments').doc(id).set(appointment);
    res.status(201).json({ appointment, message: 'Appointment booked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/appointments/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const doc = await hospitalCollection(hospitalId, 'appointments').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Appointment not found' });
    await hospitalCollection(hospitalId, 'appointments').doc(req.params.id).update({
      ...req.body, updatedAt: new Date().toISOString()
    });
    res.json({ message: 'Appointment updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/appointments/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    await hospitalCollection(hospitalId, 'appointments').doc(req.params.id).delete();
    res.json({ message: 'Appointment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
