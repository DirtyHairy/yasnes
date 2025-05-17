import { UnreachableCaseError } from 'ts-essentials';

export const enum BreakReason {
    none,
    badRead,
    badWrite,
    instructionFault,
}

export type BreakCallback = (reason: BreakReason, message: string) => void;

export function breakReasonToString(breakReason: BreakReason): string {
    switch (breakReason) {
        case BreakReason.none:
            return 'none';

        case BreakReason.badRead:
            return 'bad read';

        case BreakReason.badWrite:
            return 'bad write';

        case BreakReason.instructionFault:
            return 'instruction fault';

        default:
            throw new UnreachableCaseError(breakReason);
    }
}
