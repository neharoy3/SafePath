# SafePath 🗺️📍

## ⚠️ Problem Statement

SafePath is a safety-focused navigation platform that helps users plan and travel more securely by providing real-time route safety scoring, community-driven safety reporting, and emergency SOS features with peer-to-peer responder coordination.

## 📝 Our Solution

SafePath addresses safety concerns during travel through:

- **Route Safety Scoring**: Analyzes geographic segments for safety hazards based on community reports, generating real-time danger scores for alternative routes
- **Safety Data**: Crowdsourced incident reports (harassment, theft, danger areas) mapped to geographic zones
- **SOS Alerts**: Emergency dispatch system that notifies nearby users in the same zone to provide immediate peer assistance
- **User Profiles**: Profile management with emergency contacts and credit-based helper incentives for SOS responses
- **SMS Integration**: Twilio-powered SMS notifications for emergency alerts and critical updates

## ⚙️ Tech Stack

**Frontend**

- React + React Router for UI and client-side routing
- Vite for fast bundling and development
- Firebase Authentication for user registration/login
- Firebase Firestore for user profile persistence
- Firebase Realtime Database for live updates
- Leaflet + React-Leaflet for map visualization
- Tailwind CSS for styling

**Backend**

- FastAPI (Python) for REST API
- SQLModel + SQLAlchemy for ORM and data modeling
- SQLite for local development database
- Twilio SDK for SMS notifications
- OSRM (OpenStreetMap Routing Machine) for route calculations
- Nominatim for location search and geocoding

**Integrations**

- Firebase (Auth, Firestore, Realtime DB)
- Twilio (SMS)
- OSRM (Routing)
- Nominatim (Geocoding)

## 🛠️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────┐
│           React Frontend (Vite)                     │
│  ├─ Auth: Firebase Authentication                   │
│  ├─ Components: Journey Planner, Map, SOS Panel     │
│  └─ Services: Location, Routes, Safety, SOS         │
└──────────────┬──────────────────────────────────────┘
               │ HTTPS/HTTP
               ▼
┌─────────────────────────────────────────────────────┐
│        FastAPI Backend (Port 8000)                  │
│  ├─ REST API: /api/routes, /api/search, /users      │
│  ├─ SOS System: /api/sos/alert, /respond, /resolve  │
│  ├─ Safety Data: Segments, Reports, Scores          │
│  └─ Database: SQLModel ORM with SQLite              │
└─────────────────────────────────────────────────────┘
               │
        ┌──────┼──────┬─────────┐
        ▼      ▼      ▼         ▼
     SQLite  OSRM  Nominatim  Twilio
      DB    Routes  Geocoding  SMS
```

### Core Modules

**Backend**

- `main.py`: FastAPI app, API endpoints (routes, search, users, SOS)
- `models.py`: SQLModel entities (`User`, `Segment`)
- `database.py`: Database engine and session setup
- `app/utils/`:
  - `segment_utils.py`: Geographic segment operations and safety scoring
  - `sos_utils.py`: SOS logic, proximity checks, distance calculations
  - `safety_data_service.py`: Aggregated safety data service
  - `sos_alert_service.py`: SOS notification and alert management

**Frontend**

- `src/App.jsx`: Main app routing
- `src/components/`: UI components (Auth, Journey Planner, Map, SOS, etc.)
- `src/config/firebase.js`: Firebase initialization via Vite env vars
- `src/utils/`:
  - `firebaseAuth.js`: Register/login/logout flows
  - `locationService.js`: Realtime location sharing via Firebase Realtime DB
  - `directionsService.js`: Route requests
  - `sosService.js`: SOS alert submission
  - `reportService.js`: Safety incident reporting
  - `safetyScore.js`: Client-side score calculation

## ⚡How To Run This

### Local Development

1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
# Runs on http://localhost:8000
```

2. Frontend

```powershell
cd fend
npm install
npm run dev
# Runs on http://localhost:5173
```

### 🔧 Environment Configuration

**Backend (.env)**

```
DATABASE_URL=sqlite:///./safejourney.db
TWILIO_ACCOUNT_SID=<your-sid>
TWILIO_AUTH_TOKEN=<your-token>
TWILIO_PHONE_NUMBER=<your-twilio-number>
```

**Frontend (.env)**

```
VITE_API_BASE_URL=http://localhost:8000
VITE_FIREBASE_API_KEY=your_firebase_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com
```

### Firebase Setup

- Configure frontend env values in `fend/.env` (do not commit real credentials)
- Keep placeholders only in `fend/.env.example`
- Enable Authentication (Email/Password), Firestore, and Realtime Database
- Restart Vite after env changes

## 📂 File Architecture

```
SafePath/
├─ backend/          # FastAPI server
│  ├─ .env.example
│  ├─ main.py
│  ├─ models.py
│  ├─ database.py
│  ├─ requirements.txt
│  └─ app/utils/     # Core services
├─ fend/             # React frontend
│  ├─ .env.example
│  ├─ src/
│  │  ├─ components/
│  │  ├─ utils/
│  │  ├─ config/
│  │  └─ App.jsx
│  ├─ package.json
│  └─ vite.config.js
└─ README.md
```

## 🛣️ API Endpoints

**Routes & Search**

- `POST /api/routes` - Get multiple route options with safety scores
- `GET /api/search` - Search locations by address
- `GET /route` - Fetch route geometry proxy

**Users**

- `POST /users/` - Create or update user profile
- `GET /api/users` - Get all users
- `GET /api/users/{uid}` - Get user details
- `POST /api/update-location` - Update user location
- `GET /api/user-location/{uid}` - Get user location
- `POST /api/update-emergency-contact` - Update emergency contact
- `GET /api/check-emergency-contact` - Check emergency contact status

**Safety**

- `POST /api/reports` - Submit safety report
- `GET /api/active-users` - Get active users near location
- `POST /api/seed-segments` - Seed map segments
- `GET /api/segments/{segment_id}/reports` - Get segment reports
- `GET /api/segments/by-location` - Get segment by coordinates

**SOS System**

- `POST /api/sos/alert` - Trigger SOS alert
- `POST /api/sos/respond` - Respond to SOS alert
- `POST /api/sos/resolve` - Resolve SOS alert
- `GET /api/sos/active` - Get active SOS alerts

**Health**

- `GET /health` - API health check
