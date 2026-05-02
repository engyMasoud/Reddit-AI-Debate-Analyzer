/**
 * Input validation utilities and schemas for the API.
 */

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Constants
export const CONSTRAINTS = {
  POST_TITLE_MIN: 5,
  POST_TITLE_MAX: 300,
  POST_CONTENT_MAX: 50000,
  COMMENT_TEXT_MIN: 1,
  COMMENT_TEXT_MAX: 10000,
  SUBREDDIT_NAME_MIN: 3,
  SUBREDDIT_NAME_MAX: 21,
  USERNAME_MIN: 3,
  USERNAME_MAX: 20,
  EMAIL_MAX: 254,
};

/**
 * Validate post title and content.
 */
export function validatePost(title?: string, content?: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (title !== undefined) {
    if (typeof title !== 'string') {
      errors.push({ field: 'title', message: 'Title must be a string' });
    } else if (title.trim().length < CONSTRAINTS.POST_TITLE_MIN) {
      errors.push({ field: 'title', message: `Title must be at least ${CONSTRAINTS.POST_TITLE_MIN} characters` });
    } else if (title.length > CONSTRAINTS.POST_TITLE_MAX) {
      errors.push({ field: 'title', message: `Title must not exceed ${CONSTRAINTS.POST_TITLE_MAX} characters` });
    }
  }

  if (content !== undefined) {
    if (content && typeof content !== 'string') {
      errors.push({ field: 'content', message: 'Content must be a string' });
    } else if (content && content.length > CONSTRAINTS.POST_CONTENT_MAX) {
      errors.push({ field: 'content', message: `Content must not exceed ${CONSTRAINTS.POST_CONTENT_MAX} characters` });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate comment text.
 */
export function validateComment(text?: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (text !== undefined) {
    if (typeof text !== 'string') {
      errors.push({ field: 'text', message: 'Comment text must be a string' });
    } else if (text.trim().length < CONSTRAINTS.COMMENT_TEXT_MIN) {
      errors.push({ field: 'text', message: 'Comment text must not be empty' });
    } else if (text.length > CONSTRAINTS.COMMENT_TEXT_MAX) {
      errors.push({ field: 'text', message: `Comment text must not exceed ${CONSTRAINTS.COMMENT_TEXT_MAX} characters` });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate emoji reaction.
 */
export function validateEmoji(emoji?: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (emoji !== undefined) {
    if (typeof emoji !== 'string') {
      errors.push({ field: 'emoji', message: 'Emoji must be a string' });
    } else if (emoji.length === 0 || emoji.length > 10) {
      errors.push({ field: 'emoji', message: 'Emoji must be between 1 and 10 characters' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate vote type.
 */
export function validateVoteType(voteType?: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (voteType !== undefined) {
    if (typeof voteType !== 'string') {
      errors.push({ field: 'voteType', message: 'Vote type must be a string' });
    } else if (voteType !== 'up' && voteType !== 'down') {
      errors.push({ field: 'voteType', message: "Vote type must be 'up' or 'down'" });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate debate side.
 */
export function validateDebateSide(side?: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (side !== undefined) {
    if (typeof side !== 'string') {
      errors.push({ field: 'side', message: 'Side must be a string' });
    } else if (side !== 'for' && side !== 'against') {
      errors.push({ field: 'side', message: "Side must be 'for' or 'against'" });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
