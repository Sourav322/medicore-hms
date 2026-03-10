const express = require('express');
const router = express.Router();
const { hospitalCollection } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const ROLES = ['receptionist', 'nurse', 'lab_technician', 'doctor', 'hospital_admin'];

router.get('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { role, status } = req.query;
    const snapshot = await hospitalCollection(hospitalId, 'staff').orderBy('name').get();
    let staff = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (role) staff = staff.filter(s => s.role === role);
    if (status) staff = staff.filter(s => s.status === status);
    res.json({ staff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { name, email, phone, role, department, password, salary, joiningDate } = req.body;

    if (!name || !email || !role || !password) {
      return res.status(400).json({ error: 'Name, email, role and password required' });
    }
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    // Check email uniqueness
    const { getDb } = require('../config/firebase');
    const db = getDb();
    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) return res.status(400).json({ error: 'Email already registered' });

    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user account
    await db.collection('users').doc(id).set({
      id, uid: id, name, email, password: hashedPassword,
      role, hospitalId, status: 'active',
      createdAt: new Date().toISOString()
    });

    // Create staff profile
    const staffProfile = {
      id, name, email, phone: phone || '', role,
      department: department || '', salary: parseFloat(salary) || 0,
      joiningDate: joiningDate || new Date().toISOString().split('T')[0],
      status: 'active', hospitalId,
      attendance: [],
      createdAt: new Date().toISOString()
    };

    await hospitalCollection(hospitalId, 'staff').doc(id).set(staffProfile);
    res.status(201).json({ staff: staffProfile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const doc = await hospitalCollection(hospitalId, 'staff').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Staff not found' });
    res.json({ staff: { id: doc.id, ...doc.data() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    delete updates.password; // Don't update password here
    await hospitalCollection(hospitalId, 'staff').doc(req.params.id).update(updates);
    res.json({ message: 'Staff updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST attendance mark
router.post('/:id/attendance', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { type, date } = req.body; // type: 'in' | 'out'
    const doc = await hospitalCollection(hospitalId, 'staff').doc(req.params.id).get();
    const staff = doc.data();
    const attendance = staff.attendance || [];
    attendance.push({ type, date: date || new Date().toISOString(), markedBy: req.user.uid });
    await hospitalCollection(hospitalId, 'staff').doc(req.params.id).update({ attendance });
    res.json({ message: 'Attendance marked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

