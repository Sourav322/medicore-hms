const express = require('express');
const router = express.Router();
const { hospitalCollection } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.get('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { category, lowStock } = req.query;
    const snapshot = await hospitalCollection(hospitalId, 'inventory').orderBy('name').get();
    let items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (category) items = items.filter(i => i.category === category);
    if (lowStock === 'true') items = items.filter(i => i.quantity <= i.reorderLevel);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const {
      name, category, supplier, purchasePrice, sellingPrice,
      quantity, unit, expiryDate, reorderLevel, description
    } = req.body;

    if (!name || !quantity) return res.status(400).json({ error: 'Name and quantity required' });

    const id = uuidv4();
    const item = {
      id, name, category: category || 'Other', supplier: supplier || '',
      purchasePrice: parseFloat(purchasePrice) || 0,
      sellingPrice: parseFloat(sellingPrice) || 0,
      quantity: parseInt(quantity) || 0,
      unit: unit || 'unit',
      expiryDate: expiryDate || null,
      reorderLevel: parseInt(reorderLevel) || 10,
      description: description || '',
      hospitalId, status: 'active',
      transactions: [],
      createdAt: new Date().toISOString()
    };

    await hospitalCollection(hospitalId, 'inventory').doc(id).set(item);
    res.status(201).json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    await hospitalCollection(hospitalId, 'inventory').doc(req.params.id).update(updates);
    res.json({ message: 'Item updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stock adjustment
router.post('/:id/adjust', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { quantity, type, notes } = req.body; // type: 'add' | 'remove'

    const doc = await hospitalCollection(hospitalId, 'inventory').doc(req.params.id).get();
    const item = doc.data();
    const newQuantity = type === 'add' ? item.quantity + parseInt(quantity) : item.quantity - parseInt(quantity);

    if (newQuantity < 0) return res.status(400).json({ error: 'Insufficient stock' });

    const transactions = item.transactions || [];
    transactions.push({
      type, quantity: parseInt(quantity), notes: notes || '',
      before: item.quantity, after: newQuantity,
      date: new Date().toISOString(), by: req.user.name
    });

    await hospitalCollection(hospitalId, 'inventory').doc(req.params.id).update({
      quantity: newQuantity, transactions
    });

    res.json({ message: 'Stock adjusted', newQuantity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    await hospitalCollection(hospitalId, 'inventory').doc(req.params.id).update({
      status: 'inactive', deletedAt: new Date().toISOString()
    });
    res.json({ message: 'Item removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

