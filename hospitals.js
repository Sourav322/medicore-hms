const express = require('express');
const router = express.Router();
const { getDb } = require('../config/firebase');
const { authenticate, isSuperAdmin } = require('../middleware/auth');

// GET all hospitals (super admin)
router.get('/', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const db = getDb();
    const snapshot = await db.collection('hospitals').orderBy('name').get();
    const hospitals = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ hospitals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single hospital
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

// PUT update hospital settings
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.hospitalId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const db = getDb();
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    delete updates.id;
    await db.collection('hospitals').doc(req.params.id).update(updates);
    res.json({ message: 'Hospital updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

