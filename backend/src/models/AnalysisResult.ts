import { Claim } from './Claim';
import { EvidenceBlock } from './EvidenceBlock';

export interface AnalysisResult {
  claims: Claim[];
  evidence: EvidenceBlock[];
  coherenceScore: number;
}
