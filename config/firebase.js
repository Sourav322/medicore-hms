const admin = require('firebase-admin');

let db = null;
let auth = null;

function initializeFirebase() {
  if (admin.apps.length > 0) return;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      };
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
  });
}

function getDb() {
  if (!db) { initializeFirebase(); db = admin.firestore(); }
  return db;
}

function getAuth() {
  if (!auth) { initializeFirebase(); auth = admin.auth(); }
  return auth;
}

function hospitalCollection(hospitalId, collectionName) {
  return getDb().collection('hospitals').doc(hospitalId).collection(collectionName);
}

function generateUHID(hospitalId) {
  const prefix = hospitalId.substring(0, 3).toUpperCase();
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
}

function generateToken() {
  return Math.floor(Math.random() * 900) + 100;
}

module.exports = { getDb, getAuth, hospitalCollection, generateUHID, generateToken };
