# Invoice Processor with Email Automation

A comprehensive invoice processing system that automatically monitors Gmail for invoices, processes them using AI, and stores the results in Google Sheets.

## Architecture

This project consists of three main components:

1. **Frontend** - React app with Firebase authentication for user configuration
2. **Backend** - Node.js cron service for email monitoring and processing
3. **Core Logic** - Existing invoice processing pipeline (LlamaParse + Groq AI)

## Features

- 🔐 **Google OAuth Authentication** - Secure login with Gmail, Drive, and Sheets access
- 📧 **Email Monitoring** - Automatic detection of invoices via Gmail labels
- 🤖 **AI Processing** - Intelligent invoice parsing using LlamaParse and Groq
- 📊 **Google Sheets Integration** - Automatic data storage and organization
- ⏰ **Cron Automation** - Runs every 10 minutes to check for new invoices
- 🔄 **Multi-user Support** - Each user can configure their own settings

## Project Structure

```
invoicer/
├── frontend/                 # 🚀 DEPLOYMENT 1: React Frontend
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── firebase/        # Firebase configuration
│   │   └── types/           # TypeScript type definitions
│   └── package.json
├── backend/                  # 🚀 DEPLOYMENT 2: Node.js Backend
│   ├── src/
│   │   ├── cron/            # Cron job logic
│   │   ├── services/        # Business logic services
│   │   ├── firebase/        # Firebase admin configuration
│   │   └── types/            # TypeScript type definitions
│   ├── api/                 # Vercel serverless functions
│   └── package.json
├── core-invoicer/           # 📦 SHARED: Original Invoicer Logic
│   ├── src/                 # Your original working code
│   ├── dist/                # Compiled JavaScript
│   └── package.json
└── [documentation files]
```

## Setup Instructions

### 1. Firebase Configuration

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable Authentication with Google provider
3. Enable Firestore database
4. Create a service account and download the JSON key

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or use existing one
3. Enable the following APIs:
   - Gmail API
   - Google Drive API
   - Google Sheets API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs for your domain

### 3. Environment Variables

#### Frontend (.env)

```bash
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

#### Backend (.env)

```bash
# Firebase Admin
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=your_service_account@project.iam.gserviceaccount.com

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# LlamaParse
LLAMAPARSE_API_KEY=your_llamaparse_api_key
LLAMAPARSE_PROJECT_ID=your_llamaparse_project_id

# Groq
GROQ_API_KEY=your_groq_api_key

# Optional
CRON_SECRET=your_optional_secret
```

### 4. Deployment

#### Frontend (Vercel)

1. Connect your GitHub repository to Vercel
2. Set the root directory to `frontend`
3. Add environment variables
4. Deploy

#### Backend (Vercel)

1. Create a separate Vercel project for the backend
2. Set the root directory to `backend`
3. Add environment variables
4. Deploy

## Usage

### For Users

1. **Sign In**: Visit the frontend URL and sign in with Google
2. **Configure Settings**:
   - Enter your Google Sheet ID (where results will be stored)
   - Set a Gmail label name (e.g., "Invoices")
3. **Set Up Gmail**: Create the specified label in Gmail and apply it to emails with invoice attachments
4. **Automatic Processing**: The system will check every 10 minutes for new emails with your label

### For Developers

#### Local Development

**Frontend:**

```bash
cd frontend
npm install
npm start
```

**Backend:**

```bash
cd backend
npm install
npm run dev
```

#### Testing the Cron Job

```bash
cd backend
npm run build
node dist/index.js
```

## How It Works

1. **User Authentication**: Users sign in with Google and grant permissions for Gmail, Drive, and Sheets
2. **Configuration**: Users specify their target Google Sheet and Gmail label for invoices
3. **Email Monitoring**: The cron job runs every 10 minutes and checks all active users
4. **Email Processing**: For each user, the system:
   - Searches Gmail for emails with the specified label
   - Downloads attachments from those emails
   - Uploads files to the user's Google Drive
   - Adds file links to the user's source Google Sheet
   - Triggers the existing invoice processing pipeline
5. **AI Processing**: The existing LlamaParse + Groq pipeline processes the invoices
6. **Data Storage**: Results are stored in the user's Google Sheet
7. **Cleanup**: Processed emails are marked to prevent reprocessing

## Security

- Firebase Authentication handles user authentication
- OAuth 2.0 provides secure access to Google services
- Each user's data is isolated in Firestore
- Environment variables store sensitive configuration
- Optional cron secret protects the API endpoint

## Monitoring

- Check Vercel function logs for cron job execution
- Monitor Firestore for user data and processing status
- Review Google Sheets for processed invoice data
- Check Gmail labels to see processed emails

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Check Google OAuth configuration and scopes
2. **Permission Denied**: Ensure service account has access to required APIs
3. **Rate Limits**: Monitor API usage and implement backoff strategies
4. **Missing Files**: Check Gmail label configuration and attachment detection

### Debug Steps

1. Check Vercel function logs
2. Verify environment variables
3. Test OAuth flow manually
4. Validate Gmail label exists
5. Check Google Sheet permissions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License.
