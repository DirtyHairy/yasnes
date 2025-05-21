import indentString from 'indent-string';
import { outdent } from 'outdent';
import { Flag, Mode } from './state';
import { AddressingMode } from './addressingMode';
import { BreakReason } from '../break';

export const enum CompilationFlags {
    none = 0,
}

const READ_PC = 'bus.read(state.k | state.pc, breakCb)';
const INCREMENT_PC = 'state.pc = (state.pc + 1) & 0xffff';

export class Compiler {
    chunks: Array<string> = [];

    constructor(private flags: number) {}

    then(chunk: string): Compiler {
        this.chunks.push(chunk);

        return this;
    }

    loadPointer(mode: Mode, addressingMode: AddressingMode): Compiler {
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
                this.chunks.push(outdent`
                    let ptr = ${READ_PC};
                    ${INCREMENT_PC};

                    ptr |= (${READ_PC}) << 8;
                    ${INCREMENT_PC};

                    ptr |= state.dbr;
                    ptr = (ptr + state.x) & 0xffffff;

                    clock.tickCpu();
                    `);

                return this;

            case AddressingMode.abs_y:
                this.chunks.push(outdent`
                    let ptr = ${READ_PC};
                    ${INCREMENT_PC};

                    ptr |= (${READ_PC}) << 8;
                    ${INCREMENT_PC};

                    ptr |= state.dbr;
                    ptr = (ptr + state.y) & 0xffffff;

                    clock.tickCpu();
                    `);

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

            default:
                this.chunks.push(outdent`
                        let ptr = 0;
                        breakCb(${BreakReason.instructionFault}, 'load pointer for ${addressingMode} not implemented');
                    `);
                return this;
        }
    }

    store8ToPtr(value: string): Compiler {
        this.chunks.push(`bus.write(ptr, ${value}, breakCb)`);
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
        return this.loadPointer(mode, addressingMode).store8ToPtr(value);
    }

    store16(value: string, mode: Mode, addressingMode: AddressingMode): Compiler {
        return this.loadPointer(mode, addressingMode).store16ToPtr(value, addressingMode);
    }

    store(value: string, mode: Mode, addressingMode: AddressingMode, is16: boolean): Compiler {
        if (is16) return this.store16(value, mode, addressingMode);
        else return this.store8(value, mode, addressingMode);
    }

    load8FromPtr(): Compiler {
        this.chunks.push(`let op = bus.read(ptr, breakCb);`);
        return this;
    }

    load16FromPtr(addressingMode: AddressingMode): Compiler {
        switch (addressingMode) {
            case AddressingMode.direct:
            case AddressingMode.direct_x:
            case AddressingMode.direct_y:
                this.chunks.push(`let op = bus.read(ptr, breakCb) | (bus.read((ptr + 1) & 0xffff, breakCb) << 8);`);

                return this;

            default:
                this.chunks.push(`let op = bus.read(ptr, breakCb) | (bus.read((ptr + 1) & 0xffffff, breakCb) << 8);`);
                return this;
        }
    }

    load8(mode: Mode, addressingMode: AddressingMode): Compiler {
        if (addressingMode === AddressingMode.imm) {
            this.chunks.push(outdent`
                    let op = ${READ_PC};
                    ${INCREMENT_PC};
                `);

            return this;
        }

        return this.loadPointer(mode, addressingMode).load8FromPtr();
    }

    load16(mode: Mode, addressingMode: AddressingMode): Compiler {
        if (addressingMode === AddressingMode.imm) {
            this.chunks.push(outdent`
                    let op = ${READ_PC};
                    ${INCREMENT_PC};

                    op |= (${READ_PC}) << 8;
                    ${INCREMENT_PC};
                `);

            return this;
        }

        return this.loadPointer(mode, addressingMode).load16FromPtr(addressingMode);
    }

    load(mode: Mode, addressingMode: AddressingMode, is16: boolean): Compiler {
        if (is16) return this.load16(mode, addressingMode);
        else return this.load8(mode, addressingMode);
    }

    setFlagsNZ(value: string, is16: boolean): Compiler {
        this.chunks.push(
            is16
                ? `state.p = (state.p & 0x7e) | ((${value} << 8) & 0x80) | (${value} === 0 ? 1 : 0)`
                : `state.p = (state.p & 0x7e) | (${value} & 0x80) | (${value} === 0 ? 1 : 0)`,
        );

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
}
