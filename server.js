require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

// Security
app.use(helmet());
app.use(cors({
  origin: "*"
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});

app.use("/api", limiter);

// Root route (Railway health check)
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Medicore HMS Backend",
    version: "1.0",
    time: new Date()
  });
});

// Health API
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy"
  });
});

/* ==============================
   HMS API ROUTES
============================== */

app.use("/api/auth", require("./routes/auth"));
app.use("/api/hospitals", require("./routes/hospitals"));
app.use("/api/patients", require("./routes/patients"));
app.use("/api/doctors", require("./routes/doctors"));
app.use("/api/appointments", require("./routes/appointments"));
app.use("/api/opd", require("./routes/opd"));
app.use("/api/ipd", require("./routes/ipd"));
app.use("/api/lab", require("./routes/laboratory"));
app.use("/api/billing", require("./routes/billing"));
app.use("/api/staff", require("./routes/staff"));
app.use("/api/inventory", require("./routes/inventory"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/dashboard", require("./routes/dashboard"));

/* ==============================
   ERROR HANDLER
============================== */

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message
  });
});

/* ==============================
   SERVER START
============================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🏥 MediCore HMS Server running on port ${PORT}`);
});
