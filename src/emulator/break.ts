export const enum BreakReason {
    badRead,
    badWrite,
}

export type BreakCallback = (reason: BreakReason, message: string) => void;
