import indentString from 'indent-string';
import { outdent } from 'outdent';
import { Mode } from './state';
import { AddressingMode } from './addressingMode';

export const enum CompilationFlags {
    none = 0,
}

const READ_PC = 'bus.read(state.k | state.pc, breakCb)';
const INCREMENT_PC = 'state.pc = (state.pc + 1) & 0xffff';

export class Compiler {
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
                            clock.tickCpu();
                        } else {
                            ptr = ((ptr + x) & 0xff) | state.d;
                        }
                        `);
                } else {
                    this.chunks.push(outdent`
                        ptr = (ptr + state.d + state.x) & 0xffff;
                        if (state.d & 0xff) clock.tickCpu();
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
                            clock.tickCpu();
                        } else {
                            ptr = ((ptr + y) & 0xff) | state.d;
                        }
                        `);
                } else {
                    this.chunks.push(outdent`
                        ptr = (ptr + state.d + state.y) & 0xffff;
                        if (state.d & 0xff) clock.tickCpu();
                        `);
                }

                return this;

            default:
                throw new Error(`addressing mode ${addressingMode} not implemented for loadPointer`);
        }
    }

    store8ToPtr(value: string): Compiler {
        this.chunks.push(`bus.write(ptr, ${value}, breakCb)`);
        return this;
    }

    store16ToPtr(value: string): Compiler {
        this.chunks.push(outdent`
                        bus.write(ptr, ${value} & 0xff, breakCb);
                        bus.write((ptr + 1) & 0xffffff, ${value} >>> 8, breakCb);
                    `);

        return this;
    }

    store8(value: string, mode: Mode, addressingMode: AddressingMode): Compiler {
        return this.loadPointer(mode, addressingMode).store8ToPtr(value);
    }

    store16(value: string, mode: Mode, addressingMode: AddressingMode): Compiler {
        return this.loadPointer(mode, addressingMode).store16ToPtr(value);
    }

    store(value: string, mode: Mode, addressingMode: AddressingMode, is16: boolean): Compiler {
        if (is16) return this.store16(value, mode, addressingMode);
        else return this.store8(value, mode, addressingMode);
    }

    compile(): string {
        return outdent`
        (state, bus, clock, breakCb) => {
            'use strict';
            
        ${indentString(this.chunks.join('\n\n'), 4)}
        }
        `;
    }

    chunks: Array<string> = [];
}
