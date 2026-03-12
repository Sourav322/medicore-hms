const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/firebase');
const { generateToken, authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════════════
// STEP 3: Create Account (status = pending_payment)
// ═══════════════════════════════════════════════
router.post('/create-account', async (req, res) => {
  try {
    const { name, email, phone, password, plan } = req.body;
    if (!name || !email || !password || !plan) {
      return res.status(400).json({ error: 'Name, email, password and plan required' });
    }
    const db = getDb();
    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) return res.status(400).json({ error: 'Email already registered' });

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);

    await db.collection('users').doc(userId).set({
      id: userId, name, email, phone: phone || '',
      password: hashedPassword, role: 'pending_admin',
      status: 'pending_payment', plan,
      createdAt: new Date().toISOString()
    });

    const token = generateToken({ uid: userId, email });
    res.status(201).json({
      message: 'Account created. Complete payment to continue.',
      userId, token,
      user: { id: userId, name, email, phone, plan, status: 'pending_payment' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// STEP 5: Hospital Registration (after payment)
// ═══════════════════════════════════════════════
router.post('/setup-hospital', authenticate, async (req, res) => {
  try {
    const { hospitalName, address, phone, logo } = req.body;
    if (!hospitalName) return res.status(400).json({ error: 'Hospital name required' });

    const db = getDb();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const user = userDoc.data();

    if (user.hospitalId) {
      return res.status(400).json({ error: 'Hospital already set up' });
    }

    const hospitalId = uuidv4();
    const plan = user.plan || 'basic';
    const planDays = { trial: 14, starter: 30, basic: 30, pro: 30, enterprise: 365 };
    const subEnd = new Date();
    subEnd.setDate(subEnd.getDate() + (planDays[plan] || 30));

    await db.collection('hospitals').doc(hospitalId).set({
      id: hospitalId,
      name: hospitalName,
      address: address || '',
      phone: phone || user.phone || '',
      logo: logo || '',
      plan,
      subscriptionStatus: plan === 'trial' ? 'trial' : 'active',
      subscriptionEnd: subEnd.toISOString(),
      trialEnd: plan === 'trial' ? subEnd.toISOString() : null,
      adminId: req.user.uid,
      adminEmail: user.email,
      setupComplete: false,
      createdAt: new Date().toISOString(),
      settings: { currency: 'INR', gstEnabled: true, gstRate: 18, timezone: 'Asia/Kolkata' }
    });

    // Update user to hospital_admin with hospitalId
    await db.collection('users').doc(req.user.uid).update({
      role: 'hospital_admin',
      hospitalId,
      status: 'active',
      updatedAt: new Date().toISOString()
    });

    const token = generateToken({ uid: req.user.uid, email: user.email });
    res.status(201).json({
      message: 'Hospital setup complete!',
      token,
      hospital: { id: hospitalId, name: hospitalName, plan, subscriptionStatus: plan === 'trial' ? 'trial' : 'active' },
      user: { id: req.user.uid, name: user.name, email: user.email, role: 'hospital_admin', hospitalId }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// OLD: register-hospital (keep for backward compat)
// ═══════════════════════════════════════════════
router.post('/register-hospital', async (req, res) => {
  try {
    const { hospitalName, adminName, email, password, phone, address, plan = 'trial', trialEnd, subscriptionStatus = 'trial' } = req.body;
    if (!hospitalName || !adminName || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    const db = getDb();
    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) return res.status(400).json({ error: 'Email already registered' });

    const hospitalId = uuidv4();
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);
    const trialEndDate = trialEnd || new Date(Date.now() + 14*24*60*60*1000).toISOString();

    await db.collection('hospitals').doc(hospitalId).set({
      id: hospitalId, name: hospitalName, address: address || '',
      phone: phone || '', plan, subscriptionStatus,
      trialEnd: trialEndDate, adminId: userId, adminEmail: email,
      setupComplete: false, createdAt: new Date().toISOString(),
      settings: { currency: 'INR', gstEnabled: true, gstRate: 18 }
    });

    await db.collection('users').doc(userId).set({
      id: userId, name: adminName, email,
      password: hashedPassword, role: 'hospital_admin',
      hospitalId, status: 'active', createdAt: new Date().toISOString()
    });

    const token = generateToken({ uid: userId, email });
    res.status(201).json({
      message: 'Hospital registered!', token,
      user: { id: userId, name: adminName, email, role: 'hospital_admin', hospitalId },
      hospital: { id: hospitalId, name: hospitalName, plan, subscriptionStatus, trialEnd: trialEndDate }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', message: err.message });
  }
});

// ═══════════════════════════════════════════════
// Staff Self Register
// ═══════════════════════════════════════════════
router.post('/staff-register', async (req, res) => {
  try {
    const { name, email, password, role, phone, hospitalCode, department, qualification } = req.body;
    if (!name || !email || !password || !role || !hospitalCode) {
      return res.status(400).json({ error: 'Name, email, password, role and hospital code required' });
    }
    const allowedRoles = ['doctor','receptionist','lab_technician','billing_staff','nurse','pharmacist'];
    if (!allowedRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const db = getDb();
    const hospSnap = await db.collection('hospitals').where('hospitalCode', '==', hospitalCode.toUpperCase()).get();
    if (hospSnap.empty) return res.status(404).json({ error: 'Hospital code not found. Contact your hospital admin.' });
    const hospital = hospSnap.docs[0].data();

    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) return res.status(400).json({ error: 'Email already registered' });

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);
    await db.collection('users').doc(userId).set({
      id: userId, name, email, password: hashedPassword, role,
      hospitalId: hospital.id, phone: phone||'', department: department||'',
      qualification: qualification||'', status: 'pending',
      createdAt: new Date().toISOString()
    });

    res.status(201).json({ message: 'Registration submitted! Waiting for admin approval.', status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// Admin: Add Staff directly
// ═══════════════════════════════════════════════
router.post('/add-staff', authenticate, async (req, res) => {
  try {
    const { name, email, password, role, phone, department, hospitalId } = req.body;
    if (!name || !email || !password || !role || !hospitalId) {
      return res.status(400).json({ error: 'All fields required' });
    }
    const db = getDb();
    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) return res.status(400).json({ error: 'Email already registered' });

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);
    await db.collection('users').doc(userId).set({
      id: userId, name, email, password: hashedPassword, role,
      hospitalId, phone: phone||'', department: department||'',
      status: 'active', createdAt: new Date().toISOString()
    });

    res.status(201).json({ message: 'Staff added!', userId,
      staff: { id: userId, name, email, role, phone: phone||'', department: department||'', status: 'active' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// LOGIN — with subscription check
// ═══════════════════════════════════════════════
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const db = getDb();
    const usersSnap = await db.collection('users').where('email', '==', email).get();
    if (usersSnap.empty) return res.status(401).json({ error: 'Invalid email or password' });

    const user = usersSnap.docs[0].data();
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password' });

    if (user.status === 'pending_payment') {
      return res.status(403).json({ error: 'Payment pending. Complete payment to activate account.', pending_payment: true });
    }
    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Account pending admin approval. Please wait.', pending: true });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Account rejected. Contact hospital admin.' });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'Account deactivated. Contact admin.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account not active. Contact support.' });
    }

    let hospital = null;
    if (user.hospitalId) {
      const hospDoc = await db.collection('hospitals').doc(user.hospitalId).get();
      if (hospDoc.exists) hospital = hospDoc.data();
    }

    // Subscription check (skip for super_admin)
    if (user.role !== 'super_admin' && hospital) {
      const now = new Date();
      const status = hospital.subscriptionStatus || 'trial';

      if (status === 'suspended') {
        return res.status(403).json({ error: '⛔ Hospital account suspended. Contact support: 7972425585' });
      }
      if (status === 'trial' && hospital.trialEnd && new Date(hospital.trialEnd) < now) {
        await db.collection('hospitals').doc(user.hospitalId).update({ subscriptionStatus: 'expired' });
        return res.status(403).json({
          error: '⏳ Free trial expired. Please upgrade your plan.',
          expired: true, hospitalId: user.hospitalId
        });
      }
      if (status === 'expired') {
        return res.status(403).json({
          error: '🔴 Subscription expired. Please renew to continue.',
          expired: true, hospitalId: user.hospitalId
        });
      }
      if (status === 'active' && hospital.subscriptionEnd && new Date(hospital.subscriptionEnd) < now) {
        await db.collection('hospitals').doc(user.hospitalId).update({ subscriptionStatus: 'expired' });
        return res.status(403).json({
          error: '🔴 Subscription expired. Please renew.',
          expired: true, hospitalId: user.hospitalId
        });
      }
    }

    const token = generateToken({ uid: user.id, email: user.email });
    await db.collection('users').doc(user.id).update({ lastLogin: new Date().toISOString() });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role,
              hospitalId: user.hospitalId || null, department: user.department||'',
              phone: user.phone||'' },
      hospital
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', message: err.message });
  }
});

// ═══════════════════════════════════════════════
// STAFF MANAGEMENT
// ═══════════════════════════════════════════════
router.get('/pending-staff', authenticate, async (req, res) => {
  try {
    const { hospitalId } = req.query;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId required' });
    const db = getDb();
    const snap = await db.collection('users').where('hospitalId','==',hospitalId).where('status','==','pending').get();
    const staff = snap.docs.map(d => {
      const u = d.data();
      return { id:u.id, name:u.name, email:u.email, role:u.role, phone:u.phone||'', department:u.department||'', requestedAt:u.createdAt };
    });
    res.json({ staff, total: staff.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/all-staff', authenticate, async (req, res) => {
  try {
    const { hospitalId } = req.query;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId required' });
    const db = getDb();
    const snap = await db.collection('users').where('hospitalId','==',hospitalId).get();
    const staff = snap.docs.map(d => {
      const u = d.data();
      return { id:u.id, name:u.name, email:u.email, role:u.role, phone:u.phone||'', department:u.department||'', status:u.status, createdAt:u.createdAt, lastLogin:u.lastLogin||'' };
    }).filter(u => u.role !== 'hospital_admin');
    res.json({ staff, total: staff.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/approve-staff/:userId', authenticate, async (req, res) => {
  try {
    const { action } = req.body;
    if (!['approve','reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });
    const db = getDb();
    const newStatus = action === 'approve' ? 'active' : 'rejected';
    await db.collection('users').doc(req.params.userId).update({ status: newStatus, reviewedAt: new Date().toISOString() });
    res.json({ message: `Staff ${action}d`, status: newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/toggle-staff/:userId', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('users').doc(req.params.userId).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });
    const cur = doc.data().status;
    const newStatus = cur === 'active' ? 'inactive' : 'active';
    await db.collection('users').doc(req.params.userId).update({ status: newStatus });
    res.json({ status: newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/staff/:userId', authenticate, async (req, res) => {
  try {
    await getDb().collection('users').doc(req.params.userId).delete();
    res.json({ message: 'Staff removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/update-staff/:userId', authenticate, async (req, res) => {
  try {
    const allowed = ['name','phone','department','qualification','role'];
    const updates = { updatedAt: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    await getDb().collection('users').doc(req.params.userId).update(updates);
    res.json({ message: 'Staff updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
    res.json({ user: { id:user.id, name:user.name, email:user.email, role:user.role, hospitalId:user.hospitalId||null, department:user.department||'' }, hospital });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
    res.json({ message: 'Password changed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/generate-hospital-code', authenticate, async (req, res) => {
  try {
    const { hospitalId } = req.body;
    const code = Math.random().toString(36).substring(2,8).toUpperCase();
    await getDb().collection('hospitals').doc(hospitalId).update({ hospitalCode: code });
    res.json({ hospitalCode: code });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/create-super-admin', async (req, res) => {
  try {
    const { email, password, secret } = req.body;
    if (secret !== 'SPARKLINE_SUPER_2025') return res.status(403).json({ error: 'Invalid secret' });
    const db = getDb();
    const existing = await db.collection('users').where('email','==',email).get();
    if (!existing.empty) {
      await db.collection('users').doc(existing.docs[0].id).update({ role: 'super_admin', status: 'active' });
      return res.json({ message: 'Updated to super_admin' });
    }
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);
    await db.collection('users').doc(userId).set({
      id: userId, name: 'Super Admin', email,
      password: hashedPassword, role: 'super_admin',
      status: 'active', createdAt: new Date().toISOString()
    });
    const token = generateToken({ uid: userId, email });
    res.status(201).json({ message: 'Super admin created', token });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mark setup complete
router.post('/complete-setup', authenticate, async (req, res) => {
  try {
    const { hospitalId } = req.body;
    await getDb().collection('hospitals').doc(hospitalId).update({ setupComplete: true, setupCompletedAt: new Date().toISOString() });
    res.json({ message: 'Setup complete!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
