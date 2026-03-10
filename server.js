require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route (Railway healthcheck)
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Medicore HMS Backend Running",
    time: new Date()
  });
});

// Health API
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy"
  });
});

// Server start
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
