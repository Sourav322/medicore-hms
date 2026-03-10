const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/firebase');
const { generateToken, authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// POST /api/auth/register-hospital - Register new hospital + admin
router.post('/register-hospital', async (req, res) => {
  try {
    const { hospitalName, adminName, email, password, phone, address, plan = 'starter' } = req.body;

    if (!hospitalName || !adminName || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const db = getDb();

    // Check email uniqueness
    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hospitalId = uuidv4();
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create hospital record
    await db.collection('hospitals').doc(hospitalId).set({
      id: hospitalId,
      name: hospitalName,
      address: address || '',
      phone: phone || '',
      plan,
      status: 'active',
      createdAt: new Date().toISOString(),
      adminId: userId,
      settings: {
        currency: 'INR',
        gstEnabled: true,
        gstRate: 18,
        timezone: 'Asia/Kolkata'
      }
    });

    // Create admin user
    await db.collection('users').doc(userId).set({
      id: userId,
      uid: userId,
      name: adminName,
      email,
      password: hashedPassword,
      role: 'hospital_admin',
      hospitalId,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    const token = generateToken({ uid: userId, email });

    res.status(201).json({
      message: 'Hospital registered successfully',
      token,
      user: { id: userId, name: adminName, email, role: 'hospital_admin', hospitalId },
      hospital: { id: hospitalId, name: hospitalName, plan }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed', message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const db = getDb();
    const usersSnap = await db.collection('users').where('email', '==', email).get();

    if (usersSnap.empty) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userDoc = usersSnap.docs[0];
    const user = userDoc.data();

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    // Get hospital info if applicable
    let hospital = null;
    if (user.hospitalId) {
      const hospDoc = await db.collection('hospitals').doc(user.hospitalId).get();
      if (hospDoc.exists) hospital = hospDoc.data();
    }

    const token = generateToken({ uid: user.id, email: user.email });

    // Update last login
    await db.collection('users').doc(user.id).update({ lastLogin: new Date().toISOString() });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId
      },
      hospital
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed', message: err.message });
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

    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, hospitalId: user.hospitalId },
      hospital
    });
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

module.exports = router;
