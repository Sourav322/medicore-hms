const admin = require("firebase-admin");

let db;
let auth;

function initializeFirebase() {

  if (admin.apps.length > 0) return;

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  db = admin.firestore();
  auth = admin.auth();
}

function getDb() {
  if (!db) initializeFirebase();
  return db;
}

function getAuth() {
  if (!auth) initializeFirebase();
  return auth;
}

function hospitalCollection(hospitalId, collection) {
  return getDb()
    .collection("hospitals")
    .doc(hospitalId)
    .collection(collection);
}

function generateUHID(hospitalId) {
  const prefix = hospitalId.substring(0, 3).toUpperCase();
  const time = Date.now().toString().slice(-6);
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");

  return `${prefix}-${time}-${rand}`;
}

function generateToken() {
  return Math.floor(Math.random() * 900) + 100;
}

module.exports = {
  getDb,
  getAuth,
  hospitalCollection,
  generateUHID,
  generateToken
};
