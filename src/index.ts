import 'dotenv/config';
import express from 'express';
// @ts-ignore
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { verifyJWTMiddleware } from './services/jwt.js';
import aiRoutes from './routes/ai.js';
import medRoutes from './routes/medications.js';
import settingsRoutes from './routes/settings.js';
import userRoutes from './routes/users.js';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(verifyJWTMiddleware);

// Basic rate limit to avoid rapid-fire calls
const apiLimiter = rateLimit({
	windowMs: 60 * 1000, // 1 minute
	max: 10, // limit each IP to 10 requests per windowMs
});
app.use('/api', apiLimiter);

// Debug logging for incoming requests and x-user-id header
app.use((req, _res, next) => {
	console.log(req.method, req.url, 'x-user-id:', req.headers['x-user-id']);
	next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/ai', aiRoutes);
app.use('/api/medications', medRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', userRoutes);

app.listen(port, () => {
	console.log(`KnowDose backend running on http://localhost:${port}`);
});
