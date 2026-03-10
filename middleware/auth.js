const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'hms-super-secret-key-change-in-production';

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user info from token
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role || 'admin',
      hospitalId: decoded.hospitalId || 'default-hospital'
    };

    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }

    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

const isSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
};

const checkHospitalAccess = (req, res, next) => {
  const hospitalId =
    req.params.hospitalId ||
    req.body.hospitalId ||
    req.query.hospitalId;

  if (
    req.user.role !== 'super_admin' &&
    req.user.hospitalId !== hospitalId
  ) {
    return res.status(403).json({ error: 'Access denied to this hospital data' });
  }

  req.hospitalId = hospitalId;
  next();
};

const generateToken = (user) => {
  return jwt.sign(
    {
      uid: user.uid,
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

module.exports = {
  authenticate,
  authorize,
  isSuperAdmin,
  checkHospitalAccess,
  generateToken
};
