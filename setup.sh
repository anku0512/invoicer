#!/bin/bash

echo "🚀 Setting up Invoice Processor with Email Automation"
echo "=================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install core-invoicer dependencies
echo "📦 Installing core-invoicer dependencies..."
cd core-invoicer
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install core-invoicer dependencies"
    exit 1
fi
echo "✅ Core-invoicer dependencies installed"

# Build core-invoicer
echo "🔨 Building core-invoicer..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Failed to build core-invoicer"
    exit 1
fi
echo "✅ Core-invoicer built successfully"

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd ../frontend
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install frontend dependencies"
    exit 1
fi
echo "✅ Frontend dependencies installed"

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd ../backend
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install backend dependencies"
    exit 1
fi
echo "✅ Backend dependencies installed"

# Build backend
echo "🔨 Building backend..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Failed to build backend"
    exit 1
fi
echo "✅ Backend built successfully"

cd ..

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Configure Firebase project and get credentials"
echo "2. Set up Google Cloud Console with OAuth credentials"
echo "3. Copy env.example files and fill in your credentials:"
echo "   - frontend/.env (from frontend/env.example)"
echo "   - backend/.env (from backend/env.example)"
echo "4. Deploy to Vercel:"
echo "   - Frontend: Connect GitHub repo, set root to 'frontend'"
echo "   - Backend: Create separate project, set root to 'backend'"
echo ""
echo "📚 See README.md for detailed setup instructions"
