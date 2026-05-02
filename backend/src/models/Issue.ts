export interface Issue {
  type: 'circular_logic' | 'weak_evidence' | 'unsupported_claim' | 'logical_fallacy' | 'off_topic';
  position: { start: number; end: number };
  lineNumber: number;
  flaggedText: string;
  explanation: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number; // 0–1
}
