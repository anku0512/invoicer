# Render Deployment Guide

## 🚀 **Updated Deployment Strategy**

Since Vercel's free tier has limitations on cron jobs, we're using **Render** for the backend deployment.

## 📋 **Deployment Overview**

### **Frontend: Vercel**

- ✅ Free tier supports React apps
- ✅ Easy deployment
- ✅ Automatic HTTPS

### **Backend: Render**

- ✅ Free tier supports Node.js apps
- ✅ Built-in cron job support
- ✅ Persistent server (not serverless)

## 🔧 **Backend Changes Made**

### **1. Express Server**

- Created `backend/src/server.ts` with Express server
- Added health check endpoint: `/health`
- Added cron endpoint: `/api/cron`
- Added CORS support for frontend communication

### **2. Package.json Updates**

- Added Express and CORS dependencies
- Updated start command to use `server.js`
- Added TypeScript types for Express

### **3. Render Configuration**

- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Root Directory**: `backend`
- **Runtime**: Node.js

## 🚀 **Deployment Steps**

### **Step 1: Deploy Frontend (Vercel)**

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Create new project
3. Connect GitHub repository
4. Set root directory: `frontend`
5. Add Firebase environment variables
6. Deploy

### **Step 2: Deploy Backend (Render)**

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect GitHub repository
4. Configure:
   - **Name**: `invoicer-backend`
   - **Root Directory**: `backend`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Runtime**: Node.js
5. Add environment variables (Firebase + Google OAuth + LlamaParse + Groq)
6. Deploy

### **Step 3: Set Up Cron Job (Render)**

1. In Render Dashboard, go to "Cron Jobs"
2. Click "New Cron Job"
3. Configure:
   - **Name**: `invoicer-email-checker`
   - **Schedule**: `*/10 * * * *` (every 10 minutes)
   - **Command**: `curl -X GET https://your-backend-url.onrender.com/api/cron`
4. Save and activate

## 🔧 **Environment Variables**

### **Frontend (Vercel)**

```bash
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_STORAGE_BUCKET=...
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
```

### **Backend (Render)**

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

## 🎯 **Benefits of Render**

1. **Free Tier**: Supports Node.js apps with cron jobs
2. **Persistent Server**: Always running (not serverless)
3. **Built-in Cron**: No need for external cron services
4. **Easy Deployment**: Simple GitHub integration
5. **Logs**: Built-in logging and monitoring

## 🚨 **Important Notes**

- **Frontend**: Deploy to Vercel (free tier)
- **Backend**: Deploy to Render (free tier)
- **Cron Job**: Use Render's built-in cron job feature
- **Environment Variables**: Set in each platform's dashboard
- **Monitoring**: Check Render logs for backend issues

## 🔄 **How It Works**

1. **Frontend** (Vercel) → User authentication and configuration
2. **Backend** (Render) → Email monitoring and invoice processing
3. **Cron Job** (Render) → Triggers backend every 10 minutes
4. **Firebase** → Stores user data and settings

This setup gives you a robust, free-tier deployment with proper cron job support! 🚀
