require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

/* =========================
   SECURITY MIDDLEWARE
========================= */

app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

/* =========================
   RATE LIMIT
========================= */

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});

app.use('/api/', limiter);

/* =========================
   BODY PARSER
========================= */

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC FRONTEND (OPTIONAL)
========================= */

try {
  app.use(express.static(path.join(__dirname, 'public')));
} catch (err) {
  console.log("No public folder found");
}

/* =========================
   ROOT HEALTHCHECK
========================= */

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MediCore HMS Backend',
    time: new Date().toISOString()
  });
});

/* =========================
   API HEALTHCHECK
========================= */

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MediCore HMS',
    uptime: process.uptime()
  });
});

/* =========================
   SAFE ROUTE LOADER
========================= */

function loadRoute(path, routeFile) {
  try {
    app.use(path, require(routeFile));
    console.log(`Loaded route: ${path}`);
  } catch (err) {
    console.error(`Failed to load route ${path}:`, err.message);
  }
}

/* =========================
   HMS ROUTES
========================= */

loadRoute('/api/auth', './routes/auth');
loadRoute('/api/hospitals', './routes/hospitals');
loadRoute('/api/patients', './routes/patients');
loadRoute('/api/doctors', './routes/doctors');
loadRoute('/api/appointments', './routes/appointments');
loadRoute('/api/opd', './routes/opd');
loadRoute('/api/ipd', './routes/ipd');
loadRoute('/api/lab', './routes/laboratory');
loadRoute('/api/billing', './routes/billing');
loadRoute('/api/staff', './routes/staff');
loadRoute('/api/inventory', './routes/inventory');
loadRoute('/api/reports', './routes/reports');
loadRoute('/api/dashboard', './routes/dashboard');

/* =========================
   FRONTEND FALLBACK
========================= */

app.get('*', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public/index.html'));
  } catch (err) {
    res.json({
      message: "MediCore HMS API running"
    });
  }
});

/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🏥 HMS Server running on port ${PORT}`);
});

module.exports = app;
