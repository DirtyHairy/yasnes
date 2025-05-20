import { UnreachableCaseError } from 'ts-essentials';
import { BreakReason } from '../break';
import { outdent } from 'outdent';
import { hex16, hex8 } from '../util';

export const INITIAL_STATE: State = {
    a: 0,
    x: 0,
    y: 0,
    pc: 0,
    s: 0x0100,
    d: 0,
    k: 0,
    dbr: 0,
    p: 0,
    slowPath: 0,
    mode: Mode.em,
    breakReason: BreakReason.none,
};

export const enum SlowPathReason {
    break = 0x01,
    modeChange = 0x02,
}

export interface State {
    a: number; // A
    x: number; // X
    y: number; // Y
    pc: number; // program counter
    s: number; // stack pointer
    d: number; // direct register
    k: number; // program bank << 16
    dbr: number; // data bank << 16
    p: number; // flags

    slowPath: number;
    mode: Mode;
    breakReason: BreakReason;
}

export const enum Mode {
    mx = 0x0, // 16 bit acc, 16 bit memory
    mX = 0x1, // 16 bit acc, 8 bit memory
    Mx = 0x2, // 8 bit acc, 16 bit memory
    MX = 0x3, // 8 bit acc, 8 bit memory
    em = 0x4, // emulation
}

export const enum Flag {
    c = 0x01, // carry
    z = 0x02, // zero
    i = 0x04, // disable interrupts
    d = 0x08, // decimal
    x = 0x10, // 16 bit memory
    m = 0x20, // 16 bit acc
    v = 0x40, // overflow
    n = 0x80, // negative
}

export function flagsToString(flags: number): string {
    const names = ['c', 'z', 'i', 'd', 'x', 'm', 'v', 'n'];

    return names.map((name, i) => (flags & (1 << i) ? name.toUpperCase() : name)).join('');
}

export function modeToString(mode: Mode): string {
    switch (mode) {
        case Mode.mx:
            return 'mx';

        case Mode.mX:
            return 'mX';

        case Mode.Mx:
            return 'Mx';

        case Mode.MX:
            return 'MX';

        case Mode.em:
            return 'em';

        default:
            throw new UnreachableCaseError(mode);
    }
}

export function copyState(dest: State, src: State): void {
    dest.a = src.a;
    dest.x = src.x;
    dest.y = src.y;
    dest.pc = src.pc;
    dest.s = src.s;
    dest.d = src.d;
    dest.k = src.k;
    dest.dbr = src.dbr;
    dest.p = src.p;
    dest.slowPath = src.slowPath;
    dest.mode = src.mode;
    dest.breakReason = src.breakReason;
}

export function compareState(state1: State, state2: State): boolean {
    // Compare all fields of the state objects
    return (
        state1.a === state2.a &&
        state1.x === state2.x &&
        state1.y === state2.y &&
        state1.pc === state2.pc &&
        state1.s === state2.s &&
        state1.d === state2.d &&
        state1.k === state2.k &&
        state1.dbr === state2.dbr &&
        state1.p === state2.p &&
        state1.slowPath === state2.slowPath &&
        state1.mode === state2.mode &&
        state1.breakReason === state2.breakReason
    );
}

export function stateToString(state: State): string {
    // prettier-ignore
    return outdent`
            A: ${hex16(state.a)}    X: ${hex16(state.x)}    Y: ${hex16(state.y)}    S: ${hex16(state.s)}    PC: ${hex16(state.pc)}
            D: ${hex16(state.d)}    K: ${hex8(state.k >> 16)}      DBR: ${hex8(state.dbr >> 16)}    flags: ${flagsToString(state.p)}${(state.mode === Mode.em) ? ' (em)' : '(nt)'}
        `;
}
