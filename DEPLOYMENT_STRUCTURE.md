# Deployment Structure

## 📁 Project Organization

```
invoicer/
├── frontend/                    # 🚀 DEPLOYMENT 1: React Frontend
│   ├── src/                    # React app with Firebase auth
│   ├── package.json
│   └── vercel.json
│
├── backend/                     # 🚀 DEPLOYMENT 2: Node.js Backend
│   ├── src/                    # Backend services + cron jobs
│   ├── api/                    # Vercel serverless functions
│   ├── package.json
│   └── vercel.json
│
├── core-invoicer/              # 📦 SHARED: Original Invoicer Logic
│   ├── src/                    # Your original working code
│   ├── dist/                   # Compiled JavaScript
│   ├── package.json
│   └── tsconfig.json
│
└── [root files]               # Documentation, setup scripts
```

## 🚀 Deployment Strategy

### **Deployment 1: Frontend (Vercel)**

- **Purpose**: User interface for authentication and configuration
- **Technology**: React + Firebase
- **URL**: `https://your-frontend.vercel.app`
- **What it does**:
  - Google OAuth authentication
  - User settings (Google Sheet ID, Gmail label)
  - Stores user data in Firebase Firestore

### **Deployment 2: Backend (Vercel)**

- **Purpose**: Email monitoring and invoice processing
- **Technology**: Node.js + Vercel Functions
- **URL**: `https://your-backend.vercel.app`
- **What it does**:
  - Cron job runs every 10 minutes
  - Monitors Gmail for emails with user-specified labels
  - Downloads attachments and uploads to Drive
  - **Uses core-invoicer logic** for AI processing
  - Stores results in user's Google Sheet

### **Shared: Core-Invoicer**

- **Purpose**: Contains your original working invoice processing logic
- **Technology**: Your existing TypeScript code
- **Not deployed separately** - used by backend
- **What it contains**:
  - LlamaParse integration
  - Groq AI processing
  - Google Sheets/Drive logic
  - All your existing working code

## 🔄 How They Work Together

```
User Flow:
1. User visits Frontend → Signs in with Google → Configures settings
2. Backend cron job → Checks Gmail → Finds new emails
3. Backend → Downloads files → Uploads to Drive → Adds to source sheet
4. Backend → Uses core-invoicer logic → Processes with LlamaParse + Groq
5. Backend → Stores results in user's Google Sheet
```

## 📋 Deployment Steps

### **Step 1: Deploy Frontend**

```bash
# In Vercel Dashboard
1. Create new project
2. Connect GitHub repository
3. Set root directory: frontend
4. Add environment variables (Firebase config)
5. Deploy
```

### **Step 2: Deploy Backend**

```bash
# In Vercel Dashboard
1. Create new project
2. Connect same GitHub repository
3. Set root directory: backend
4. Add environment variables (Firebase + Google OAuth + LlamaParse + Groq)
5. Deploy
```

### **Step 3: Configure Cron Job**

```bash
# Backend automatically gets cron job from vercel.json
# Runs every 10 minutes: */10 * * * *
# Endpoint: /api/cron
```

## 🔧 Environment Variables

### **Frontend (.env)**

```bash
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_STORAGE_BUCKET=...
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
```

### **Backend (.env)**

```bash
# Firebase Admin
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Your existing invoicer config
LLAMAPARSE_API_KEY=...
LLAMAPARSE_PROJECT_ID=...
GROQ_API_KEY=...

# Optional
CRON_SECRET=...
```

## 🎯 Benefits of This Structure

1. **Clear Separation**: Each deployment has a specific purpose
2. **Independent Scaling**: Frontend and backend can scale separately
3. **Code Reuse**: Backend uses your existing core-invoicer logic
4. **Easy Maintenance**: Update frontend/backend independently
5. **Cost Effective**: Only pay for what you use

## 🚨 Important Notes

- **core-invoicer is NOT deployed separately** - it's used by the backend
- **Your existing logic is preserved** in core-invoicer folder
- **Backend references core-invoicer** using relative paths
- **Two separate Vercel projects** for frontend and backend
- **Same GitHub repository** for both deployments

This structure gives you the best of both worlds: your proven invoice processing logic with modern email automation and multi-user capabilities!
