import { CartridgeLoRom } from './cartridgeLoRom';

function addHeader(rom: Uint8Array, ramSize: number): void {
    const name = 'TESTROM';
    let cursor = 0x7fc0;

    // name
    for (let i = 0; i < 21; i++) rom[cursor++] = i > name.length - 1 ? 0x20 : name.charCodeAt(i);

    // map mode
    rom[cursor++] = 0x20;

    // chipset
    rom[cursor++] = ramSize > 0 ? 0x01 : 0x00;

    // ROM size log 2
    rom[cursor++] = 31 - Math.clz32(rom.length) - 10;

    // RAM size log 2
    rom[cursor++] = ramSize > 0 ? 31 - Math.clz32(ramSize) - 10 : 0;

    // country
    rom[cursor++] = 0;

    // dev ID
    rom[cursor++] = 0;

    // version
    rom[cursor++] = 0;

    let checksum = 2 * 0xff;
    for (let i = 0; i < rom.length; i++) checksum = (checksum + rom[i]) & 0xffff;

    // checksum complement
    rom[cursor++] = checksum ^ 0xffff;
    rom[cursor++] = (checksum ^ 0xffff) >>> 8;

    // checksum
    rom[cursor++] = checksum;
    rom[cursor++] = checksum >>> 8;
}

describe('cartridgeLoRom', () => {
    describe('Construction errors', () => {
        it('should pass for a properly sized ROM without RAM', () => {
            const rom = new Uint8Array(16 * 0x10000);
            addHeader(rom, 0);

            expect(() => new CartridgeLoRom(rom)).not.toThrow();
        });

        it('should pass for a properly sized ROM with RAM', () => {
            const rom = new Uint8Array(16 * 0x10000);
            addHeader(rom, 1024);

            expect(() => new CartridgeLoRom(rom)).not.toThrow();
        });

        it('should throw an error if the ROM size is not a multiple of 16KB', () => {
            const rom = new Uint8Array(0xffff);
            expect(() => new CartridgeLoRom(rom)).toThrow();
        });

        it('should throw if there is no header', () => {
            const rom = new Uint8Array(0x8000);
            expect(() => new CartridgeLoRom(rom)).toThrow();
        });

        it('should throw if the ROM size is larger than 4MB', () => {
            const rom = new Uint8Array(1 << 23);
            expect(() => new CartridgeLoRom(rom)).toThrow();
        });

        it('should throw if the ROM size is larger than 4MB', () => {
            const rom = new Uint8Array(1 << 23);
            expect(() => new CartridgeLoRom(rom)).toThrow();
        });

        it('2MB ROM and 4MB RAM should be valid', () => {
            const rom = new Uint8Array(1 << 21);
            addHeader(rom, 1 << 22);

            expect(() => new CartridgeLoRom(rom)).not.toThrow();
        });

        it('2MB ROM and 8MB RAM should be invalid', () => {
            const rom = new Uint8Array(1 << 21);
            addHeader(rom, 1 << 23);

            expect(() => new CartridgeLoRom(rom)).toThrow();
        });

        it('4MB ROM and 2MB RAM should be valid', () => {
            const rom = new Uint8Array(1 << 22);
            addHeader(rom, 1 << 21);

            expect(() => new CartridgeLoRom(rom)).not.toThrow();
        });

        it('4MB ROM and 4MB RAM should be invalid', () => {
            const rom = new Uint8Array(1 << 22);
            addHeader(rom, 1 << 22);

            expect(() => new CartridgeLoRom(rom)).toThrow();
        });
    });
});
