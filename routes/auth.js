const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/firebase');
const { generateToken, authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// POST /api/auth/register-hospital
router.post('/register-hospital', async (req, res) => {
  try {
    const { hospitalName, adminName, email, password, phone, address, emergencyPhone, plan = 'starter' } = req.body;
    if (!hospitalName || !adminName || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    const db = getDb();
    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) return res.status(400).json({ error: 'Email already registered' });

    const hospitalId = uuidv4();
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);

    await db.collection('hospitals').doc(hospitalId).set({
      id: hospitalId, name: hospitalName, address: address || '',
      phone: phone || '', emergencyPhone: emergencyPhone || '1066',
      plan, status: 'active', createdAt: new Date().toISOString(), adminId: userId,
      settings: { currency: 'INR', gstEnabled: true, gstRate: 18, timezone: 'Asia/Kolkata' }
    });

    await db.collection('users').doc(userId).set({
      id: userId, uid: userId, name: adminName, email,
      password: hashedPassword, role: 'hospital_admin',
      hospitalId, status: 'active', createdAt: new Date().toISOString()
    });

    const token = generateToken({ uid: userId, email });
    res.status(201).json({
      message: 'Hospital registered successfully', token,
      user: { id: userId, name: adminName, email, role: 'hospital_admin', hospitalId },
      hospital: { id: hospitalId, name: hospitalName, address: address||'', phone: phone||'', emergencyPhone: emergencyPhone||'1066', plan }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', message: err.message });
  }
});

// POST /api/auth/staff-register — Staff self register, status = pending
router.post('/staff-register', async (req, res) => {
  try {
    const { name, email, password, role, phone, hospitalCode, department, qualification } = req.body;
    if (!name || !email || !password || !role || !hospitalCode) {
      return res.status(400).json({ error: 'Name, email, password, role and hospital code required' });
    }
    const allowedRoles = ['doctor','receptionist','lab_technician','billing_staff','nurse','pharmacist'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const db = getDb();

    // Verify hospital code exists
    const hospSnap = await db.collection('hospitals').where('hospitalCode', '==', hospitalCode.toUpperCase()).get();
    if (hospSnap.empty) {
      return res.status(404).json({ error: 'Hospital code not found. Contact your hospital admin.' });
    }
    const hospital = hospSnap.docs[0].data();

    // Check email uniqueness
    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) return res.status(400).json({ error: 'Email already registered' });

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);

    await db.collection('users').doc(userId).set({
      id: userId, uid: userId, name, email,
      password: hashedPassword, role,
      hospitalId: hospital.id,
      phone: phone || '', department: department || '',
      qualification: qualification || '',
      status: 'pending',  // ← PENDING until admin approves
      createdAt: new Date().toISOString(),
      requestedAt: new Date().toISOString()
    });

    res.status(201).json({
      message: 'Registration request submitted! Waiting for admin approval.',
      status: 'pending'
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const db = getDb();
    const usersSnap = await db.collection('users').where('email', '==', email).get();
    if (usersSnap.empty) return res.status(401).json({ error: 'Invalid credentials' });

    const user = usersSnap.docs[0].data();
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Your account is pending admin approval. Please wait.' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Your registration was rejected. Contact hospital admin.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is inactive. Contact admin.' });
    }

    let hospital = null;
    if (user.hospitalId) {
      const hospDoc = await db.collection('hospitals').doc(user.hospitalId).get();
      if (hospDoc.exists) hospital = hospDoc.data();
    }

    const token = generateToken({ uid: user.id, email: user.email });
    await db.collection('users').doc(user.id).update({ lastLogin: new Date().toISOString() });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, hospitalId: user.hospitalId, department: user.department || '' },
      hospital
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', message: err.message });
  }
});

// GET /api/auth/pending-staff?hospitalId=xxx  — Admin sees pending requests
router.get('/pending-staff', authenticate, async (req, res) => {
  try {
    const { hospitalId } = req.query;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId required' });
    const db = getDb();
    const snap = await db.collection('users')
      .where('hospitalId', '==', hospitalId)
      .where('status', '==', 'pending')
      .get();
    const staff = snap.docs.map(d => {
      const u = d.data();
      return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone||'', department: u.department||'', qualification: u.qualification||'', requestedAt: u.requestedAt||u.createdAt };
    });
    res.json({ staff, total: staff.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/all-staff?hospitalId=xxx  — Admin sees all staff
router.get('/all-staff', authenticate, async (req, res) => {
  try {
    const { hospitalId } = req.query;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId required' });
    const db = getDb();
    const snap = await db.collection('users')
      .where('hospitalId', '==', hospitalId)
      .get();
    const staff = snap.docs.map(d => {
      const u = d.data();
      return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone||'', department: u.department||'', status: u.status, createdAt: u.createdAt, lastLogin: u.lastLogin||'' };
    }).filter(u => u.role !== 'hospital_admin');
    res.json({ staff, total: staff.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/approve-staff/:userId  — Admin approve/reject
router.put('/approve-staff/:userId', authenticate, async (req, res) => {
  try {
    const { action } = req.body; // 'approve' or 'reject'
    if (!['approve','reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });
    const db = getDb();
    const newStatus = action === 'approve' ? 'active' : 'rejected';
    await db.collection('users').doc(req.params.userId).update({ status: newStatus, reviewedAt: new Date().toISOString() });
    res.json({ message: `Staff ${action}d successfully`, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/toggle-staff/:userId  — Admin activate/deactivate
router.put('/toggle-staff/:userId', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('users').doc(req.params.userId).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });
    const cur = doc.data().status;
    const newStatus = cur === 'active' ? 'inactive' : 'active';
    await db.collection('users').doc(req.params.userId).update({ status: newStatus });
    res.json({ message: 'Status updated', status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/staff/:userId
router.delete('/staff/:userId', authenticate, async (req, res) => {
  try {
    const db = getDb();
    await db.collection('users').doc(req.params.userId).delete();
    res.json({ message: 'Staff removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const user = userDoc.data();
    let hospital = null;
    if (user.hospitalId) {
      const hospDoc = await db.collection('hospitals').doc(user.hospitalId).get();
      if (hospDoc.exists) hospital = hospDoc.data();
    }
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, hospitalId: user.hospitalId, department: user.department||'' }, hospital });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const db = getDb();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const user = userDoc.data();
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ error: 'Current password incorrect' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await db.collection('users').doc(req.user.uid).update({ password: hashed });
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/generate-hospital-code — Admin generates unique join code
router.post('/generate-hospital-code', authenticate, async (req, res) => {
  try {
    const { hospitalId } = req.body;
    const db = getDb();
    // Generate 6-char alphanumeric code
    const code = Math.random().toString(36).substring(2,8).toUpperCase();
    await db.collection('hospitals').doc(hospitalId).update({ hospitalCode: code });
    res.json({ hospitalCode: code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

