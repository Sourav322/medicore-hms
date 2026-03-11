const express = require('express');
const router = express.Router();
const { getDb } = require('../config/firebase');
const crypto = require('crypto');
const https = require('https');

const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET = process.env.CASHFREE_SECRET_KEY;
const CASHFREE_BASE_URL = 'sandbox.cashfree.com'; // Test mode

// Helper: HTTPS request
function httpsRequest(options, body) {
  return new Promise(function(resolve, reject) {
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── CREATE ORDER ──
router.post('/create-order', async (req, res) => {
  try {
    const { hospitalId, hospitalName, email, phone, plan, amount, billingCycle } = req.body;
    if (!hospitalId || !amount) return res.status(400).json({ error: 'Missing required fields' });

    const orderId = 'ORD_' + hospitalId.slice(0, 8) + '_' + Date.now();
    const orderData = JSON.stringify({
      order_id: orderId,
      order_amount: parseFloat(amount),
      order_currency: 'INR',
      customer_details: {
        customer_id: hospitalId.slice(0, 50),
        customer_name: hospitalName || 'Hospital',
        customer_email: email || 'admin@hospital.com',
        customer_phone: (phone || '9999999999').replace(/\D/g, '').slice(0, 10) || '9999999999'
      },
      order_meta: {
        return_url: 'https://web-production-d347.up.railway.app/payment-status?order_id={order_id}&order_token={order_token}',
        notify_url: 'https://web-production-d347.up.railway.app/api/payments/webhook'
      },
      order_note: 'MediCore ' + plan + ' Plan - ' + (billingCycle || 'monthly')
    });

    const options = {
      hostname: CASHFREE_BASE_URL,
      path: '/pg/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET,
        'x-api-version': '2023-08-01',
        'Content-Length': Buffer.byteLength(orderData)
      }
    };

    const data = await httpsRequest(options, orderData);
    if (data.type === 'ERROR' || data.error) {
      return res.status(400).json({ error: data.message || 'Order creation failed' });
    }

    const db = getDb();
    await db.collection('payments').doc(orderId).set({
      orderId,
      hospitalId,
      plan: plan || 'basic',
      amount: parseFloat(amount),
      billingCycle: billingCycle || 'monthly',
      status: 'pending',
      cashfreeOrderId: data.order_id || orderId,
      paymentSessionId: data.payment_session_id || '',
      createdAt: new Date().toISOString()
    });

    res.json({
      orderId: data.order_id || orderId,
      paymentSessionId: data.payment_session_id || '',
      amount: parseFloat(amount)
    });
  } catch (err) {
    console.error('create-order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── VERIFY PAYMENT ──
router.post('/verify', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'Order ID required' });

    const options = {
      hostname: CASHFREE_BASE_URL,
      path: '/pg/orders/' + orderId,
      method: 'GET',
      headers: {
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET,
        'x-api-version': '2023-08-01'
      }
    };

    const data = await httpsRequest(options, null);
    const db = getDb();
    const payDoc = await db.collection('payments').doc(orderId).get();

    if (!payDoc.exists) return res.status(404).json({ error: 'Payment not found' });
    const payData = payDoc.data();
    const isPaid = data.order_status === 'PAID';

    if (isPaid) {
      await db.collection('payments').doc(orderId).update({
        status: 'paid',
        paidAt: new Date().toISOString()
      });
      var subEnd = new Date();
      if (payData.billingCycle === 'yearly') subEnd.setFullYear(subEnd.getFullYear() + 1);
      else subEnd.setMonth(subEnd.getMonth() + 1);
      await db.collection('hospitals').doc(payData.hospitalId).update({
        subscriptionStatus: 'active',
        plan: payData.plan,
        subscriptionEnd: subEnd.toISOString(),
        lastPayment: new Date().toISOString()
      });
    }

    res.json({ status: data.order_status, isPaid, plan: payData.plan, amount: payData.amount });
  } catch (err) {
    console.error('verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── WEBHOOK ──
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    if (signature && timestamp && CASHFREE_SECRET) {
      var signedPayload = timestamp + JSON.stringify(req.body);
      var expectedSig = crypto.createHmac('sha256', CASHFREE_SECRET).update(signedPayload).digest('base64');
      if (signature !== expectedSig) return res.status(401).json({ error: 'Invalid signature' });
    }
    var orderId = req.body && req.body.data && req.body.data.order && req.body.data.order.order_id;
    var orderStatus = req.body && req.body.data && req.body.data.order && req.body.data.order.order_status;
    if (orderId && orderStatus === 'PAID') {
      var db = getDb();
      var payDoc = await db.collection('payments').doc(orderId).get();
      if (payDoc.exists) {
        var payData = payDoc.data();
        await db.collection('payments').doc(orderId).update({ status: 'paid', paidAt: new Date().toISOString() });
        var subEnd2 = new Date();
        if (payData.billingCycle === 'yearly') subEnd2.setFullYear(subEnd2.getFullYear() + 1);
        else subEnd2.setMonth(subEnd2.getMonth() + 1);
        await db.collection('hospitals').doc(payData.hospitalId).update({
          subscriptionStatus: 'active', plan: payData.plan,
          subscriptionEnd: subEnd2.toISOString(), lastPayment: new Date().toISOString()
        });
      }
    }
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PAYMENT HISTORY ──
router.get('/history', async (req, res) => {
  try {
    var hospitalId = req.query.hospitalId;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId required' });
    var db = getDb();
    var snap = await db.collection('payments').where('hospitalId', '==', hospitalId).limit(50).get();
    var payments = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    res.json({ payments: payments });
  } catch (err) {
    console.error('history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

