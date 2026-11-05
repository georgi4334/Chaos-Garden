import { BadRequestException } from '@nestjs/common';

export const FAULT_TYPES = ['latency', 'error', 'drop', 'corrupt'] as const;
export type FaultType = (typeof FAULT_TYPES)[number];

/**
 * Each fault type needs different parameters:
 *  - latency: { ms }       delay before forwarding (0..30000)
 *  - error:   { status }   respond with this HTTP status (400..599)
 *  - drop:    {}           close the connection without a response
 *  - corrupt: {}           return a malformed body
 * Returns the cleaned params, or throws 400.
 */
export function validateRuleParams(
  type: FaultType,
  params: Record<string, unknown> = {},
): Record<string, unknown> {
  switch (type) {
    case 'latency': {
      const ms = params.ms;
      if (!Number.isInteger(ms) || (ms as number) < 0 || (ms as number) > 30000) {
        throw new BadRequestException(
          'latency rules need params.ms: an integer between 0 and 30000',
        );
      }
      return { ms };
    }
    case 'error': {
      const status = params.status;
      if (!Number.isInteger(status) || (status as number) < 400 || (status as number) > 599) {
        throw new BadRequestException(
          'error rules need params.status: an integer between 400 and 599',
        );
      }
      return { status };
    }
    case 'drop':
    case 'corrupt':
      return {};
  }
}
