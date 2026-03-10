/**
 * Demo Data Seeder
 * Run: node seed-demo.js
 * Make sure .env is configured first
 */
require('dotenv').config();
const { getDb, generateUHID } = require('./config/firebase');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seedDemoData() {
  const db = getDb();
  console.log('🌱 Seeding demo data...');

  // Create demo hospital
  const hospitalId = 'demo-hospital-001';
  const adminId = 'demo-admin-001';

  await db.collection('hospitals').doc(hospitalId).set({
    id: hospitalId,
    name: 'MediCore Demo Hospital',
    address: '123 Health Street, Medical City, MH 400001',
    phone: '+91-22-12345678',
    email: 'admin@medicore.com',
    plan: 'professional',
    status: 'active',
    adminId,
    settings: { currency: 'INR', gstEnabled: true, gstRate: 18, gstNumber: '27AAAAA0000A1Z5', timezone: 'Asia/Kolkata' },
    createdAt: new Date().toISOString()
  });

  // Create admin user
  const hashedPass = await bcrypt.hash('demo1234', 12);
  await db.collection('users').doc(adminId).set({
    id: adminId, uid: adminId,
    name: 'Dr. Demo Admin',
    email: 'demo@medicore.com',
    password: hashedPass,
    role: 'hospital_admin',
    hospitalId,
    status: 'active',
    createdAt: new Date().toISOString()
  });
  console.log('✅ Admin created: demo@medicore.com / demo1234');

  // Create doctors
  const doctors = [
    { id: uuidv4(), name: 'Dr. Arjun Sharma', specialization: 'Cardiologist', department: 'Cardiology', consultationFee: 1000, experience: 12, qualification: 'MBBS, MD (Cardiology)', availableDays: ['Mon','Tue','Wed','Thu','Fri'], contactNumber: '+91-9876543210' },
    { id: uuidv4(), name: 'Dr. Priya Nair', specialization: 'Neurologist', department: 'Neurology', consultationFee: 1200, experience: 8, qualification: 'MBBS, DM (Neurology)', availableDays: ['Mon','Wed','Fri'], contactNumber: '+91-9876543211' },
    { id: uuidv4(), name: 'Dr. Rajesh Kumar', specialization: 'Orthopedic Surgeon', department: 'Orthopedics', consultationFee: 900, experience: 15, qualification: 'MBBS, MS (Ortho)', availableDays: ['Tue','Thu','Sat'], contactNumber: '+91-9876543212' },
    { id: uuidv4(), name: 'Dr. Sunita Patel', specialization: 'Pediatrician', department: 'Pediatrics', consultationFee: 600, experience: 10, qualification: 'MBBS, DCH', availableDays: ['Mon','Tue','Wed','Thu','Fri','Sat'], contactNumber: '+91-9876543213' },
  ];

  for (const doctor of doctors) {
    await db.collection('hospitals').doc(hospitalId).collection('doctors').doc(doctor.id).set({
      ...doctor, hospitalId, status: 'active', createdAt: new Date().toISOString()
    });
  }
  console.log(`✅ ${doctors.length} doctors created`);

  // Create patients
  const patients = [
    { name: 'Ramesh Kumar', age: 45, gender: 'Male', phone: '9876543100', bloodGroup: 'O+', address: 'Mumbai, MH' },
    { name: 'Priya Mehta', age: 32, gender: 'Female', phone: '9876543101', bloodGroup: 'A+', address: 'Pune, MH' },
    { name: 'Suresh Verma', age: 58, gender: 'Male', phone: '9876543102', bloodGroup: 'B+', address: 'Nagpur, MH' },
    { name: 'Anita Singh', age: 28, gender: 'Female', phone: '9876543103', bloodGroup: 'AB+', address: 'Nashik, MH' },
    { name: 'Vijay Patel', age: 41, gender: 'Male', phone: '9876543104', bloodGroup: 'O-', address: 'Aurangabad, MH' },
    { name: 'Kavitha Reddy', age: 35, gender: 'Female', phone: '9876543105', bloodGroup: 'A-', address: 'Thane, MH' },
  ];

  for (const p of patients) {
    const id = uuidv4();
    const uhid = generateUHID(hospitalId);
    await db.collection('hospitals').doc(hospitalId).collection('patients').doc(id).set({
      id, uhid, ...p,
      email: '', allergyNotes: '', emergencyContact: '', emergencyPhone: '',
      hospitalId, status: 'active',
      createdAt: new Date().toISOString()
    });
  }
  console.log(`✅ ${patients.length} patients created`);

  // Create staff
  const staff = [
    { name: 'Meena Sharma', role: 'receptionist', department: 'Front Desk', phone: '9876500001' },
    { name: 'Raju Patel', role: 'nurse', department: 'General Ward', phone: '9876500002' },
    { name: 'Seema Verma', role: 'lab_technician', department: 'Pathology', phone: '9876500003' },
  ];

  for (const s of staff) {
    const id = uuidv4();
    const staffPass = await bcrypt.hash('staff1234', 12);
    await db.collection('users').doc(id).set({
      id, uid: id, name: s.name,
      email: s.name.toLowerCase().replace(' ', '.') + '@medicore.com',
      password: staffPass, role: s.role, hospitalId, status: 'active',
      createdAt: new Date().toISOString()
    });
    await db.collection('hospitals').doc(hospitalId).collection('staff').doc(id).set({
      id, ...s, salary: 25000,
      joiningDate: '2024-01-01', status: 'active', hospitalId,
      createdAt: new Date().toISOString()
    });
  }
  console.log(`✅ ${staff.length} staff created`);

  // Create inventory items
  const items = [
    { name: 'Paracetamol 500mg', category: 'Medicines', supplier: 'MedSupplies Ltd', quantity: 2400, unit: 'tablets', purchasePrice: 0.5, reorderLevel: 500 },
    { name: 'Disposable Syringes 5ml', category: 'Consumables', supplier: 'HealthCare Co', quantity: 800, unit: 'units', purchasePrice: 4, reorderLevel: 100 },
    { name: 'Surgical Gloves (L)', category: 'PPE', supplier: 'SafeMed', quantity: 45, unit: 'boxes', purchasePrice: 120, reorderLevel: 50 },
    { name: 'IV Cannula 20G', category: 'Consumables', supplier: 'MedSupplies Ltd', quantity: 320, unit: 'units', purchasePrice: 18, reorderLevel: 100 },
  ];

  for (const item of items) {
    const id = uuidv4();
    await db.collection('hospitals').doc(hospitalId).collection('inventory').doc(id).set({
      id, ...item, hospitalId, status: 'active',
      expiryDate: '2026-12-31', transactions: [],
      createdAt: new Date().toISOString()
    });
  }
  console.log(`✅ ${items.length} inventory items created`);

  console.log('\n🎉 Demo data seeded successfully!');
  console.log('Login: demo@medicore.com / demo1234');
  process.exit(0);
}

seedDemoData().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
