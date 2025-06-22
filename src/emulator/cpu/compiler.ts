import indentString from 'indent-string';
import { outdent } from 'outdent';
import { Flag, Mode, SlowPathReason } from './state';
import { AddressingMode } from './addressingMode';
import { BreakReason } from '../break';
import { hex16 } from '../util';

export const enum CompilationFlags {
    none = 0,
}

export const READ_PC = 'bus.read(state.k | state.pc, breakCb)';
export const INCREMENT_PC = 'state.pc = (state.pc + 1) & 0xffff';

export function is16_M(mode: Mode): boolean {
    switch (mode) {
        case Mode.mX:
        case Mode.mx:
            return true;

        default:
            return false;
    }
}

export function is16_X(mode: Mode): boolean {
    switch (mode) {
        case Mode.Mx:
        case Mode.mx:
            return true;

        default:
            return false;
    }
}

export class Compiler {
    private chunks: Array<string> = [];
    private opDeclared = false;

    constructor(private flags: number) {}

    add(chunk: string): Compiler {
        this.chunks.push(chunk);

        return this;
    }

    loadPointer(mode: Mode, addressingMode: AddressingMode, forStore = false): Compiler {
        switch (addressingMode) {
            case AddressingMode.abs:
                this.chunks.push(outdent`
                    let ptr = ${READ_PC};
                    ${INCREMENT_PC};

                    ptr |= (${READ_PC}) << 8;
                    ${INCREMENT_PC};

                    ptr |= state.dbr;
                    `);

                return this;

            case AddressingMode.abs_x:
                this.chunks.push(
                    outdent`
                    let ptr = ${READ_PC};
                    ${INCREMENT_PC};

                    ptr |= (${READ_PC}) << 8;
                    ${INCREMENT_PC};

                    ptr |= state.dbr;
                    ptr = (ptr + state.x) & 0xffffff;
                    `,
                );

                if (mode === Mode.Mx || mode === Mode.mx || forStore) {
                    this.chunks.push(`clock.tickCpu();`);
                } else {
                    this.chunks.push(`if ((ptr & 0xff) < state.x) clock.tickCpu();`);
                }

                return this;

            case AddressingMode.abs_y:
                this.chunks.push(outdent`
                    let ptr = ${READ_PC};
                    ${INCREMENT_PC};

                    ptr |= (${READ_PC}) << 8;
                    ${INCREMENT_PC};

                    ptr |= state.dbr;
                    ptr = (ptr + state.y) & 0xffffff;
                    `);

                if (mode === Mode.Mx || mode === Mode.mx || forStore) {
                    this.chunks.push(`clock.tickCpu();`);
                } else {
                    this.chunks.push(`if ((ptr & 0xff) < state.y) clock.tickCpu();`);
                }

                return this;

            case AddressingMode.abs_16:
                this.chunks.push(
                    outdent`
                    let ptr0 = ${READ_PC};
                    ${INCREMENT_PC};

                    ptr0 |= (${READ_PC}) << 8;
                    ${INCREMENT_PC};

                    let ptr = bus.read(ptr0, breakCb);
                    ptr |= bus.read((ptr0 + 1) & 0xffff, breakCb) << 8;
                    `,
                );

                return this;

            case AddressingMode.abs_x_16:
                this.chunks.push(
                    outdent`
                    let ptr0 = ${READ_PC};
                    ${INCREMENT_PC};

                    ptr0 |= (${READ_PC}) << 8;
                    ${INCREMENT_PC};

                    clock.tickCpu();

                    ptr0 = (ptr0 + state.x) & 0xffff;

                    let ptr = bus.read(state.k | ptr0, breakCb);
                    ptr |= bus.read(state.k | ((ptr0 + 1) & 0xffff), breakCb) << 8;
                    `,
                );

                return this;

            case AddressingMode.abs_24:
                this.chunks.push(
                    outdent`
                    let ptr0 = ${READ_PC};
                    ${INCREMENT_PC};

                    ptr0 |= (${READ_PC}) << 8;
                    ${INCREMENT_PC};

                    let ptr = bus.read(ptr0, breakCb);
                    ptr0 = (ptr0 + 1) & 0xffff;

                    ptr |= bus.read(ptr0, breakCb) << 8;
                    ptr0 = (ptr0 + 1) & 0xffff;

                    ptr |= bus.read(ptr0, breakCb) << 16;
                    `,
                );

                return this;

            case AddressingMode.direct:
                this.chunks.push(outdent`
                        let ptr = (${READ_PC} + state.d) & 0xffff;
                        ${INCREMENT_PC};

                        if (state.d & 0xff) clock.tickCpu();
                        `);

                return this;

            case AddressingMode.direct_x:
                this.chunks.push(outdent`
                        let ptr = ${READ_PC};
                        ${INCREMENT_PC};
                        `);

                if (mode === Mode.em) {
                    this.chunks.push(outdent`
                        if (state.d & 0xff) {
                            ptr = (ptr + state.d + state.x) & 0xffff;
                            clock.tickCpu_N(2);
                        } else {
                            ptr = ((ptr + state.x) & 0xff) | state.d;
                            clock.tickCpu();
                        }
                        `);
                } else {
                    this.chunks.push(outdent`
                        ptr = (ptr + state.d + state.x) & 0xffff;
                        if (state.d & 0xff) clock.tickCpu_N(2);
                        else clock.tickCpu();
                        `);
                }

                return this;

            case AddressingMode.direct_y:
                this.chunks.push(outdent`
                        let ptr = ${READ_PC};
                        ${INCREMENT_PC};
                        `);

                if (mode === Mode.em) {
                    this.chunks.push(outdent`
                        if (state.d & 0xff) {
                            ptr = (ptr + state.d + state.y) & 0xffff;
                            clock.tickCpu_N(2);
                        } else {
                            ptr = ((ptr + state.y) & 0xff) | state.d;
                            clock.tickCpu();
                        }
                        `);
                } else {
                    this.chunks.push(outdent`
                        ptr = (ptr + state.d + state.y) & 0xffff;
                        if (state.d & 0xff) clock.tickCpu_N(2);
                        else clock.tickCpu();
                        `);
                }

                return this;

            case AddressingMode.direct_16:
                this.chunks.push(outdent`
                        let ptr0 = (${READ_PC} + state.d) & 0xffff;
                        ${INCREMENT_PC};

                        let ptr = bus.read(ptr0, breakCb);
                    `);

                if (mode === Mode.em) {
                    this.chunks.push(outdent`
                            if (state.d & 0xff) {
                                clock.tickCpu();
                                ptr0 = (ptr0 + 1) & 0xffff;    
                            } else {
                                ptr0 = state.d | ((ptr0 + 1) & 0xff);
                            }
                        `);
                } else {
                    this.chunks.push(outdent`
                            if (state.d & 0xff) clock.tickCpu();
                            ptr0 = (ptr0 + 1) & 0xffff;
                        `);
                }

                this.chunks.push(outdent`
                        ptr |= bus.read(ptr0, breakCb) << 8;
                        ptr = (ptr | state.dbr);
                    `);

                return this;

            case AddressingMode.direct_24:
                this.chunks.push(outdent`
                        let ptr0 = (${READ_PC} + state.d) & 0xffff;
                        ${INCREMENT_PC};

                        if (state.d & 0xff) clock.tickCpu();

                        let ptr = bus.read(ptr0, breakCb);
                        ptr |= bus.read((ptr0 + 1) & 0xffff, breakCb) << 8;
                        ptr |= bus.read((ptr0 + 2) & 0xffff, breakCb) << 16;
                    `);

                return this;

            case AddressingMode.direct_x_16:
                this.chunks.push(outdent`
                        let ptr0 = ${READ_PC};
                        ${INCREMENT_PC};
                    `);

                if (mode === Mode.em) {
                    this.chunks.push(outdent`
                            let ptr;

                            if (state.d & 0xff) {
                                ptr0 = (ptr0 + state.d + state.x) & 0xffff;
                                clock.tickCpu_N(2);
                                
                                ptr = bus.read(ptr0, breakCb);
                                ptr |= bus.read((ptr0 + 1) & 0xffff, breakCb) << 8;
                            } else {
                                ptr0 = ptr0 + state.x;
                                clock.tickCpu();
                                
                                ptr = bus.read((ptr0 & 0xff) | state.d, breakCb);
                                ptr |= bus.read(((ptr0 + 1) & 0xff) | state.d, breakCb) << 8;
                            }

                            ptr |= state.dbr;
                        `);
                } else {
                    this.chunks.push(outdent`
                            ptr0 = (ptr0 + state.d + state.x) & 0xffff;

                            if (state.d & 0xff) clock.tickCpu_N(2);
                            else clock.tickCpu();
                            
                            let ptr = bus.read(ptr0, breakCb);
                            ptr |= bus.read((ptr0 + 1) & 0xffff, breakCb) << 8;

                            ptr |= state.dbr;
                        `);
                }

                return this;

            case AddressingMode.direct_y_16:
                this.chunks.push(outdent`
                        let ptr0 = (${READ_PC} + state.d) & 0xffff;
                        ${INCREMENT_PC};

                        let ptr = bus.read(ptr0, breakCb);
                    `);

                if (mode === Mode.em) {
                    this.chunks.push(outdent`
                            if (state.d & 0xff) {
                                clock.tickCpu();
                                ptr0 = (ptr0 + 1) & 0xffff;    
                            } else {
                                ptr0 = state.d | ((ptr0 + 1) & 0xff);
                            }
                        `);
                } else {
                    this.chunks.push(outdent`
                            if (state.d & 0xff) clock.tickCpu();
                            ptr0 = (ptr0 + 1) & 0xffff;
                        `);
                }

                this.chunks.push(outdent`
                        ptr |= bus.read(ptr0, breakCb) << 8;
                        ptr = ((ptr | state.dbr) + state.y) & 0xffffff;
                    `);

                if (mode === Mode.Mx || mode === Mode.mx || forStore) {
                    this.chunks.push(`clock.tickCpu();`);
                } else {
                    this.chunks.push(`if ((ptr & 0xff) < state.y) clock.tickCpu();`);
                }

                return this;

            case AddressingMode.direct_y_24:
                this.chunks.push(outdent`
                        let ptr0 = (${READ_PC} + state.d) & 0xffff;
                        ${INCREMENT_PC};

                        if (state.d & 0xff) clock.tickCpu();

                        let ptr = bus.read(ptr0, breakCb);
                        ptr |= bus.read((ptr0 + 1) & 0xffff, breakCb) << 8;
                        ptr |= bus.read((ptr0 + 2) & 0xffff, breakCb) << 16;

                        ptr = (ptr  + state.y) & 0xffffff;
                    `);

                return this;

            case AddressingMode.stack:
                this.chunks.push(outdent`
                        let ptr = (${READ_PC} + state.s) & 0xffff;
                        ${INCREMENT_PC};

                        clock.tickCpu();
                    `);

                return this;

            case AddressingMode.stack_y_16:
                this.chunks.push(outdent`
                        let ptr0 = (${READ_PC} + state.s) & 0xffff;
                        ${INCREMENT_PC};

                        clock.tickCpu();

                        let ptr = bus.read(ptr0, breakCb);
                        ptr |= bus.read((ptr0 + 1) & 0xffff, breakCb) << 8;
                        
                        ptr = ((ptr | state.dbr) + state.y) & 0xffffff;

                        clock.tickCpu();
                    `);

                return this;

            case AddressingMode.long:
                this.chunks.push(outdent`
                        let ptr = ${READ_PC};
                        ${INCREMENT_PC};

                        ptr |= (${READ_PC}) << 8;
                        ${INCREMENT_PC};

                        ptr |= (${READ_PC}) << 16;
                        ${INCREMENT_PC};
                    `);

                return this;

            case AddressingMode.long_x:
                this.chunks.push(outdent`
                        let ptr = ${READ_PC};
                        ${INCREMENT_PC};

                        ptr |= (${READ_PC}) << 8;
                        ${INCREMENT_PC};

                        ptr |= (${READ_PC}) << 16;
                        ${INCREMENT_PC};

                        ptr = (ptr + state.x) & 0xffffff;
                    `);

                return this;

            case AddressingMode.rel16:
                this.chunks.push(outdent`
                        let ptr = ${READ_PC};
                        ${INCREMENT_PC};

                        ptr |= ${READ_PC} << 8;
                        ${INCREMENT_PC};

                        ptr = (state.pc + ((ptr << 16) >> 16)) & 0xffff;
                    `);

                return this;

            default:
                this.chunks.push(outdent`
                        let ptr = 0;
                        breakCb(${BreakReason.instructionFault}, 'load pointer for ${addressingMode} not implemented');
                    `);
                return this;
        }
    }

    store8ToPtr(value: string): Compiler {
        this.chunks.push(`bus.write(ptr, ${value}, breakCb);`);
        return this;
    }

    store16ToPtr(value: string, addressingMode: AddressingMode): Compiler {
        switch (addressingMode) {
            case AddressingMode.direct:
            case AddressingMode.direct_x:
            case AddressingMode.direct_y:
                this.chunks.push(outdent`
                        bus.write(ptr, ${value} & 0xff, breakCb);
                        bus.write((ptr + 1) & 0xffff, ${value} >>> 8, breakCb);
                    `);

                return this;

            default:
                this.chunks.push(outdent`
                        bus.write(ptr, ${value} & 0xff, breakCb);
                        bus.write((ptr + 1) & 0xffffff, ${value} >>> 8, breakCb);
                    `);

                return this;
        }
    }

    store8(value: string, mode: Mode, addressingMode: AddressingMode): Compiler {
        return this.loadPointer(mode, addressingMode, true).store8ToPtr(value);
    }

    store16(value: string, mode: Mode, addressingMode: AddressingMode): Compiler {
        return this.loadPointer(mode, addressingMode, true).store16ToPtr(value, addressingMode);
    }

    store(value: string, mode: Mode, addressingMode: AddressingMode, is16: boolean): Compiler {
        if (is16) return this.store16(value, mode, addressingMode);
        else return this.store8(value, mode, addressingMode);
    }

    load8FromPtr(): Compiler {
        this.chunks.push(`${this.op()} = bus.read(ptr, breakCb);`);
        return this;
    }

    load16FromPtr(addressingMode: AddressingMode): Compiler {
        switch (addressingMode) {
            case AddressingMode.direct:
            case AddressingMode.direct_x:
            case AddressingMode.direct_y:
                this.chunks.push(
                    `${this.op()} = bus.read(ptr, breakCb) | (bus.read((ptr + 1) & 0xffff, breakCb) << 8);`,
                );

                return this;

            default:
                this.chunks.push(
                    `${this.op()} = bus.read(ptr, breakCb) | (bus.read((ptr + 1) & 0xffffff, breakCb) << 8);`,
                );
                return this;
        }
    }

    load8(mode: Mode, addressingMode: AddressingMode, forRmw = false): Compiler {
        if (addressingMode === AddressingMode.imm) {
            this.chunks.push(outdent`
                    ${this.op()} = ${READ_PC};
                    ${INCREMENT_PC};
                `);

            return this;
        }

        return this.loadPointer(mode, addressingMode, forRmw).load8FromPtr();
    }

    load16(mode: Mode, addressingMode: AddressingMode, forRmw = false): Compiler {
        if (addressingMode === AddressingMode.imm) {
            this.chunks.push(outdent`
                    ${this.op()} = ${READ_PC};
                    ${INCREMENT_PC};

                    op |= (${READ_PC}) << 8;
                    ${INCREMENT_PC};
                `);

            return this;
        }

        return this.loadPointer(mode, addressingMode, forRmw).load16FromPtr(addressingMode);
    }

    load(mode: Mode, addressingMode: AddressingMode, is16: boolean, forRmw = false): Compiler {
        if (is16) return this.load16(mode, addressingMode, forRmw);
        else return this.load8(mode, addressingMode, forRmw);
    }

    rmw(mode: Mode, addressingMode: AddressingMode, is16: boolean, operation: string): Compiler {
        if (addressingMode === AddressingMode.implied) {
            this.chunks.push(is16 ? `${this.op()} = state.a;` : `${this.op()} = state.a & 0xff;`);
        } else {
            this.load(mode, addressingMode, is16, true);
        }

        this.chunks.push(operation);
        this.tick();

        if (addressingMode === AddressingMode.implied) {
            this.chunks.push(is16 ? 'state.a = res;' : 'state.a = (state.a & 0xff00) | res;');
        } else {
            if (is16) this.store16ToPtr('res', addressingMode);
            else this.store8ToPtr('res');
        }

        return this;
    }

    setFlagsNZ(value: string, is16: boolean): Compiler {
        this.chunks.push(
            is16
                ? `state.p = (state.p & (${~(Flag.z | Flag.n)})) | ((${value} >>> 8) & ${Flag.n}) | (${value} === 0 ? ${Flag.z} : 0);`
                : `state.p = (state.p & (${~(Flag.z | Flag.n)})) | (${value} & ${Flag.n}) | (${value} === 0 ? ${Flag.z} : 0);`,
        );

        return this;
    }

    branch(mode: Mode, condition?: string): Compiler {
        const tickBranch =
            mode === Mode.em
                ? `if ((dest & 0xff00) !== (state.pc & 0xff00)) clock.tickCpu_N(2); else clock.tickCpu();`
                : `clock.tickCpu();`;

        const takeBranch = outdent`
            const ofs = ${READ_PC};
            ${INCREMENT_PC};

            const dest = (state.pc + ((ofs << 24) >> 24)) & 0xffff;

            ${tickBranch}

            state.pc = dest;
        `;

        if (condition === undefined) {
            this.add(takeBranch);
        } else {
            this.add(outdent`
                    if (${condition}) {
                    ${indentString(takeBranch, 4)}
                    } else {
                        ${READ_PC};
                        ${INCREMENT_PC};
                    }
                `);
        }

        return this;
    }

    push8(mode: Mode, value: string): Compiler {
        if (mode === Mode.em) {
            this.chunks.push(outdent`
                    bus.write(state.s, ${value}, breakCb);
                    state.s = (state.s & 0xff00) | ((state.s - 1) & 0xff);
                `);
        } else {
            this.chunks.push(outdent`
                    bus.write(state.s, ${value}, breakCb);
                    state.s = (state.s - 1) & 0xffff;
                `);
        }

        return this;
    }

    push16(mode: Mode, value: string): Compiler {
        this.push8(mode, `${value} >>> 8`);
        return this.push8(mode, `${value} & 0xff`);
    }

    pull8(mode: Mode): Compiler {
        if (mode === Mode.em) {
            this.chunks.push(outdent`
                    state.s = (state.s & 0xff00) | ((state.s + 1) & 0xff);
                    ${this.op()} = bus.read(state.s, breakCb);
                `);
        } else {
            this.chunks.push(outdent`
                    state.s = (state.s + 1) & 0xffff;
                    ${this.op()} = bus.read(state.s, breakCb);
                `);
        }

        return this;
    }

    pull16(mode: Mode): Compiler {
        if (mode === Mode.em) {
            this.chunks.push(outdent`
                    state.s = (state.s & 0xff00) | ((state.s + 1) & 0xff);
                    ${this.op()} = bus.read(state.s, breakCb);

                    state.s = (state.s & 0xff00) | ((state.s + 1) & 0xff);
                    op |= bus.read(state.s, breakCb) << 8;
                `);
        } else {
            this.chunks.push(outdent`
                    state.s = (state.s + 1) & 0xffff;
                    ${this.op()} = bus.read(state.s, breakCb);

                    state.s = (state.s + 1) & 0xffff;
                    op |= bus.read(state.s, breakCb) << 8;
                `);
        }

        return this;
    }

    fixupSP(mode: Mode): Compiler {
        if (mode === Mode.em) this.chunks.push('state.s = (state.s & 0xff) | 0x0100');

        return this;
    }

    vector(mode: Mode, addressNative: number, addressEmulation: number, brk = false): Compiler {
        this.chunks.push(outdent`
                ${READ_PC};
                ${INCREMENT_PC};
            `);

        if (mode === Mode.em) {
            this.push16(mode, 'state.pc');

            if (brk) this.push8(mode, `state.p | 0x20`);
            else this.push8(mode, 'state.p');
        } else {
            this.push8(mode, `state.k >>> 16`).push16(mode, 'state.pc').push8(mode, 'state.p');
        }

        this.chunks.push(outdent`
                state.p |= ${Flag.i};
                state.p &= ${~Flag.d};
                state.k = 0;

                state.pc = bus.read(${hex16(mode === Mode.em ? addressEmulation : addressNative)}, breakCb);
                state.pc |= bus.read(${hex16((mode === Mode.em ? addressEmulation : addressNative) + 1)}, breakCb) << 8;
            `);

        return this;
    }

    handleFlagChange(mode: Mode): Compiler {
        if (mode === Mode.em) {
            this.add(`state.p |= ${Flag.m | Flag.x};`);
        } else {
            this.add(outdent`
                    const newMode = (state.p >>> 4) & 0x03;
                    if (newMode != state.mode) {
                        state.mode = newMode;

                        if (state.p & ${Flag.x}) {
                            state.x &= 0xff;
                            state.y &= 0xff;
                        }

                        state.slowPath |= ${SlowPathReason.modeChange};
                    }
                `);
        }

        return this;
    }

    tick(count = 1): Compiler {
        if (count > 0) this.chunks.push(count > 1 ? `clock.tickCpu_N(${count});` : 'clock.tickCpu();');

        return this;
    }

    compile(): string {
        return outdent`
        (state, bus, clock, breakCb) => {
            'use strict';
            
        ${indentString(this.chunks.join('\n\n'), 4)}
        }
        `;
    }

    private op(): string {
        if (this.opDeclared) {
            return 'op';
        } else {
            this.opDeclared = true;

            return 'let op';
        }
    }
}
