import { BadRequestException } from '@nestjs/common';
import { validateRuleParams } from './rule-params.js';

describe('validateRuleParams', () => {
  it('accepts valid latency and error params and drops extras', () => {
    expect(validateRuleParams('latency', { ms: 250, junk: 1 })).toEqual({ ms: 250 });
    expect(validateRuleParams('error', { status: 503 })).toEqual({ status: 503 });
  });

  it('rejects bad latency values', () => {
    for (const params of [{}, { ms: -1 }, { ms: 30001 }, { ms: 1.5 }, { ms: '10' }]) {
      expect(() => validateRuleParams('latency', params)).toThrow(BadRequestException);
    }
  });

  it('rejects bad error status values', () => {
    for (const params of [{}, { status: 200 }, { status: 600 }, { status: '500' }]) {
      expect(() => validateRuleParams('error', params)).toThrow(BadRequestException);
    }
  });

  it('drop and corrupt take no params', () => {
    expect(validateRuleParams('drop', { anything: true })).toEqual({});
    expect(validateRuleParams('corrupt')).toEqual({});
  });
});
