import OpenAI from 'openai';
import { IAIAnalysisService } from './interfaces/IAIAnalysisService';
import { Claim } from '../models/Claim';
import { EvidenceBlock } from '../models/EvidenceBlock';
import { AnalysisResult } from '../models/AnalysisResult';
import { FeedbackResult } from '../models/FeedbackResult';

/**
 * Production AI Analysis Service using OpenAI GPT-4.
 * Implements IAIAnalysisService with real LLM calls for reasoning analysis.
 */
export class AIAnalysisService implements IAIAnalysisService {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4-turbo') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async extractClaims(text: string): Promise<Claim[]> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `You are an expert argument analyzer. Extract the main claims from the provided text.
Return a JSON array of objects with the following shape:
[
  {
    "id": 1,
    "text": "the claim text",
    "supportingEvidence": ["evidence_type_1", "evidence_type_2"]
  }
]
Extract up to 3 main claims. Be concise.`,
        },
        {
          role: 'user',
          content: `Analyze this text and extract claims:\n\n${text}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    try {
      const content = response.choices[0]?.message?.content || '[]';
      const parsed = JSON.parse(content);
      return Array.isArray(parsed)
        ? parsed.map((c: any, idx: number) => ({
            id: c.id ?? idx + 1,
            text: c.text || '',
            supportingEvidence: Array.isArray(c.supportingEvidence)
              ? c.supportingEvidence
              : [],
          }))
        : [];
    } catch {
      // Fallback on parse error
      return [
        {
          id: 1,
          text: text.substring(0, 100),
          supportingEvidence: [],
        },
      ];
    }
  }

  async extractEvidence(text: string): Promise<EvidenceBlock[]> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `You are an expert argument analyzer. Identify evidence blocks in the provided text.
Return a JSON array of objects with the following shape:
[
  {
    "type": "study|data|anecdote|authority|other",
    "content": "description of evidence",
    "strength": "high|medium|low"
  }
]
Extract up to 5 evidence blocks. Be concise.`,
        },
        {
          role: 'user',
          content: `Analyze this text and extract evidence blocks:\n\n${text}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    try {
      const content = response.choices[0]?.message?.content || '[]';
      const parsed = JSON.parse(content);
      return Array.isArray(parsed)
        ? parsed.map((e: any) => ({
            type: (
              ['study', 'data', 'anecdote', 'authority', 'other'] as const
            ).includes(e.type)
              ? e.type
              : 'other',
            content: e.content || '',
            strength: (['high', 'medium', 'low'] as const).includes(
              e.strength
            )
              ? e.strength
              : 'low',
          }))
        : [];
    } catch {
      // Fallback on parse error
      return [
        {
          type: 'anecdote',
          content: 'Evidence extracted from text analysis',
          strength: 'medium',
        },
      ];
    }
  }

  async evaluateCoherence(
    claims: Claim[],
    evidence: EvidenceBlock[]
  ): Promise<number> {
    // If no claims or evidence, assume moderate coherence
    if (claims.length === 0 || evidence.length === 0) {
      return 0.6; // Moderate coherence for sparse arguments
    }

    const claimsText = claims.map((c) => c.text).join('; ');
    const evidenceText = evidence.map((e) => e.content).join('; ');

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert argument analyzer. Evaluate the coherence (logical consistency and structure) of the provided argument.
Return ONLY a JSON object with this exact structure:
{"score": <number between 0 and 1>}
Where 1.0 is perfectly coherent and 0.0 is completely incoherent.
Return nothing else.`,
          },
          {
            role: 'user',
            content: `Evaluate coherence for these claims and evidence:

Claims: ${claimsText}

Evidence: ${evidenceText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 50,
      });

      const content = response.choices[0]?.message?.content || '';
      
      // Try to extract a number from the response
      let score: number | null = null;
      
      // First try: parse as JSON
      try {
        const parsed = JSON.parse(content);
        score = parseFloat(parsed.score);
      } catch (e) {
        // Second try: extract number from text
        const match = content.match(/\d+\.?\d*/);
        if (match) {
          score = parseFloat(match[0]);
          score = Math.min(1, Math.max(0, score / 100)); // Normalize if needed
        }
      }

      if (score !== null && !Number.isNaN(score)) {
        return Math.min(1, Math.max(0, score));
      }

      // Default: return based on structure
      return Math.min(1, Math.max(0.3, (claims.length * 0.2 + evidence.length * 0.15)));
    } catch (err) {
      console.error('Error evaluating coherence:', err);
      // Fallback: estimate based on argument structure
      return Math.min(1, Math.max(0.3, (claims.length * 0.2 + evidence.length * 0.15)));
    }
  }

  async generateSummary(analysis: AnalysisResult): Promise<string> {
    const claimsText = analysis.claims.map((c) => c.text).join('; ');
    const evidenceText = analysis.evidence.map((e) => e.content).join('; ');

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `You are an expert argument summarizer. Generate a concise, neutral summary of the argument based on claims and evidence.
Keep the summary to 1-2 sentences. Be objective and avoid opinion.`,
        },
        {
          role: 'user',
          content: `Summarize this argument:

Claims: ${claimsText}

Evidence: ${evidenceText}

Coherence Score: ${analysis.coherenceScore}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    return (
      response.choices[0]?.message?.content ||
      'Unable to generate summary at this time.'
    );
  }

  async scoreDraft(text: string, context?: string): Promise<FeedbackResult | null> {
    const contextSection = context
      ? `\n\nPost context (what the debate is about):\n"""${context.substring(0, 400)}"""`
      : '';

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `Debate coach. Score a comment 0-100 and return ONLY JSON:
{"score":<0-100>,"issues":[{"type":"circular_logic|weak_evidence|unsupported_claim|logical_fallacy|off_topic","flaggedText":"<excerpt max 60 chars>","explanation":"<1 sentence>","severity":"low|medium|high","confidence":<0-1>}],"suggestions":[{"text":"<suggestion>","type":"structure|reference|clarity|tone","priority":"low|medium|high","exampleFix":"<example>"}],"goodPoints":["<strength>"]}
Scoring: 90-100=well-reasoned+evidence, 70-89=good minor gaps, 50-69=lacks evidence, 30-49=opinion only, 0-29=irrelevant/offensive. No markdown.`,
          },
          {
            role: 'user',
            content: `Context: ${context ? context.substring(0, 200) : 'general debate'}\nComment: "${text.substring(0, 500)}"`,
          },
        ],
        temperature: 0.2,
        max_tokens: 400,
      });

      const raw = response.choices[0]?.message?.content?.trim() || '';
      // Strip markdown code fences if present
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(clean);

      const score = Math.min(100, Math.max(0, Number(parsed.score) || 0)) / 100;

      const issues = Array.isArray(parsed.issues)
        ? parsed.issues.map((iss: any) => ({
            type: (['circular_logic', 'weak_evidence', 'unsupported_claim', 'logical_fallacy', 'off_topic'] as const)
              .includes(iss.type) ? iss.type : 'unsupported_claim',
            position: { start: 0, end: 0 },
            lineNumber: 1,
            flaggedText: String(iss.flaggedText || '').substring(0, 80),
            explanation: String(iss.explanation || ''),
            severity: (['low', 'medium', 'high'] as const).includes(iss.severity) ? iss.severity : 'medium',
            confidence: Math.min(1, Math.max(0, Number(iss.confidence) || 0.7)),
          }))
        : [];

      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map((s: any) => ({
            text: String(s.text || ''),
            type: (['structure', 'reference', 'clarity', 'tone'] as const).includes(s.type) ? s.type : 'clarity',
            priority: (['low', 'medium', 'high'] as const).includes(s.priority) ? s.priority : 'medium',
            exampleFix: String(s.exampleFix || ''),
          }))
        : [];

      const goodPoints: string[] = Array.isArray(parsed.goodPoints)
        ? parsed.goodPoints.map((p: any) => String(p))
        : (score >= 0.5 ? ['Argument submitted for review'] : []);

      return {
        score,
        issues,
        suggestions,
        goodPoints,
        confidence: 0.9,
        generatedAt: new Date(),
      };
    } catch (err) {
      console.error('[AIAnalysisService] scoreDraft error:', err);
      return null; // Caller falls back to regex pipeline
    }
  }
}
