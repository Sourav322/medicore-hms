const express = require('express');
const router = express.Router();
const { hospitalCollection } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.get('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { date, patientId, doctorId } = req.query;

    const snapshot = await hospitalCollection(hospitalId, 'opd_records')
      .orderBy('createdAt', 'desc').limit(100).get();

    let records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (date) records = records.filter(r => r.visitDate === date);
    if (patientId) records = records.filter(r => r.patientId === patientId);
    if (doctorId) records = records.filter(r => r.doctorId === doctorId);

    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const {
      patientId, doctorId, appointmentId,
      symptoms, diagnosis, prescription,
      labTests, nextVisitDate, notes, vitals
    } = req.body;

    if (!patientId || !doctorId) return res.status(400).json({ error: 'Patient and doctor required' });

    const [patientDoc, doctorDoc] = await Promise.all([
      hospitalCollection(hospitalId, 'patients').doc(patientId).get(),
      hospitalCollection(hospitalId, 'doctors').doc(doctorId).get()
    ]);

    const id = uuidv4();
    const patient = patientDoc.data();
    const doctor = doctorDoc.data();

    const record = {
      id, patientId, doctorId, appointmentId: appointmentId || null,
      symptoms: symptoms || '', diagnosis: diagnosis || '',
      prescription: prescription || [], labTests: labTests || [],
      nextVisitDate: nextVisitDate || '', notes: notes || '',
      vitals: vitals || { bp: '', pulse: '', temp: '', weight: '', height: '' },
      patientName: patient?.name || '', patientUHID: patient?.uhid || '',
      doctorName: doctor?.name || '',
      visitDate: new Date().toISOString().split('T')[0],
      hospitalId, status: 'completed',
      createdAt: new Date().toISOString(),
      createdBy: req.user.uid
    };

    await hospitalCollection(hospitalId, 'opd_records').doc(id).set(record);

    // Update appointment status if linked
    if (appointmentId) {
      await hospitalCollection(hospitalId, 'appointments').doc(appointmentId).update({
        status: 'completed', opdRecordId: id
      });
    }

    res.status(201).json({ record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const doc = await hospitalCollection(hospitalId, 'opd_records').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Record not found' });
    res.json({ record: { id: doc.id, ...doc.data() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    await hospitalCollection(hospitalId, 'opd_records').doc(req.params.id).update(updates);
    res.json({ message: 'Record updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

