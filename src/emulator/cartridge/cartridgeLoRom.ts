import { describeError } from '../util';
import { Cartridge } from './cartridge';
import { Chipset, decodeHeader, describeHeader, HEADER_SIZE, RomHeader } from './romHeader';

const enum CONST {
    HEADER_OFFSET = 0x7fc0,
}

interface HalfBank {
    mask: number;
    writable: boolean;
    data: Uint8Array;
}

export class CartridgeLoRom implements Cartridge {
    constructor(data: Uint8Array) {
        if (data.length % 0x8000 !== 0 && (data.length - 512) % 0x8000 === 0) {
            data = data.subarray(512);
        }

        if (data.length === 0) {
            throw new Error('empty image');
        }

        if (1 << (31 - Math.clz32(data.length)) !== data.length) {
            throw new Error('non power of two length ROMs not currently supported');
        }

        // 128 * 32k = 4MB
        if (data.length > 128 * 0x8000) {
            throw new Error('ROM size exceeds loROM limit');
        }

        try {
            this.header = decodeHeader(data.subarray(CONST.HEADER_OFFSET, CONST.HEADER_OFFSET + HEADER_SIZE));
        } catch (e: unknown) {
            throw new Error(`bad ROM header: ${describeError(e)}`);
        }

        if (1 << this.header.romSizeLog2 < data.length || 1 << (this.header.romSizeLog2 - 1) > data.length) {
            throw new Error('ROM length mismatch');
        }

        const ramSize = this.header.chipset === Chipset.rom ? 0 : 1 << this.header.ramSizeLog2;

        // 64 * 32k = 2MB (for ROM > 2MB) / 64 * 64k = 4MB (for ROM <= 2MB)
        if ((data.length > 1 << 21 && ramSize > 64 * 0x8000) || (data.length <= 1 << 21 && ramSize > 64 * 0x10000)) {
            throw new Error('RAM does not fit in loROM address space');
        }

        let checksum = 0;
        for (let i = 0; i < data.length; i++) {
            checksum = (checksum + data[i % data.length]) & 0xffff;
        }

        if (checksum !== this.header.checksum) {
            throw new Error('checksum mismatch');
        }

        this.ram = new Uint8Array(ramSize);

        for (let i = 0; i < 512; i++) {
            this.halfBanks[i] = this.layoutHalfBank(i, data);
        }
    }

    description(): string {
        return describeHeader(this.header);
    }

    read = (address: number): number => {
        const halfBank = this.halfBanks[address >>> 15];

        return halfBank.data[address & halfBank.mask];
    };

    write = (address: number, value: number): void => {
        const halfBank = this.halfBanks[address >>> 15];

        if (halfBank.writable) halfBank.data[address & halfBank.mask] = value;
    };

    peek = (address: number): number => {
        return this.read(address);
    };

    private layoutHalfBank(halfBankIndex: number, data: Uint8Array): HalfBank {
        // !!! we currently only support ROM sizes that are power of two !!!

        // cart ignores bit 23
        halfBankIndex &= 0xff;

        // banks are composed of two half banks at 0 -- 32k and 32k -- 64k
        const bankIndex = halfBankIndex >>> 1;

        // divide in 32k chunks
        const romBanksTotal = data.length >>> 15;

        // interpret half bank as ROM (which may mirror to the lower half)
        const bankRom = (): HalfBank => {
            const offset = 0x8000 * (bankIndex % romBanksTotal);

            return {
                mask: 0x7fff,
                writable: false,
                data: data.subarray(offset, offset + 0x8000),
            };
        };

        // no RAM -> address space fully filled with 32k banks repeated in upper and
        // lower half
        if (this.ram.length === 0) return bankRom();

        // half the address space is filled with 64k RAM banks
        if (romBanksTotal < 128) {
            if (bankIndex < 64) {
                // lower 64 banks are ROM
                return bankRom();
            } else {
                // upper 64 banks are RAM
                if (this.ram.length < 0x10000) {
                    // less than 64k RAM? one bank with masked address lines
                    return {
                        writable: true,
                        mask: this.ram.length - 1,
                        data: this.ram,
                    };
                } else {
                    // multiple of 64k RAM? multiple 64k banks
                    const ramBanksTotal = this.ram.length >>> 16;
                    // technically we have to take the index mod 64, but ramBanksTotal
                    // is a lower power of two anyway
                    const offset = 0x10000 * (bankIndex % ramBanksTotal);

                    return {
                        writable: true,
                        mask: 0xffff,
                        data: this.ram.subarray(offset, offset + 0x10000),
                    };
                }
            }
        }

        // upper address space is ROM, lower address space is RAM
        if (halfBankIndex & 0x01) {
            // upper half is ROM
            return bankRom();
        } else {
            // lower half is RAM
            if (this.ram.length < 0x8000) {
                // less then 32k RAM? one bank with masked address lines
                return {
                    writable: true,
                    mask: this.ram.length - 1,
                    data: this.ram,
                };
            } else {
                const ramBanksTotal = this.ram.length >>> 15;
                // technically we have to take the index mod 64, but ramBanksTotal
                // is a lower power of two anyway
                const offset = 0x8000 * (bankIndex % ramBanksTotal);

                // multiple of 32k RAM? multiple 32k banks
                return {
                    writable: true,
                    mask: 0x7fff,
                    data: this.ram.subarray(offset, offset + 0x8000),
                };
            }
        }
    }

    private header: RomHeader;
    private ram: Uint8Array;
    private halfBanks = new Array<HalfBank>(512);
}
