const express = require('express');
const router = express.Router();
const { getDb } = require('../config/firebase');
const crypto = require('crypto');

const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET = process.env.CASHFREE_SECRET_KEY;
const CASHFREE_BASE_URL = 'https://sandbox.cashfree.com/pg'; // Test mode
// Production: https://api.cashfree.com/pg

// ── CREATE ORDER ──
// POST /api/payments/create-order
router.post('/create-order', async (req, res) => {
  try {
    const { hospitalId, hospitalName, email, phone, plan, amount, billingCycle } = req.body;
    if (!hospitalId || !amount) return res.status(400).json({ error: 'Missing required fields' });

    const orderId = 'ORD_' + hospitalId.slice(0, 8) + '_' + Date.now();

    const orderData = {
      order_id: orderId,
      order_amount: parseFloat(amount),
      order_currency: 'INR',
      customer_details: {
        customer_id: hospitalId,
        customer_name: hospitalName || 'Hospital',
        customer_email: email || 'admin@hospital.com',
        customer_phone: phone || '9999999999'
      },
      order_meta: {
        return_url: `https://web-production-d347.up.railway.app/payment-status?order_id={order_id}&order_token={order_token}`,
        notify_url: `https://web-production-d347.up.railway.app/api/payments/webhook`
      },
      order_note: `MediCore ${plan} Plan - ${billingCycle || 'monthly'}`
    };

    const response = await fetch(`${CASHFREE_BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET,
        'x-api-version': '2023-08-01'
      },
      body: JSON.stringify(orderData)
    });

    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: data.message || 'Order creation failed' });

    // Save order in Firestore
    const db = getDb();
    await db.collection('payments').doc(orderId).set({
      orderId,
      hospitalId,
      plan,
      amount: parseFloat(amount),
      billingCycle: billingCycle || 'monthly',
      status: 'pending',
      cashfreeOrderId: data.order_id,
      paymentSessionId: data.payment_session_id,
      createdAt: new Date().toISOString()
    });

    res.json({
      orderId: data.order_id,
      paymentSessionId: data.payment_session_id,
      amount: parseFloat(amount)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── VERIFY PAYMENT ──
// POST /api/payments/verify
router.post('/verify', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'Order ID required' });

    const response = await fetch(`${CASHFREE_BASE_URL}/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET,
        'x-api-version': '2023-08-01'
      }
    });

    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: 'Verification failed' });

    const db = getDb();
    const payDoc = await db.collection('payments').doc(orderId).get();
    if (!payDoc.exists) return res.status(404).json({ error: 'Payment not found' });

    const payData = payDoc.data();
    const isPaid = data.order_status === 'PAID';

    if (isPaid) {
      // Update payment status
      await db.collection('payments').doc(orderId).update({
        status: 'paid',
        paidAt: new Date().toISOString(),
        cashfreeData: data
      });

      // Update hospital subscription
      const subEnd = new Date();
      if (payData.billingCycle === 'yearly') subEnd.setFullYear(subEnd.getFullYear() + 1);
      else subEnd.setMonth(subEnd.getMonth() + 1);

      await db.collection('hospitals').doc(payData.hospitalId).update({
        subscriptionStatus: 'active',
        plan: payData.plan,
        subscriptionEnd: subEnd.toISOString(),
        lastPayment: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    res.json({
      status: data.order_status,
      isPaid,
      plan: payData.plan,
      amount: payData.amount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WEBHOOK ──
// POST /api/payments/webhook
router.post('/webhook', async (req, res) => {
  try {
    // Verify Cashfree signature
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const rawBody = JSON.stringify(req.body);

    if (signature && timestamp) {
      const signedPayload = timestamp + rawBody;
      const expectedSig = crypto
        .createHmac('sha256', CASHFREE_SECRET)
        .update(signedPayload)
        .digest('base64');
      if (signature !== expectedSig) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = req.body;
    const orderId = event?.data?.order?.order_id;
    const orderStatus = event?.data?.order?.order_status;

    if (orderId && orderStatus === 'PAID') {
      const db = getDb();
      const payDoc = await db.collection('payments').doc(orderId).get();
      if (payDoc.exists) {
        const payData = payDoc.data();
        await db.collection('payments').doc(orderId).update({
          status: 'paid',
          paidAt: new Date().toISOString()
        });
        const subEnd = new Date();
        if (payData.billingCycle === 'yearly') subEnd.setFullYear(subEnd.getFullYear() + 1);
        else subEnd.setMonth(subEnd.getMonth() + 1);
        await db.collection('hospitals').doc(payData.hospitalId).update({
          subscriptionStatus: 'active',
          plan: payData.plan,
          subscriptionEnd: subEnd.toISOString(),
          lastPayment: new Date().toISOString()
        });
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET PAYMENT HISTORY ──
// GET /api/payments/history?hospitalId=xxx
router.get('/history', async (req, res) => {
  try {
    const { hospitalId } = req.query;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId required' });
    const db = getDb();
    const snap = await db.collection('payments')
      .where('hospitalId', '==', hospitalId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    const payments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ payments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

