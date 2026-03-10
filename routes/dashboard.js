const express = require('express');
const router = express.Router();
const { hospitalCollection } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');

router.get('/stats', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const today = new Date().toISOString().split('T')[0];

    const [patientsSnap, todayApptSnap, activeIPDSnap, todayBillsSnap, labSnap] = await Promise.all([
      hospitalCollection(hospitalId, 'patients').where('status', '==', 'active').count().get(),
      hospitalCollection(hospitalId, 'appointments').where('date', '==', today).get(),
      hospitalCollection(hospitalId, 'ipd_admissions').where('status', '==', 'admitted').count().get(),
      hospitalCollection(hospitalId, 'bills').get(),
      hospitalCollection(hospitalId, 'lab_tests').count().get(),
    ]);

    const todayBills = todayBillsSnap.docs
      .filter(d => d.data().createdAt?.startsWith(today))
      .reduce((sum, d) => sum + (d.data().totalAmount || 0), 0);

    const todayAppts = todayApptSnap.docs.map(d => d.data());

    res.json({
      totalPatients: patientsSnap.data().count,
      todayAppointments: todayAppts.length,
      activeAdmissions: activeIPDSnap.data().count,
      revenueToday: todayBills,
      totalLabTests: labSnap.data().count,
      appointmentsByStatus: {
        scheduled: todayAppts.filter(a => a.status === 'scheduled').length,
        completed: todayAppts.filter(a => a.status === 'completed').length,
        cancelled: todayAppts.filter(a => a.status === 'cancelled').length,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/monthly-patients', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const snapshot = await hospitalCollection(hospitalId, 'patients')
      .orderBy('createdAt', 'desc').limit(500).get();

    const months = {};
    snapshot.docs.forEach(d => {
      const date = d.data().createdAt;
      if (date) {
        const month = date.substring(0, 7);
        months[month] = (months[month] || 0) + 1;
      }
    });

    const labels = Object.keys(months).sort().slice(-6);
    const data = labels.map(l => months[l]);

    res.json({ labels, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/revenue-chart', authenticate, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const snapshot = await hospitalCollection(hospitalId, 'bills')
      .orderBy('createdAt', 'desc').limit(500).get();

    const days = {};
    snapshot.docs.forEach(d => {
      const date = d.data().createdAt?.substring(0, 10);
      if (date) {
        days[date] = (days[date] || 0) + (d.data().totalAmount || 0);
      }
    });

    const labels = Object.keys(days).sort().slice(-7);
    const data = labels.map(l => days[l]);

    res.json({ labels, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

