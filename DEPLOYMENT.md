# Deployment Guide

This guide will walk you through deploying the Invoice Processor with Email Automation to production.

## Prerequisites

- GitHub account
- Vercel account
- Firebase project
- Google Cloud Console project
- LlamaParse account
- Groq account

## Step 1: Firebase Setup

### 1.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create a project"
3. Enter project name (e.g., "invoice-processor")
4. Enable Google Analytics (optional)
5. Click "Create project"

### 1.2 Enable Authentication

1. In Firebase Console, go to "Authentication" > "Sign-in method"
2. Enable "Google" provider
3. Add your domain to authorized domains
4. Note down the Web API Key

### 1.3 Enable Firestore

1. Go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" (we'll secure it later)
4. Select a location close to your users

### 1.4 Create Service Account

1. Go to "Project Settings" > "Service accounts"
2. Click "Generate new private key"
3. Download the JSON file
4. Note down the values for environment variables

## Step 2: Google Cloud Console Setup

### 2.1 Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create new one)
3. Go to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth 2.0 Client IDs"
5. Choose "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:3000` (for development)
   - `https://your-frontend-domain.vercel.app` (for production)
7. Download the JSON file
8. Note down Client ID and Client Secret

### 2.2 Enable Required APIs

1. Go to "APIs & Services" > "Library"
2. Enable the following APIs:
   - Gmail API
   - Google Drive API
   - Google Sheets API

### 2.3 Configure OAuth Consent Screen

1. Go to "OAuth consent screen"
2. Choose "External" user type
3. Fill in required information:
   - App name: "Invoice Processor"
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/spreadsheets`
5. Add test users (your email)

## Step 3: LlamaParse Setup

1. Go to [LlamaParse](https://cloud.llamaindex.ai)
2. Create an account
3. Create a new project
4. Note down:
   - API Key
   - Project ID
   - Base URL (usually `https://api.cloud.llamaindex.ai`)

## Step 4: Groq Setup

1. Go to [Groq Console](https://console.groq.com)
2. Create an account
3. Generate an API key
4. Note down the API key

## Step 5: Deploy to Production

### 5.1 Deploy Frontend (Vercel)

1. Push your code to GitHub
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "New Project"
4. Import your GitHub repository
5. Configure project:
   - Framework Preset: Create React App
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `build`
6. Add environment variables:
   ```
   REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
   REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   REACT_APP_FIREBASE_PROJECT_ID=your_project_id
   REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   REACT_APP_FIREBASE_APP_ID=your_app_id
   ```
7. Deploy

### 5.2 Deploy Backend (Render)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure service:
   - **Name**: `invoicer-backend`
   - **Root Directory**: `backend`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Runtime**: Node.js
5. Add environment variables:
   ```
   FIREBASE_PROJECT_ID=your_firebase_project_id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key\n-----END PRIVATE KEY-----"
   FIREBASE_CLIENT_EMAIL=your_service_account@project.iam.gserviceaccount.com
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   LLAMAPARSE_API_KEY=your_llamaparse_api_key
   LLAMAPARSE_PROJECT_ID=your_llamaparse_project_id
   GROQ_API_KEY=your_groq_api_key
   CRON_SECRET=your_optional_secret
   ```
6. Deploy

### 5.3 Set Up Cron Job (Render Cron Jobs)

1. In Render Dashboard, go to "Cron Jobs"
2. Click "New Cron Job"
3. Configure:
   - **Name**: `invoicer-email-checker`
   - **Schedule**: `*/10 * * * *` (every 10 minutes)
   - **Command**: `curl -X GET https://your-backend-url.onrender.com/api/cron`
   - **Service**: Select your backend service
4. Save and activate

## Step 6: Configure Firestore Security Rules

1. Go to Firebase Console > Firestore Database > Rules
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Step 7: Test the System

### 7.1 Test Frontend

1. Visit your frontend URL
2. Sign in with Google
3. Configure your settings:
   - Google Sheet ID
   - Gmail label name
4. Verify data is saved in Firestore

### 7.2 Test Backend

1. Check Render service logs
2. Manually trigger the cron job:
   ```bash
   curl https://your-backend-url.onrender.com/api/cron
   ```
3. Verify it processes users correctly

### 7.3 Test End-to-End

1. Create a Gmail label (e.g., "Invoices")
2. Send yourself an email with an invoice attachment
3. Apply the label to the email
4. Wait 10 minutes for the cron job to run
5. Check your Google Sheet for processed data

## Step 8: Monitor and Maintain

### 8.1 Monitoring

- Check Render service logs regularly
- Monitor Firestore usage
- Watch for API rate limits
- Check Google Sheets for data quality
- Monitor Render cron job execution

### 8.2 Maintenance

- Update dependencies regularly
- Monitor costs (LlamaParse, Groq, Vercel)
- Review and optimize cron job performance
- Update OAuth consent screen as needed

## Troubleshooting

### Common Issues

1. **Authentication Errors**

   - Check OAuth configuration
   - Verify redirect URIs
   - Ensure scopes are correct

2. **Permission Denied**

   - Check service account permissions
   - Verify API access
   - Check Firestore security rules

3. **Cron Job Not Running**

   - Check Vercel cron configuration
   - Verify environment variables
   - Check function logs

4. **Email Processing Issues**
   - Verify Gmail label exists
   - Check attachment detection
   - Review API quotas

### Debug Steps

1. Check Vercel function logs
2. Test OAuth flow manually
3. Verify all environment variables
4. Check Google API quotas
5. Review Firestore data

## Security Considerations

1. **Environment Variables**: Never commit secrets to git
2. **OAuth Scopes**: Only request necessary permissions
3. **Firestore Rules**: Restrict access to user data only
4. **API Keys**: Rotate keys regularly
5. **Cron Secret**: Use optional authentication for cron endpoint

## Cost Optimization

1. **LlamaParse**: Monitor usage and optimize batch sizes
2. **Groq**: Use appropriate model for your needs
3. **Vercel**: Monitor function execution time
4. **Google APIs**: Stay within free tier limits

## Scaling Considerations

1. **User Growth**: Monitor Firestore read/write limits
2. **Email Volume**: Consider batch processing
3. **API Limits**: Implement rate limiting
4. **Storage**: Monitor Google Drive usage

This deployment guide should get your Invoice Processor with Email Automation up and running in production. Remember to test thoroughly and monitor the system after deployment.
