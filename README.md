# MediCore HMS — Backend

Hospital Management System built with Node.js + Express + Firebase

## Deploy on Railway

1. Fork/upload this repo to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add these environment variables in Railway dashboard:
   - PORT=3000
   - JWT_SECRET=your_secret_key
   - FIREBASE_PROJECT_ID=your_project_id
   - FIREBASE_CLIENT_EMAIL=your_service_account_email
   - FIREBASE_PRIVATE_KEY="your_private_key"

## Local Development

```bash
npm install
cp .env.example .env
# Fill in .env with your Firebase credentials
npm start
```
