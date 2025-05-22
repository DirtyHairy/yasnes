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

    loadPointer(mode: Mode, addressingMode: AddressingMode, forStore: boolean): Compiler {
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
                        ptr = ((ptr | state.dbr) + state.y) & 0xffffff
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

                        ptr = (ptr  + state.y) & 0xffffff
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

        return this.loadPointer(mode, addressingMode, false).load8FromPtr();
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

        return this.loadPointer(mode, addressingMode, false).load16FromPtr(addressingMode);
    }

    load(mode: Mode, addressingMode: AddressingMode, is16: boolean): Compiler {
        if (is16) return this.load16(mode, addressingMode);
        else return this.load8(mode, addressingMode);
    }

    setFlagsNZ(value: string, is16: boolean): Compiler {
        this.chunks.push(
            is16
                ? `state.p = (state.p & (${~(Flag.z | Flag.n)})) | ((${value} >>> 8) & ${Flag.n}) | (${value} === 0 ? ${Flag.z} : 0);`
                : `state.p = (state.p & (${~(Flag.z | Flag.n)})) | (${value} & ${Flag.n}) | (${value} === 0 ? ${Flag.z} : 0);`,
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
