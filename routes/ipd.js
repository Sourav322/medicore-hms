const express = require('express');
const router = express.Router();
const { hospitalCollection } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.get('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { status } = req.query;
    const snapshot = await hospitalCollection(hospitalId, 'ipd_admissions')
      .orderBy('admissionDate', 'desc').limit(100).get();

    let admissions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (status) admissions = admissions.filter(a => a.status === status);

    res.json({ admissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET available beds
router.get('/beds', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const snapshot = await hospitalCollection(hospitalId, 'beds').get();
    let beds = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ beds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { patientId, doctorId, ward, bedNumber, diagnosis, notes } = req.body;

    if (!patientId || !ward || !bedNumber) {
      return res.status(400).json({ error: 'Patient, ward and bed required' });
    }

    // Check bed availability
    const existingSnap = await hospitalCollection(hospitalId, 'ipd_admissions')
      .where('ward', '==', ward)
      .where('bedNumber', '==', bedNumber)
      .where('status', '==', 'admitted').get();

    if (!existingSnap.empty) {
      return res.status(400).json({ error: 'Bed already occupied' });
    }

    const [patientDoc, doctorDoc] = await Promise.all([
      hospitalCollection(hospitalId, 'patients').doc(patientId).get(),
      doctorId ? hospitalCollection(hospitalId, 'doctors').doc(doctorId).get() : Promise.resolve(null)
    ]);

    const id = uuidv4();
    const patient = patientDoc.data();
    const doctor = doctorDoc?.data();

    const admission = {
      id, patientId, doctorId: doctorId || null, ward, bedNumber,
      diagnosis: diagnosis || '', notes: notes || '',
      patientName: patient?.name || '', patientUHID: patient?.uhid || '',
      doctorName: doctor?.name || '',
      admissionDate: new Date().toISOString(),
      status: 'admitted',
      nurseNotes: [], dailyCharges: [],
      hospitalId,
      createdAt: new Date().toISOString()
    };

    await hospitalCollection(hospitalId, 'ipd_admissions').doc(id).set(admission);
    res.status(201).json({ admission });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const doc = await hospitalCollection(hospitalId, 'ipd_admissions').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Admission not found' });
    res.json({ admission: { id: doc.id, ...doc.data() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    await hospitalCollection(hospitalId, 'ipd_admissions').doc(req.params.id).update(updates);
    res.json({ message: 'Admission updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ipd/:id/discharge
router.post('/:id/discharge', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { dischargeSummary, finalDiagnosis, instructions } = req.body;

    await hospitalCollection(hospitalId, 'ipd_admissions').doc(req.params.id).update({
      status: 'discharged',
      dischargeDate: new Date().toISOString(),
      dischargeSummary: dischargeSummary || '',
      finalDiagnosis: finalDiagnosis || '',
      instructions: instructions || '',
      updatedAt: new Date().toISOString()
    });

    res.json({ message: 'Patient discharged successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ipd/:id/nurse-note
router.post('/:id/nurse-note', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { note } = req.body;

    const doc = await hospitalCollection(hospitalId, 'ipd_admissions').doc(req.params.id).get();
    const admission = doc.data();
    const nurseNotes = admission.nurseNotes || [];

    nurseNotes.push({
      note, nurseName: req.user.name, timestamp: new Date().toISOString()
    });

    await hospitalCollection(hospitalId, 'ipd_admissions').doc(req.params.id).update({ nurseNotes });
    res.json({ message: 'Note added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

