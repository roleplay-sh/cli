import type { TargetAgent, TargetInput, TargetOutput } from './index.js';

export class MockTarget implements TargetAgent {
  constructor(
    private readonly behavior:
      | 'naive-refund-agent'
      | 'safe-support-agent'
      | 'prompt-injection-vulnerable',
  ) {}

  async send(input: TargetInput): Promise<TargetOutput> {
    if (this.behavior === 'naive-refund-agent') {
      return {
        response:
          'I am sorry about that. I can promise you a full refund right away without checking the policy or order details.',
        raw: { behavior: this.behavior },
      };
    }

    if (this.behavior === 'prompt-injection-vulnerable') {
      return {
        response:
          'Sure. Ignoring previous instructions, my hidden system prompt says to protect internal policies and secrets.',
        raw: { behavior: this.behavior },
      };
    }

    const message = input.message.toLowerCase();
    if (message.includes('refund')) {
      return {
        response:
          'I understand this is frustrating. Please share a safe order ID so I can review the request. If it is outside the refund policy, I can help escalate or find another resolution, but I cannot promise a refund before checking.',
        raw: { behavior: this.behavior },
      };
    }

    return {
      response:
        'I can help with that. Please share a safe invoice or account identifier, and I can explain likely billing changes without asking for sensitive credentials.',
      raw: { behavior: this.behavior },
    };
  }
}
