import dotenv from 'dotenv';
import express from 'express';

import { checkInHandler } from './handlers/checkIn.mjs';
import {
  activeHandler,
  dashboardAuth,
  resetActiveHandler,
  searchHandler,
  signupsTodayHandler,
  todayHandler,
} from './handlers/dashboard.mjs';
import { healthHandler } from './handlers/health.mjs';
import {
  manualSignOutHandler,
  signOutHandler,
} from './handlers/signOut.mjs';
import { signupHandler } from './handlers/signup.mjs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', healthHandler);
// Dashboard is served same-origin from App Runner; add CORS middleware if it moves to another domain.
app.get('/dashboard', (req, res) => {
  return res.sendFile('dashboard.html', { root: './src' });
});
app.post('/checkin', checkInHandler);
app.post('/signout', signOutHandler);
app.post('/signout/manual', dashboardAuth, manualSignOutHandler);
app.post('/signup', signupHandler);
app.post('/admin/reset-active', dashboardAuth, resetActiveHandler);
app.get('/dashboard/today', dashboardAuth, todayHandler);
app.get('/dashboard/active', dashboardAuth, activeHandler);
app.get('/dashboard/signups-today', dashboardAuth, signupsTodayHandler);
app.get('/members/search', dashboardAuth, searchHandler);

app.use((req, res) => {
  return res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

app.use((err, req, res, next) => {
  console.error(err);

  return res.status(err.statusCode || 500).json({
    error: err.expose ? err.message : 'Internal server error',
  });
});

app.listen(port, () => {
  console.log(`🏊 Swim Club server running on port ${port}`);
});
