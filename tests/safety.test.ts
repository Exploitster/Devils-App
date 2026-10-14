import { describe, expect, it } from 'vitest';
import { assessSafety } from '../src/lib/conversation/safety';
describe('safety',()=>{it.each(['I wish I would never wake up','I am going to end my life','Everyone would be better off without me'])('supports crisis paraphrase %s',text=>{expect(assessSafety(text).kind).toBe('crisis');});it('allows disagreement',()=>expect(assessSafety('I disagree with utilitarianism').kind).toBe('ordinary'));it('bounds qualified advice',()=>expect(assessSafety('Should I stop my medication?').kind).toBe('qualified'));});
