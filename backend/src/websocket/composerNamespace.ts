import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { WritingFeedbackService } from '../services/WritingFeedbackService';
import { WritingFeedbackSessionManager } from '../services/WritingFeedbackSessionManager';
import { DraftRepository } from '../repositories/DraftRepository';

export function setupComposerNamespace(
  io: SocketIOServer,
  feedbackService: WritingFeedbackService,
  sessionManager: WritingFeedbackSessionManager,
  draftRepo: DraftRepository,
  pool?: any, // PostgreSQL pool for fetching post context
): void {
  const composerNs = io.of('/composer');

  // Auth middleware for Socket.IO handshake
  composerNs.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number; username: string };
      (socket as any).userId = decoded.userId;
      (socket as any).username = decoded.username;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  composerNs.on('connection', (socket) => {
    const userId = (socket as any).userId as number;
    console.log(`Composer: user ${userId} connected (socket ${socket.id})`);

    // Register session
    const registered = sessionManager.registerSession(userId, socket.id);
    if (!registered) {
      socket.emit('feedback:error', {
        message: 'Maximum concurrent sessions reached. Please try again later.',
        code: 'SESSION_LIMIT',
      });
      socket.disconnect();
      return;
    }

    socket.join(`composer:${userId}`);

    // draft:analyze event
    socket.on('draft:analyze', async (payload: { draftText: string; contextId?: number }) => {
      try {
        const { draftText, contextId } = payload;

        if (!draftText || typeof draftText !== 'string' || draftText.length === 0 || draftText.length > 10000) {
          socket.emit('feedback:error', {
            message: 'draftText must be a non-empty string of at most 10,000 characters',
            code: 'INVALID_INPUT',
          });
          return;
        }

        // Always update the draft (latest version)
        sessionManager.updateDraft(userId, draftText);

        // Check if analysis is already in flight - if so, we'll re-analyze after it completes
        if (sessionManager.isAnalysisInFlight(userId)) {
          console.log(`[Composer] Analysis already in flight for user ${userId}, will re-analyze after completion`);
          return; // Queue implicit retry
        }

        sessionManager.markAnalysisInFlight(userId);

        try {
          // Fetch post context if contextId provided
          let postContext = '';
          if (contextId && pool) {
            try {
              const { rows } = await pool.query(
                'SELECT title, content FROM posts WHERE id = $1',
                [contextId],
              );
              if (rows.length > 0) {
                postContext = `Post Title: ${rows[0].title}\n\nPost Content: ${rows[0].content}`;
                console.log(`[Composer] Found post context for ID ${contextId}: "${rows[0].title}"`);
              } else {
                console.log(`[Composer] No post found for ID ${contextId}`);
              }
            } catch (err) {
              console.warn('Failed to fetch post context:', err);
            }
          } else {
            console.log(`[Composer] No contextId provided or pool unavailable`);
          }

          console.log(`[Composer] Analyzing draft (${draftText.length} chars) with context: ${postContext.length > 0 ? 'YES' : 'NO'}`);
          const { feedbackId, result } = await feedbackService.analyzeDraftAndLog(
            draftText,
            userId,
            undefined,
            postContext || undefined,
          );

          sessionManager.updateFeedback(userId, result);

          socket.emit('feedback:result', {
            feedbackId,
            issues: result.issues,
            score: result.score,
            suggestions: result.suggestions,
            goodPoints: result.goodPoints,
            confidence: result.confidence,
            generatedAt: result.generatedAt.toISOString(),
          });

          // CRITICAL: Clear the analysisInFlight flag after successful emission
          sessionManager.clearAnalysisInFlight(userId);
        } catch (err) {
          sessionManager.clearAnalysisInFlight(userId);
          console.error('Analysis error:', err);
          socket.emit('feedback:error', {
            message: 'Failed to analyze draft. Please try again.',
            code: 'ANALYSIS_FAILED',
          });
        }
      } catch (err) {
        console.error('draft:analyze handler error:', err);
      }
    });

    // draft:save event
    socket.on('draft:save', async (payload: { id?: number; text: string; contextId?: number }) => {
      try {
        const { text, contextId, id } = payload;

        if (!text || typeof text !== 'string' || text.length === 0) {
          socket.emit('feedback:error', {
            message: 'text is required for draft save',
            code: 'INVALID_INPUT',
          });
          return;
        }

        let row;
        if (id) {
          row = await draftRepo.updateText(id, text);
          if (!row) {
            row = await draftRepo.save({ userId, postId: contextId || null, text });
          }
        } else {
          row = await draftRepo.save({ userId, postId: contextId || null, text });
        }

        socket.emit('draft:saved', {
          id: row.id,
          createdAt: row.created_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
        });
      } catch (err) {
        console.error('draft:save error:', err);
        socket.emit('feedback:error', {
          message: 'Failed to save draft.',
          code: 'SAVE_FAILED',
        });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`Composer: user ${userId} disconnected`);
      sessionManager.removeSession(userId);
    });
  });
}
