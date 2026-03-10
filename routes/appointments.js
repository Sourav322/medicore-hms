const express = require('express');
const router = express.Router();
const { hospitalCollection, generateToken } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.get('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { date, doctorId, status } = req.query;

    let query = hospitalCollection(hospitalId, 'appointments').orderBy('createdAt', 'desc');
    const snapshot = await query.limit(100).get();
    let appointments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    if (date) appointments = appointments.filter(a => a.date === date);
    if (doctorId) appointments = appointments.filter(a => a.doctorId === doctorId);
    if (status) appointments = appointments.filter(a => a.status === status);

    res.json({ appointments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { patientId, doctorId, date, time, type = 'scheduled', notes } = req.body;

    if (!patientId || !doctorId || !date) {
      return res.status(400).json({ error: 'Patient, doctor and date required' });
    }

    // Get patient and doctor info
    const [patientDoc, doctorDoc] = await Promise.all([
      hospitalCollection(hospitalId, 'patients').doc(patientId).get(),
      hospitalCollection(hospitalId, 'doctors').doc(doctorId).get()
    ]);

    if (!patientDoc.exists) return res.status(404).json({ error: 'Patient not found' });
    if (!doctorDoc.exists) return res.status(404).json({ error: 'Doctor not found' });

    // Get token number for the day
    const existingSnap = await hospitalCollection(hospitalId, 'appointments')
      .where('doctorId', '==', doctorId)
      .where('date', '==', date).get();

    const tokenNumber = existingSnap.size + 1;

    const id = uuidv4();
    const patient = patientDoc.data();
    const doctor = doctorDoc.data();

    const appointment = {
      id, patientId, doctorId, date, time: time || '',
      type, notes: notes || '',
      tokenNumber, status: 'scheduled',
      patientName: patient.name, patientPhone: patient.phone, patientUHID: patient.uhid,
      doctorName: doctor.name, doctorSpecialization: doctor.specialization,
      consultationFee: doctor.consultationFee,
      hospitalId,
      createdAt: new Date().toISOString(),
      createdBy: req.user.uid
    };

    await hospitalCollection(hospitalId, 'appointments').doc(id).set(appointment);
    res.status(201).json({ appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    delete updates.id;
    await hospitalCollection(hospitalId, 'appointments').doc(req.params.id).update(updates);
    res.json({ message: 'Appointment updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    await hospitalCollection(hospitalId, 'appointments').doc(req.params.id).update({
      status: 'cancelled', cancelledAt: new Date().toISOString()
    });
    res.json({ message: 'Appointment cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

