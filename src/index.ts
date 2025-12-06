import express from 'express';
// @ts-ignore
import cors from 'cors';
import dotenv from 'dotenv';
import aiRoutes from './routes/ai.js';
import medRoutes from './routes/medications.js';
import settingsRoutes from './routes/settings.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/ai', aiRoutes);
app.use('/api/medications', medRoutes);
app.use('/api/settings', settingsRoutes);

app.listen(port, () => {
  console.log(`KnowDose backend running on http://localhost:${port}`);
});
