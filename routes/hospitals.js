const express = require('express');
const router = express.Router();
const { getDb } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');

// GET /api/hospitals/all — Super Admin: sabhi hospitals
router.get('/all', async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('hospitals').orderBy('createdAt', 'desc').get();
    const hospitals = [];
    for (const doc of snap.docs) {
      const h = doc.data();
      let adminEmail = '';
      try {
        const adminDoc = await db.collection('users').doc(h.adminId).get();
        if (adminDoc.exists) adminEmail = adminDoc.data().email || '';
      } catch (e) {}
      hospitals.push({ id: doc.id, ...h, adminEmail });
    }
    res.json({ hospitals, total: hospitals.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hospitals — List (authenticated)
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const snapshot = await db.collection('hospitals').orderBy('name').get();
    const hospitals = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ hospitals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hospitals/:id — Single hospital
router.get('/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.hospitalId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const db = getDb();
    const doc = await db.collection('hospitals').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Hospital not found' });
    res.json({ hospital: { id: doc.id, ...doc.data() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/hospitals/:id — Update hospital (plan, status, trialEnd, settings)
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.hospitalId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const db = getDb();
    const allowed = ['plan', 'subscriptionStatus', 'status', 'trialEnd', 'subscriptionEnd',
      'hospitalCode', 'name', 'address', 'phone', 'emergencyPhone', 'gstNumber'];
    const updates = { updatedAt: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    await db.collection('hospitals').doc(req.params.id).update(updates);
    res.json({ message: 'Hospital updated', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hospitals/:id — Super Admin only
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin only' });
    }
    const db = getDb();
    await db.collection('hospitals').doc(req.params.id).delete();
    res.json({ message: 'Hospital deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

