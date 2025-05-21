import { Mode } from './state';
import { Bus } from '../bus';
import { hex16, hex8 } from '../util';
import { AddressingMode } from './addressingMode';

export interface DisassembleResult {
    disassembly: string;
    additionalBytes: number;
    mode: Mode;
}

export function disassembleWithAddressingMode(
    mnemnonic: string,
    address: number,
    addressingMode: AddressingMode,
    mode: Mode,
    bus: Bus,
    immWidthHint?: (mode: Mode) => boolean,
): DisassembleResult {
    switch (addressingMode) {
        case AddressingMode.abs: {
            let ptr = bus.peek(address);
            address = (address & 0xff0000) | ((address + 1) & 0xffff);

            ptr |= bus.peek(address) << 8;

            return { disassembly: `${mnemnonic} ${hex16(ptr, '$')}`, additionalBytes: 2, mode };
        }

        case AddressingMode.imm: {
            if (!immWidthHint) {
                return {
                    disassembly: `${mnemnonic} [width hint required for immediate addressing]`,
                    additionalBytes: 0,
                    mode,
                };
            }

            let value = bus.peek(address);
            let additionalBytes = 1;

            if (immWidthHint(mode)) {
                address = (address & 0xff0000) | ((address + 1) & 0xffff);

                value |= bus.peek(address) << 8;
                additionalBytes++;
            }

            return {
                disassembly: `${mnemnonic} #${immWidthHint(mode) ? hex16(value, '$') : hex8(value, '$')}`,
                additionalBytes,
                mode,
            };
        }

        default:
            // prettier-ignore
            return { disassembly: `${mnemnonic} [${addressingMode} not implemented]`, additionalBytes: 0, mode };
    }
}
