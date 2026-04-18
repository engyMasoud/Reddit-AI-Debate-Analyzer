import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { pool } from './config/database';
import { errorHandler } from './middleware/errorHandler';

// Route imports
import { authRoutes } from './routes/auth.routes';
import { postRoutes } from './routes/posts.routes';
import { commentRoutes } from './routes/comments.routes';
import { subredditRoutes } from './routes/subreddits.routes';
import { userRoutes } from './routes/users.routes';
import { notificationRoutes } from './routes/notifications.routes';
import { composerRoutes } from './routes/composer.routes';

// Service imports
import { InMemoryCacheService } from './services/InMemoryCacheService';
import { MockAIAnalysisService } from './services/MockAIAnalysisService';

// Repository imports
import { CommentRepository } from './repositories/CommentRepository';
import { ReasoningSummaryRepository } from './repositories/ReasoningSummaryRepository';
import { DraftRepository } from './repositories/DraftRepository';
import { FeedbackLogRepository } from './repositories/FeedbackLogRepository';

// Service imports
import { ReasoningSummaryService } from './services/ReasoningSummaryService';
import { WritingFeedbackService } from './services/WritingFeedbackService';

// Controller imports
import { ReasoningSummaryController } from './controllers/ReasoningSummaryController';
import { WritingFeedbackController } from './controllers/WritingFeedbackController';

const app = express();

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
];

// In production, allow the Amplify domain (set via env var)
if (env.NODE_ENV === 'production' && process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// ── Shared services ──
const cacheService = new InMemoryCacheService();
const aiService = new MockAIAnalysisService();

// ── Repositories ──
const commentRepo = new CommentRepository(pool);
const summaryRepo = new ReasoningSummaryRepository(pool);
const draftRepo = new DraftRepository(pool);
const feedbackLogRepo = new FeedbackLogRepository(pool);

// ── Services ──
const reasoningSummaryService = new ReasoningSummaryService(
  aiService, cacheService, commentRepo, summaryRepo
);
const writingFeedbackService = new WritingFeedbackService(
  aiService, cacheService, feedbackLogRepo
);

// ── Controllers ──
const reasoningSummaryController = new ReasoningSummaryController(reasoningSummaryService);
const writingFeedbackController = new WritingFeedbackController(
  writingFeedbackService, draftRepo, feedbackLogRepo
);

// ── Routes ──
app.use('/api/v1/auth', authRoutes(pool));
app.use('/api/v1/posts', postRoutes(pool));
app.use('/api/v1/comments', commentRoutes(pool, reasoningSummaryController));
app.use('/api/v1/subreddits', subredditRoutes(pool));
app.use('/api/v1/users', userRoutes(pool));
app.use('/api/v1/notifications', notificationRoutes(pool));
app.use('/api/v1/composer', composerRoutes(writingFeedbackController));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

export { app, cacheService };
