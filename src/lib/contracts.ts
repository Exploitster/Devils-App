import { z } from 'zod';

// Shared public shapes are strict: providers and browsers cannot add authority fields.
export const ModeSchema = z.enum(['business', 'philosophy']);
export type Mode = z.infer<typeof ModeSchema>;
export const TopicSchema = z.enum(['startup', 'work', 'life', 'beliefs']);
export type Topic = z.infer<typeof TopicSchema>;
export const IdSchema = z.string().min(1).max(128);
export const TextSchema = z.string().trim().min(1).max(12000);
export const SafeUrlSchema = z.string().url().refine(v => new URL(v).protocol === 'https:', 'HTTPS source required');
export const CitationSchema = z.object({ evidenceId: IdSchema, claimId: IdSchema, excerptId: IdSchema, kind: z.enum(['quote', 'paraphrase']), quote: z.string().max(6000).optional() }).strict();
export type Citation = z.infer<typeof CitationSchema>;
export const CounterpointSchema = z.object({ id: IdSchema, text: TextSchema, citations: z.array(CitationSchema).max(3), interpretation: z.string().max(3000).optional() }).strict();
export type Counterpoint = z.infer<typeof CounterpointSchema>;
export const ClarificationSchema = z.object({ id: IdSchema, question: z.string().min(1).max(1000), answer: z.string().max(12000).optional(), skipped: z.boolean().default(false) }).strict();
export const HandBackCardSchema = z.object({ id: IdSchema, version: z.number().int().positive(), sessionRevision: z.number().int().nonnegative(), position: TextSchema, strengths: z.array(TextSchema).max(5), counterpoints: z.array(CounterpointSchema).max(3), openQuestions: z.array(TextSchema).max(5), nextStep: TextSchema, closing: z.literal('Your call. Always.'), createdAt: z.string().datetime() }).strict();
export type HandBackCard = z.infer<typeof HandBackCardSchema>;
export const SessionStateSchema = z.object({ phase: z.enum(['description', 'clarifying', 'debate', 'card', 'support']), position: z.string().max(12000), underlyingQuestion: z.string().max(3000), clarifications: z.array(ClarificationSchema).max(3), strengths: z.array(TextSchema).max(5), counterpoints: z.array(CounterpointSchema).max(3), openQuestions: z.array(TextSchema).max(5), nextStep: z.string().max(3000), usedArgumentIds: z.array(IdSchema).max(200), usedEvidenceIds: z.array(IdSchema).max(200), coverageNote: z.string().max(2000).optional(), summary: z.string().max(6000) }).strict();
export type SessionState = z.infer<typeof SessionStateSchema>;
export const MessageSchema = z.object({ id: IdSchema, role: z.enum(['user', 'assistant']), text: TextSchema, createdAt: z.string().datetime(), operationId: IdSchema.optional(), citations: z.array(CitationSchema).max(9).default([]) }).strict();
export type Message = z.infer<typeof MessageSchema>;
export const SessionSchema = z.object({ id: IdSchema, ownerId: IdSchema, mode: ModeSchema, topic: TopicSchema, title: z.string().min(1).max(120), revision: z.number().int().nonnegative(), state: SessionStateSchema, messages: z.array(MessageSchema), cards: z.array(HandBackCardSchema), createdAt: z.string().datetime(), updatedAt: z.string().datetime() }).strict();
export type Session = z.infer<typeof SessionSchema>;
export const CreateSessionSchema = z.object({ mode: ModeSchema.default('business'), topic: TopicSchema, title: z.string().trim().min(1).max(120).optional() }).strict();
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
export const TurnRequestSchema = z.object({ operationId: IdSchema, expectedRevision: z.number().int().nonnegative(), text: TextSchema, action: z.enum(['message', 'skip', 'correction', 'pushback']).default('message') }).strict();
export type TurnRequest = z.infer<typeof TurnRequestSchema>;
export const CardRequestSchema = z.object({ operationId: IdSchema, expectedRevision: z.number().int().nonnegative() }).strict();
export const RenameSessionSchema = z.object({ title: z.string().trim().min(1).max(120), expectedRevision: z.number().int().nonnegative() }).strict();
const EmailSchema = z.string().trim().email().max(254).transform(v => v.toLowerCase());
const PasswordSchema = z.string().min(10, 'Use at least 10 characters for your password.').max(128);
export const AccountAuthSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('signup'), email: EmailSchema, password: PasswordSchema, name: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal('signin'), email: EmailSchema, password: z.string().min(1).max(128) }).strict(),
  z.object({ action: z.literal('google') }).strict(),
  z.object({ action: z.literal('reset'), email: EmailSchema }).strict(),
  z.object({ action: z.literal('resend'), email: EmailSchema }).strict(),
  z.object({ action: z.literal('update-password'), password: PasswordSchema }).strict(),
  z.object({ action: z.literal('complete-onboarding'), name: z.string().trim().min(1).max(80) }).strict(),
]);
export type AccountAuthRequest = z.infer<typeof AccountAuthSchema>;
export const AuthRequestSchema = z.object({ email: z.string().email().max(254) }).strict();

export const EvidenceExcerptSchema = z.object({ id: IdSchema, text: z.string().min(1).max(10000), sha256: z.string().regex(/^[a-f0-9]{64}$/), locator: z.string().min(1).max(1000), quoteAllowed: z.boolean() }).strict();
export const EvidenceClaimSchema = z.object({ id: IdSchema, text: TextSchema, excerptIds: z.array(IdSchema).min(1).max(10), topics: z.array(z.string().min(1).max(100)).min(1).max(30), status: z.literal('supported'), supportType: z.enum(['direct', 'interpretation']), paraphraseAllowed: z.boolean() }).strict();
export const EvidenceSchema = z.object({ id: IdSchema, mode: ModeSchema, title: TextSchema, url: SafeUrlSchema, sourceIdentifier: IdSchema, publisher: z.string().min(1).max(1000), publicationDate: z.string().max(100).nullable(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), limitations: z.array(TextSchema).max(20), author: z.string().max(300), work: z.string().max(1000), edition: z.string().max(1000), license: z.string().min(1).max(1000), status: z.enum(['draft', 'inspected', 'reviewed']), reviewedAt: z.string().datetime().nullable(), reviewedBy: z.string().max(200).nullable(), inspectedAt: z.string().datetime().nullable(), excerpts: z.array(EvidenceExcerptSchema).min(1).max(30), claims: z.array(EvidenceClaimSchema).min(1).max(30), business: z.object({ identity: TextSchema, attemptedBusiness: TextSchema, customer: z.string().max(1000), industry: z.string().max(1000), geography: z.string().max(1000), period: z.string().max(1000), outcome: TextSchema, reportedCauses: z.array(TextSchema).max(10) }).strict().optional() }).strict();
export type Evidence = z.infer<typeof EvidenceSchema>;
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;
export const ModelOutputSchema = z.object({ state: SessionStateSchema, response: TextSchema, citations: z.array(CitationSchema).max(9).default([]), card: HandBackCardSchema.optional() }).strict();
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

export interface Identity { id: string; email: string; name?: string; onboarded?: boolean; }
export interface UserProfile { id: string; email: string; disabled: boolean; deletionState: 'none' | 'pending' | 'complete'; createdAt: string; name?: string; onboarded?: boolean; }
export interface Invite { userId: string; expiresAt: string; enabled: boolean; }
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'paused';
export interface Subscription { provider?: 'dodo'|'stripe'; environment?: 'test_mode'|'live_mode'; verifiedPaymentId?: string; userId: string; customerId: string; subscriptionId: string; priceId: string; status: SubscriptionStatus; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; updatedAt: string; }
export interface AccessDecision { allowed: boolean; reason: 'free' | 'beta' | 'trial' | 'paid' | 'expired' | 'disabled' | 'unavailable'; expiresAt?: string; }
export interface UsageEvent { operationId: string; userId: string; sessionId: string; committedAt: string; inputTokens: number; outputTokens: number; costMicros: number; }
export interface SpendAttempt { id: string; operationId: string; userId: string; reservedMicros: number; actualMicros?: number; createdAt: string; }
export interface TurnOperation { id: string; userId: string; sessionId: string; fingerprint: string; expectedRevision: number; status: 'pending' | 'committed' | 'failed' | 'cancelled'; leaseExpiresAt: string; createdAt: string; resultRevision?: number; errorCode?: string; }
export interface ReserveTurnInput { userId: string; sessionId: string; operationId: string; expectedRevision: number; fingerprint: string; leaseExpiresAt: string; now: string; }
export type ReserveTurnResult = { kind: 'reserved'; operation: TurnOperation; session: Session } | { kind: 'duplicate'; operation: TurnOperation; session: Session };
export interface CommitTurnInput { userId: string; sessionId: string; operationId: string; expectedRevision: number; state: SessionState; messages: Message[]; card?: HandBackCard; usage: Omit<UsageEvent, 'operationId' | 'userId' | 'sessionId' | 'committedAt'>; now: string; }
export interface WebhookRecord { id: string; status: 'processing' | 'complete' | 'failed'; leaseExpiresAt: string; attempts: number; }

// Operations are owner-scoped; missing and foreign resources return the same error.
// reserve/commit/cancel must be atomic. Fingerprints reject changed duplicate payloads.
export interface Store {
  getProfile(userId: string): Promise<UserProfile | null>;
  putProfile(profile: UserProfile): Promise<void>;
  getInvite(userId: string): Promise<Invite | null>;
  putInvite(invite: Invite): Promise<void>;
  getSubscription(userId: string): Promise<Subscription | null>;
  putSubscription(subscription: Subscription): Promise<void>;
  findUserByCustomer(customerId: string): Promise<UserProfile | null>;
  createSession(userId: string, input: CreateSessionInput, now: string): Promise<Session>;
  listSessions(userId: string): Promise<Session[]>;
  getSession(userId: string, sessionId: string): Promise<Session>;
  renameSession(userId: string, sessionId: string, title: string, expectedRevision: number, now: string): Promise<Session>;
  deleteSession(userId: string, sessionId: string): Promise<void>;
  reserveTurn(input: ReserveTurnInput): Promise<ReserveTurnResult>;
  commitTurn(input: CommitTurnInput): Promise<Session>;
  failTurn(userId: string, sessionId: string, operationId: string, code: string): Promise<void>;
  cancelTurn(userId: string, sessionId: string, operationId: string): Promise<void>;
  getOperation(userId: string, sessionId: string, operationId: string): Promise<TurnOperation | null>;
  listUsage(userId: string, since: string): Promise<UsageEvent[]>;
  reserveSpend(attempt: SpendAttempt, dailyLimitMicros: number): Promise<void>;
  reconcileSpend(attemptId: string, actualMicros: number): Promise<void>;
  beginWebhook(eventId: string, now: string, leaseExpiresAt: string): Promise<'process' | 'duplicate' | 'pending'>;
  completeWebhook(eventId: string, subscription: Subscription | null, guard?: { customerId: string; token: string }): Promise<void>;
  failWebhook(eventId: string): Promise<void>;
  beginAccountDeletion(userId: string): Promise<void>;
  deleteAccountData(userId: string): Promise<void>;
}
export interface AuthService { authenticate(input: AccountAuthRequest, request: Request): Promise<Response>; getIdentity(request: Request): Promise<Identity | null>; signIn(email: string, request: Request): Promise<Response>; signOut(request: Request): Promise<Response>; deleteIdentity(userId: string): Promise<void>; }
export interface Clock { now(): Date; }
export interface EvidenceService { retrieve(input: { mode: Mode; query: string; excludeIds: string[]; limit: number }): Promise<Evidence[]>; get(id: string): Promise<Evidence | null>; validate(output: ModelOutput, retrieved: Evidence[]): Promise<ModelOutput>; }
export interface ModelInput { session: Session; request: TurnRequest | z.infer<typeof CardRequestSchema>; task: 'turn' | 'card'; evidence: Evidence[]; now: string; }
export interface ModelResult { output: unknown; inputTokens: number; outputTokens: number; costMicros: number; costKnown?: boolean; }
export interface ModelService { generate(input: ModelInput, signal: AbortSignal): Promise<ModelResult>; }
export interface BillingService { checkout(user: Identity, plan: 'monthly' | 'yearly'): Promise<{ url: string }>; portal(user: Identity): Promise<{ url: string }>; processWebhook(rawBody: string, signature: string): Promise<void>; cancelRenewal(userId: string): Promise<void>; }
export interface Services { auth: AuthService; store: Store; evidence: EvidenceService; model: ModelService; billing: BillingService; clock: Clock; }
