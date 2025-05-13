export function hex8(x: number): string {
    return '0x' + x.toString(16).padStart(2, '0');
}

export function hex16(x: number): string {
    return '0x' + x.toString(16).padStart(4, '0');
}

export function hex24(x: number): string {
    return '0x' + x.toString(16).padStart(6, '0');
}

export function hex32(x: number): string {
    return '0x' + x.toString(16).padStart(8, '0');
}

export function describeError(e: unknown): string {
    try {
        return (e as Error).message;
    } catch {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        return `${e}`;
    }
}
