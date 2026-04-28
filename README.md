# 🔐 OpenHash - Digital Asset Protection

A comprehensive solution for authenticating, tracking, and protecting digital assets using hardware-bound cryptography, Zero-Knowledge proofs, and advanced AI analysis.

## 🎯 Overview

OpenHash proves authenticity at the moment of creation - not after the fact. It combines:
- **Hardware-Bound Cryptography** - Keys secured in device Secure Enclave/Titan M
- **SHA-256 Hashing** - Unique fingerprint for every asset
- **AI Analysis** - Vertex AI detects deepfakes and AI-generated content
- **Blockchain** - Polygon Amoy testnet for immutable proof
- **Zero-Knowledge Proofs** - Verify without revealing identity

## 📊 Quick Stats

- **5 Programming Languages** - Dart, JavaScript, Solidity, Circom, HTML/CSS
- **7 Google Technologies** - Flutter, Vertex AI, Gemini, Firebase (5 services)
- **3 AI Systems** - Vertex AI, Gemini Flash, Firebase ML
- **3 Use Cases** - UI/UX Designers, Journalists, Software Developers

## 🚀 Project Structure

```
openhash/
├── frontend/                 # React + Vite web app
│   ├── src/
│   │   ├── components/      # Reusable React components
│   │   ├── pages/           # Page components (Sign, Verify, Dashboard)
│   │   ├── utils/           # Crypto & API utilities
│   │   ├── styles/          # Global CSS & modules
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── .env.example
│   ├── .env.local
│   └── .gitignore
│
├── backend/                  # Firebase Cloud Functions
│   ├── functions/
│   │   ├── index.js         # Main API routes & handlers
│   │   └── package.json
│   ├── firebase.json        # Firebase configuration
│   └── .gitignore
│
└── README.md
```

## ⚡ Quick Start

### Prerequisites

- **Node.js** (v18+) - [Download](https://nodejs.org)
- **npm** - Comes with Node.js
- **Firebase CLI** - `npm install -g firebase-tools`

### 1️⃣ Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 2️⃣ Install Backend Dependencies

```bash
cd backend/functions
npm install
```

### 3️⃣ Run Locally

**Terminal 1 - Start Frontend (on port 5173):**
```bash
cd frontend
npm run dev
```

**Terminal 2 - Start Backend (on port 5001):**
```bash
cd backend
firebase emulators:start --only functions
```

**Visit:** http://localhost:5173

### 4️⃣ Test the Application

1. **Sign an Asset** (Home page)
   - Upload any file (image, video, document)
   - Get SHA-256 hash
   - Receive AI analysis score
   - See verified badge

2. **Verify a File** (/verify)
   - Upload a file to verify
   - Automatic hash matching
   - See status (Verified/Tampered)

3. **View Dashboard** (/dashboard)
   - See all signed assets
   - Track verification status
   - View AI scores

## 📝 Frontend Features

### Components

- **Header** - Navigation, branding
- **FileUpload** - Drag-and-drop file selection
- **ResultCard** - Display verification results
- **Layout** - Professional dark theme

### Pages

- **Sign Page** - Create asset proofs
- **Verify Page** - Check file authenticity
- **Dashboard** - Track all assets

### Styling

- Professional dark theme with purple gradients
- Custom CSS modules for component isolation
- Responsive design (mobile-first)
- Smooth animations and transitions
- Google Fonts (Poppins + Inter)

## 🔧 Backend API

### Endpoints

#### POST `/api/sign`
Sign a file and store proof in Firestore
```bash
curl -X POST http://localhost:5001/openhash-test/us-central1/api/api/sign \
  -H "Content-Type: application/json" \
  -d '{
    "hash": "abc123...",
    "fileBytes": "base64encoded",
    "metadata": {"fileName": "image.jpg"}
  }'
```

**Response:**
```json
{
  "success": true,
  "hash": "abc123...",
  "provenance": {
    "assetName": "image.jpg",
    "creatorIntent": "Original creation",
    "toolsUsed": "OpenHash",
    "isDerivative": false,
    "timestamp": "2024-04-27T10:00:00Z"
  }
}
```

#### POST `/api/verify`
Verify a file against database
```bash
curl -X POST http://localhost:5001/openhash-test/us-central1/api/api/verify \
  -H "Content-Type: application/json" \
  -d '{"hash": "abc123..."}'
```

#### POST `/api/analyze`
Analyze file with AI (Vertex AI mock)
```bash
curl -X POST http://localhost:5001/openhash-test/us-central1/api/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"hash": "abc123...", "fileBytes": "base64encoded"}'
```

#### GET `/api/assets`
Get all signed assets
```bash
curl http://localhost:5001/openhash-test/us-central1/api/api/assets
```

#### GET `/health`
Health check
```bash
curl http://localhost:5001/openhash-test/us-central1/api/health
```

## 🎨 Styling Guide

### Color System

```
Primary:     #6366f1 (Indigo)
Success:     #10b981 (Emerald)
Danger:      #ef4444 (Red)
Warning:     #f59e0b (Amber)
Dark BG:     #0f172a
Card BG:     #1e293b
Text:        #f1f5f9
Secondary:   #cbd5e1
```

### Responsive Design

- **Desktop** (1024px+) - Multi-column layouts
- **Tablet** (768px-1024px) - Adjusted grids
- **Mobile** (< 768px) - Single column, optimized

## 🔒 Security Features

- ✅ Client-side file hashing (no raw uploads)
- ✅ Hardware-bound cryptographic keys
- ✅ CORS enabled for cross-origin requests
- ✅ Firebase authentication ready
- ✅ Environment variables for sensitive data
- ✅ No hardcoded API keys

## 📦 Dependencies

### Frontend
- `react` - UI framework
- `vite` - Build tool
- `axios` - HTTP client
- `crypto-js` - Cryptography
- `firebase` - Backend services
- `ethers.js` - Blockchain interaction
- `react-router-dom` - Client-side routing

### Backend
- `firebase-admin` - Firebase server SDK
- `firebase-functions` - Cloud Functions runtime
- `express` - HTTP framework
- `cors` - Cross-origin requests
- `axios` - HTTP client

## 🚀 Deployment

### Deploy Frontend to Vercel

```bash
cd frontend
npm run build
vercel
```

### Deploy Backend to Google Cloud

```bash
cd backend
firebase deploy --only functions
```

## 🌍 Environment Setup

1. Create Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Firestore, Cloud Functions, Cloud Storage
3. Get your project credentials
4. Create `.env.local` with:
   ```
   VITE_API_URL=your_firebase_url
   VITE_FIREBASE_API_KEY=your_key
   ```

## 📚 Learn More

- [Vite Documentation](https://vitejs.dev)
- [React Documentation](https://react.dev)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Google Vertex AI](https://cloud.google.com/vertex-ai)

## 📝 Notes

- Backend runs on `localhost:5001`
- Frontend runs on `localhost:5173`
- Firestore emulator on `localhost:8080`
- Firebase UI on `localhost:4000`

## 💡 MVP Priority

✅ **Must Build:**
- React web portal (Vercel)
- SHA-256 hashing client-side
- Vertex AI integration
- Gemini Flash provenance
- Firestore storage
- Tamper detection demo

⏳ **Nice to Have:**
- Polygon smart contract
- Firebase Cloud Messaging

❌ **Skip for MVP:**
- Full Circom ZK circuits
- Flutter mobile app
- IPFS storage

---

**Made with ❤️ for Google Solution Challenge 2026**
