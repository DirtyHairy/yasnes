import indentString from 'indent-string';
import { outdent } from 'outdent';
import { AddressingMode } from './instruction';
import { Mode } from './state';

const READ_PC = 'bus.read(state.k | state.pc, breakCb)';
const INCREMENT_PC = 'state.pc = (state.pc + 1) & 0xffff';

export class CodeBuilder {
    constructor(private flags: number) {}

    then(chunk: string): CodeBuilder {
        this.chunks.push(chunk);

        return this;
    }

    loadPointer(mode: Mode, addressingMode: AddressingMode): CodeBuilder {
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

            default:
                throw new Error(`addressing mode ${addressingMode} not implemented for loadPointer`);
        }
    }

    storeToPtr(value: string, mode: Mode): CodeBuilder {
        switch (mode) {
            case Mode.MX:
            case Mode.Mx:
            case Mode.em:
                this.chunks.push(`bus.write(ptr, ${value}, breakCb)`);
                return this;

            default:
                this.chunks.push(outdent`
                        bus.write(ptr, ${value} & 0xff, breakCb);
                        bus.write((ptr + 1) & 0xffffff, ${value} >>> 8, breakCb);
                    `);

                return this;
        }
    }

    store(value: string, mode: Mode, addressingMode: AddressingMode): CodeBuilder {
        return this.loadPointer(mode, addressingMode).storeToPtr(value, mode);
    }

    build(): string {
        return outdent`
        (state, bus, clock, breakCb) => {
            'use strict';
            
        ${indentString(this.chunks.join('\n\n'), 4)}
        }
        `;
    }

    chunks: Array<string> = [];
}
