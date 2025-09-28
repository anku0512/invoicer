# Frontend Environment Setup

## Environment Variables

Create a `.env` file in the `frontend` directory with the following variables:

```bash
# Firebase Configuration
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id

# Backend URL (replace with your actual backend URL)
REACT_APP_BACKEND_URL=https://your-backend-url.onrender.com
```

## Development vs Production

- **Development**: If `REACT_APP_BACKEND_URL` is not set, the app will use `http://localhost:3000`
- **Production**: Set `REACT_APP_BACKEND_URL` to your deployed backend URL (e.g., `https://your-backend-url.onrender.com`)

## Backend URL Examples

- **Render**: `https://your-app-name.onrender.com`
- **Vercel**: `https://your-app-name.vercel.app`
- **Railway**: `https://your-app-name.railway.app`
- **Heroku**: `https://your-app-name.herokuapp.com`

## Testing

To test with a different backend URL:

1. Set the environment variable:

   ```bash
   export REACT_APP_BACKEND_URL=https://your-backend-url.onrender.com
   ```

2. Restart the development server:

   ```bash
   npm start
   ```

3. Check the browser console for API calls to verify the correct backend URL is being used.
