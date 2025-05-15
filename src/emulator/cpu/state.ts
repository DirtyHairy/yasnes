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
    mode: number;
    breakReason: number;
}

export const enum Mode {
    mx = 0x000, // 16 bit acc, 16 bit memory
    mX = 0x100, // 16 bit acc, 8 bit memory
    Mx = 0x200, // 8 bit acc, 16 bit memory
    MX = 0x300, // 8 bit acc, 8 bit memory
    em = 0x400, // emulation
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
