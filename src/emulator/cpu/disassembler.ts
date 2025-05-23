import { Mode } from './state';
import { Bus } from '../bus';
import { hex16, hex24, hex8 } from '../util';
import { AddressingMode } from './addressingMode';
import { UnreachableCaseError } from 'ts-essentials';

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
    const arg24 = (): string => {
        let ptr = bus.peek(address);
        address = (address & 0xff0000) | ((address + 1) & 0xffff);

        ptr |= bus.peek(address) << 8;
        address = (address & 0xff0000) | ((address + 1) & 0xffff);

        ptr |= bus.peek(address) << 16;

        return hex24(ptr, '$');
    };

    const arg16 = (): string => {
        let ptr = bus.peek(address);
        address = (address & 0xff0000) | ((address + 1) & 0xffff);

        ptr |= bus.peek(address) << 8;

        return hex16(ptr, '$');
    };

    const arg8 = (): string => hex8(bus.peek(address), '$');

    switch (addressingMode) {
        case AddressingMode.abs:
            return { disassembly: `${mnemnonic} ${arg16()}`, additionalBytes: 2, mode };

        case AddressingMode.abs_x:
            return {
                disassembly: `${mnemnonic} ${arg16()},X`,
                additionalBytes: 1,
                mode,
            };

        case AddressingMode.abs_y:
            return {
                disassembly: `${mnemnonic} ${arg16()},Y`,
                additionalBytes: 1,
                mode,
            };

        case AddressingMode.abs_16:
            return { disassembly: `${mnemnonic} (${arg16()})`, additionalBytes: 2, mode };

        case AddressingMode.abs_24:
            return { disassembly: `${mnemnonic} [${arg16()}]`, additionalBytes: 2, mode };

        case AddressingMode.abs_x_16:
            return { disassembly: `${mnemnonic} (${arg16()},X)`, additionalBytes: 2, mode };

        case AddressingMode.direct:
            return { disassembly: `${mnemnonic} ${arg8()}`, additionalBytes: 1, mode };

        case AddressingMode.direct_x:
            return { disassembly: `${mnemnonic} ${arg8()},X`, additionalBytes: 1, mode };

        case AddressingMode.direct_y:
            return { disassembly: `${mnemnonic} ${arg8()},Y`, additionalBytes: 1, mode };

        case AddressingMode.direct_16:
            return { disassembly: `${mnemnonic} (${arg8()})`, additionalBytes: 1, mode };

        case AddressingMode.direct_24:
            return { disassembly: `${mnemnonic} [${arg8()}]`, additionalBytes: 1, mode };

        case AddressingMode.direct_x_16:
            return { disassembly: `${mnemnonic} (${arg8()},X)`, additionalBytes: 1, mode };

        case AddressingMode.direct_y_16:
            return { disassembly: `${mnemnonic} (${arg8()}),Y`, additionalBytes: 1, mode };

        case AddressingMode.direct_y_24:
            return { disassembly: `${mnemnonic} [${arg8()}],Y`, additionalBytes: 1, mode };

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

        case AddressingMode.implied:
            return { disassembly: mnemnonic, additionalBytes: 0, mode };

        case AddressingMode.long:
            return { disassembly: `${mnemnonic} ${arg24()}`, additionalBytes: 3, mode };

        case AddressingMode.long_x:
            return { disassembly: `${mnemnonic} ${arg24()},X`, additionalBytes: 3, mode };

        case AddressingMode.rel8: {
            const dest = ((((bus.peek(address) << 24) >> 24) + 1 + address) & 0xffff) | (address & 0xff0000);

            return { disassembly: `${mnemnonic} ${hex8(dest, '$')}`, additionalBytes: 1, mode };
        }

        case AddressingMode.rel16: {
            let ptr = bus.peek(address);
            address = (address & 0xff0000) | ((address + 1) & 0xffff);

            ptr |= bus.peek(address) << 8;

            const dest = ((((ptr << 16) >> 16) + 1 + address) & 0xffff) | (address & 0xff0000);

            return { disassembly: `${mnemnonic} ${hex16(dest, '$')}`, additionalBytes: 2, mode };
        }

        case AddressingMode.src_dest: {
            const from = bus.peek(address);
            address = (address & 0xff0000) | ((address + 1) & 0xffff);

            const to = bus.peek(address) << 8;

            return { disassembly: `${mnemnonic} ${hex8(from, '$')},${hex8(to, '$')}`, additionalBytes: 2, mode };
        }

        case AddressingMode.stack:
            return { disassembly: `${mnemnonic} S,${arg8()}`, additionalBytes: 1, mode };

        case AddressingMode.stack_y_16:
            return { disassembly: `${mnemnonic} (S,${arg8()}),Y`, additionalBytes: 1, mode };

        default:
            throw new UnreachableCaseError(addressingMode);
    }
}
