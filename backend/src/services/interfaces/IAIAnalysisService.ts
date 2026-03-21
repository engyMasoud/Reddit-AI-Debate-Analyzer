import { Claim } from '../../models/Claim';
import { EvidenceBlock } from '../../models/EvidenceBlock';
import { AnalysisResult } from '../../models/AnalysisResult';

export interface IAIAnalysisService {
  extractClaims(text: string): Promise<Claim[]>;
  extractEvidence(text: string): Promise<EvidenceBlock[]>;
  evaluateCoherence(claims: Claim[], evidence: EvidenceBlock[]): Promise<number>;
  generateSummary(analysis: AnalysisResult): Promise<string>;
}
