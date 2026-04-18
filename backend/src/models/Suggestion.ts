export interface Suggestion {
  text: string;
  type: 'improvement' | 'reference' | 'structure' | 'clarity';
  priority: 'high' | 'medium' | 'low';
  exampleFix: string;
  docLink?: string;
}
