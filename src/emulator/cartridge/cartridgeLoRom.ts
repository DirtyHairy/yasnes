import { BreakCallback, BreakReason } from '../break';
import { describeError } from '../util';
import { Cartridge } from './cartridge';
import { decodeHeader, describeHeader, RomHeader } from './romHeader';

const enum CONST {
    HEADER_OFFSET = 0x7fc0,
}

export class CartridgeLoRom implements Cartridge {
    constructor(data: Uint8Array) {
        if (data.length % 0x8000 !== 0 && (data.length - 512) % 0x8000 === 0) {
            data = data.subarray(512);
        }

        if (data.length === 0) {
            throw new Error('empty image');
        }

        try {
            this.header = decodeHeader(data.subarray(CONST.HEADER_OFFSET, CONST.HEADER_OFFSET + 32));
        } catch (e: unknown) {
            throw new Error(`bad ROM header: ${describeError(e)}`);
        }

        if (this.header.romSize > data.length) {
            throw new Error('ROM length mismatch');
        }

        if (data.length > 3 << 20 && this.header.ramSize > 0) {
            throw new Error('unsupported address space layout');
        }

        let checksum = 0;
        for (let i = 0; i < data.length; i++) {
            checksum = (checksum + data[i % data.length]) & 0xffff;
        }

        if (checksum !== this.header.checksum) {
            throw new Error('checksum mismatch');
        }
    }

    description(): string {
        return describeHeader(this.header);
    }

    read(address: number, previousValue: number, breakCb: BreakCallback): number {
        breakCb(BreakReason.badRead, 'not implemented');
        return previousValue;
    }

    write(address: number, value: number, breakCb: BreakCallback): void {
        breakCb(BreakReason.badWrite, 'not implemented');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    peek(address: number): number {
        return 0;
    }

    private header: RomHeader;
}
