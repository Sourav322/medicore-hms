const express = require('express');
const router = express.Router();
const { hospitalCollection } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.get('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { department, status } = req.query;

    let query = hospitalCollection(hospitalId, 'doctors').orderBy('name');

    const snapshot = await query.get();
    let doctors = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    if (department) doctors = doctors.filter(d => d.department === department);
    if (status) doctors = doctors.filter(d => d.status === status);

    res.json({ doctors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const {
      name, specialization, department, availableDays,
      consultationFee, contactNumber, email, qualification, experience
    } = req.body;

    if (!name || !specialization) return res.status(400).json({ error: 'Name and specialization required' });

    const id = uuidv4();
    const doctor = {
      id, name, specialization, department: department || '',
      availableDays: availableDays || [], consultationFee: parseFloat(consultationFee) || 0,
      contactNumber: contactNumber || '', email: email || '',
      qualification: qualification || '', experience: experience || '',
      hospitalId, status: 'active',
      createdAt: new Date().toISOString()
    };

    await hospitalCollection(hospitalId, 'doctors').doc(id).set(doctor);
    res.status(201).json({ doctor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const doc = await hospitalCollection(hospitalId, 'doctors').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Doctor not found' });

    // Get today's appointments count
    const today = new Date().toISOString().split('T')[0];
    const apptSnap = await hospitalCollection(hospitalId, 'appointments')
      .where('doctorId', '==', req.params.id)
      .where('date', '==', today).get();

    res.json({ doctor: { id: doc.id, ...doc.data() }, todayAppointments: apptSnap.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    delete updates.id; delete updates.hospitalId;
    await hospitalCollection(hospitalId, 'doctors').doc(req.params.id).update(updates);
    res.json({ message: 'Doctor updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    await hospitalCollection(hospitalId, 'doctors').doc(req.params.id).update({
      status: 'inactive', deletedAt: new Date().toISOString()
    });
    res.json({ message: 'Doctor deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/doctors/:id/schedule - Get doctor schedule
router.get('/:id/schedule', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { date } = req.query;

    const apptSnap = await hospitalCollection(hospitalId, 'appointments')
      .where('doctorId', '==', req.params.id)
      .where('date', '==', date || new Date().toISOString().split('T')[0])
      .orderBy('time').get();

    const slots = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

