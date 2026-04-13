import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './config/env';
import { pool } from './config/database';
import { app, cacheService } from './app';

// WebSocket-specific imports (not used in Lambda)
import { WritingFeedbackSessionManager } from './services/WritingFeedbackSessionManager';
import { WritingFeedbackService } from './services/WritingFeedbackService';
import { MockAIAnalysisService } from './services/MockAIAnalysisService';
import { InMemoryCacheService } from './services/InMemoryCacheService';
import { FeedbackLogRepository } from './repositories/FeedbackLogRepository';
import { DraftRepository } from './repositories/DraftRepository';
import { setupComposerNamespace } from './websocket/composerNamespace';

const server = http.createServer(app);

// Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ── WebSocket services (local dev only) ──
const wsAiService = new MockAIAnalysisService();
const wsCacheService = new InMemoryCacheService();
const sessionManager = new WritingFeedbackSessionManager();
const feedbackLogRepo = new FeedbackLogRepository(pool);
const draftRepo = new DraftRepository(pool);
const writingFeedbackService = new WritingFeedbackService(
  wsAiService, wsCacheService, feedbackLogRepo
);

setupComposerNamespace(io, writingFeedbackService, sessionManager, draftRepo);

// ── Start server ──
server.listen(env.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down...');
  cacheService.destroy();
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});

export { app, server, io };
