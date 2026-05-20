import dotenv from 'dotenv';
import express from 'express';

import { checkInHandler } from './handlers/checkIn.mjs';
import {
  activeHandler,
  searchHandler,
  todayHandler,
} from './handlers/dashboard.mjs';
import { healthHandler } from './handlers/health.mjs';
import { signOutHandler } from './handlers/signOut.mjs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', healthHandler);
app.post('/checkin', checkInHandler);
app.post('/signout', signOutHandler);
app.get('/dashboard/today', todayHandler);
app.get('/dashboard/active', activeHandler);
app.get('/members/search', searchHandler);

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
