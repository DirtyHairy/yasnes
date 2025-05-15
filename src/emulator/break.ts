export const enum BreakReason {
    none,
    badRead,
    badWrite,
    instructionFault,
}

export type BreakCallback = (reason: BreakReason, message: string) => void;
