@echo off
echo Starting AI Interview Practice Tool...

:: Start MongoDB (optional, if local)
start "MongoDB" mongod

:: Start Backend
start "Backend" cmd /k "cd backend && npm run dev"

:: Start Frontend
start "Frontend" cmd /k "cd frontend && npm run dev"

:: Open Browser
timeout /t 5
start http://localhost:5173

echo Project started!
