import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'params' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      (req as any)[source] = schema.parse(req[source]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const firstIssue = err.issues[0];
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: firstIssue.message,
          details: err.issues,
        });
        return;
      }
      next(err);
    }
  };
}
