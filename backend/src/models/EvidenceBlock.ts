export interface EvidenceBlock {
  type: 'study' | 'data' | 'anecdote' | 'authority' | 'other';
  content: string;
  strength: 'high' | 'medium' | 'low';
}
