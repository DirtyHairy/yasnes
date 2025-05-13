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

    // 16bit checksum & its complement conveniently add up to 2 * 0xff
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
    describe('validation', () => {
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

        it('a ROM with bad checksum should be invalid', () => {
            const rom = new Uint8Array(16 * 0x10000);
            addHeader(rom, 0);
            rom[0] = 0x01;

            expect(() => new CartridgeLoRom(rom)).toThrow();
        });
    });

    describe('layout', () => {
        it('512k ROM, no RAM', () => {
            const rom = new Uint8Array(512 << 10);

            rom[0] = 0x01;
            rom[0x8000] = 0x02;
            rom[(512 << 10) - 0x8000] = 0x03;

            addHeader(rom, 0);
            const cart = new CartridgeLoRom(rom);

            expect(cart.peek(0x000000)).toBe(0x01);
            expect(cart.peek(0x008000)).toBe(0x01);

            expect(cart.peek(0x010000)).toBe(0x02);
            expect(cart.peek(0x018000)).toBe(0x02);

            expect(cart.peek(0x0f0000)).toBe(0x03);
            expect(cart.peek(0x0f8000)).toBe(0x03);

            expect(cart.peek(0x100000)).toBe(0x01);
            expect(cart.peek(0x108000)).toBe(0x01);

            expect(cart.peek(0x110000)).toBe(0x02);
            expect(cart.peek(0x118000)).toBe(0x02);

            expect(cart.peek(0x1f0000)).toBe(0x03);
            expect(cart.peek(0x1f8000)).toBe(0x03);

            expect(cart.peek(0x800000)).toBe(0x01);
            expect(cart.peek(0x808000)).toBe(0x01);

            expect(cart.peek(0x810000)).toBe(0x02);
            expect(cart.peek(0x818000)).toBe(0x02);

            expect(cart.peek(0x8f0000)).toBe(0x03);
            expect(cart.peek(0x8f8000)).toBe(0x03);

            expect(cart.peek(0x900000)).toBe(0x01);
            expect(cart.peek(0x908000)).toBe(0x01);

            expect(cart.peek(0x910000)).toBe(0x02);
            expect(cart.peek(0x918000)).toBe(0x02);

            expect(cart.peek(0x9f0000)).toBe(0x03);
            expect(cart.peek(0x9f8000)).toBe(0x03);
        });

        it('512k ROM, 2k RAM', () => {
            const rom = new Uint8Array(512 << 10);

            rom[0] = 0x01;
            rom[0x8000] = 0x02;
            rom[(512 << 10) - 0x8000] = 0x03;

            addHeader(rom, 2 << 10);
            const cart = new CartridgeLoRom(rom);

            cart.write(0x400000, 0x0a);

            expect(cart.peek(0x008000)).toBe(0x01);
            expect(cart.peek(0x018000)).toBe(0x02);
            expect(cart.peek(0x0f8000)).toBe(0x03);

            expect(cart.peek(0x308000)).toBe(0x01);
            expect(cart.peek(0x318000)).toBe(0x02);
            expect(cart.peek(0x3f8000)).toBe(0x03);

            expect(cart.peek(0x400000)).toBe(0x0a);
            expect(cart.peek(0x400800)).toBe(0x0a);

            expect(cart.peek(0x410000)).toBe(0x0a);
            expect(cart.peek(0x410800)).toBe(0x0a);

            expect(cart.peek(0x808000)).toBe(0x01);
            expect(cart.peek(0x818000)).toBe(0x02);
            expect(cart.peek(0x8f8000)).toBe(0x03);

            expect(cart.peek(0xb08000)).toBe(0x01);
            expect(cart.peek(0xb18000)).toBe(0x02);
            expect(cart.peek(0xbf8000)).toBe(0x03);

            expect(cart.peek(0xc00000)).toBe(0x0a);
            expect(cart.peek(0xc00800)).toBe(0x0a);

            expect(cart.peek(0xc10000)).toBe(0x0a);
            expect(cart.peek(0xc10800)).toBe(0x0a);
        });

        it('512k ROM, 128k RAM', () => {
            const rom = new Uint8Array(512 << 10);

            rom[0] = 0x01;
            rom[0x8000] = 0x02;
            rom[(512 << 10) - 0x8000] = 0x03;

            addHeader(rom, 128 << 10);
            const cart = new CartridgeLoRom(rom);

            cart.write(0x400000, 0x0a);
            cart.write(0x40ffff, 0x0b);
            cart.write(0x410000, 0x0c);
            cart.write(0x41ffff, 0x0d);

            expect(cart.peek(0x008000)).toBe(0x01);
            expect(cart.peek(0x018000)).toBe(0x02);
            expect(cart.peek(0x0f8000)).toBe(0x03);

            expect(cart.peek(0x308000)).toBe(0x01);
            expect(cart.peek(0x318000)).toBe(0x02);
            expect(cart.peek(0x3f8000)).toBe(0x03);

            expect(cart.peek(0x400000)).toBe(0x0a);
            expect(cart.peek(0x40ffff)).toBe(0x0b);
            expect(cart.peek(0x410000)).toBe(0x0c);
            expect(cart.peek(0x41ffff)).toBe(0x0d);

            expect(cart.peek(0x420000)).toBe(0x0a);
            expect(cart.peek(0x42ffff)).toBe(0x0b);
            expect(cart.peek(0x430000)).toBe(0x0c);
            expect(cart.peek(0x43ffff)).toBe(0x0d);

            expect(cart.peek(0x808000)).toBe(0x01);
            expect(cart.peek(0x818000)).toBe(0x02);
            expect(cart.peek(0x8f8000)).toBe(0x03);

            expect(cart.peek(0xb08000)).toBe(0x01);
            expect(cart.peek(0xb18000)).toBe(0x02);
            expect(cart.peek(0xbf8000)).toBe(0x03);

            expect(cart.peek(0xc00000)).toBe(0x0a);
            expect(cart.peek(0xc0ffff)).toBe(0x0b);
            expect(cart.peek(0xc10000)).toBe(0x0c);
            expect(cart.peek(0xc1ffff)).toBe(0x0d);

            expect(cart.peek(0xc20000)).toBe(0x0a);
            expect(cart.peek(0xc2ffff)).toBe(0x0b);
            expect(cart.peek(0xc30000)).toBe(0x0c);
            expect(cart.peek(0xc3ffff)).toBe(0x0d);
        });

        it('4MB ROM, 2k RAM', () => {
            const rom = new Uint8Array(1 << 22);

            rom[0] = 0x01;
            rom[0x8000] = 0x02;
            rom[(1 << 22) - 0x8000] = 0x03;

            addHeader(rom, 2 << 10);
            const cart = new CartridgeLoRom(rom);

            cart.write(0x400000, 0x0a);

            expect(cart.peek(0x008000)).toBe(0x01);
            expect(cart.peek(0x018000)).toBe(0x02);
            expect(cart.peek(0x7f8000)).toBe(0x03);

            expect(cart.peek(0x400000)).toBe(0x0a);
            expect(cart.peek(0x400800)).toBe(0x0a);

            expect(cart.peek(0x410000)).toBe(0x0a);
            expect(cart.peek(0x410800)).toBe(0x0a);

            expect(cart.peek(0x808000)).toBe(0x01);
            expect(cart.peek(0x818000)).toBe(0x02);
            expect(cart.peek(0xff8000)).toBe(0x03);

            expect(cart.peek(0xc00000)).toBe(0x0a);
            expect(cart.peek(0xc00800)).toBe(0x0a);

            expect(cart.peek(0xc10000)).toBe(0x0a);
            expect(cart.peek(0xc10800)).toBe(0x0a);
        });

        it('4MB RoM, 128k RAM', () => {
            const rom = new Uint8Array(1 << 22);

            rom[0] = 0x01;
            rom[0x8000] = 0x02;
            rom[(1 << 22) - 0x8000] = 0x03;

            addHeader(rom, 128 << 10);
            const cart = new CartridgeLoRom(rom);

            cart.write(0x400000, 0x0a);
            cart.write(0x417fff, 0x0b);
            cart.write(0x420000, 0x0c);
            cart.write(0x437fff, 0x0d);

            expect(cart.peek(0x008000)).toBe(0x01);
            expect(cart.peek(0x018000)).toBe(0x02);
            expect(cart.peek(0x7f8000)).toBe(0x03);

            expect(cart.peek(0x400000)).toBe(0x0a);
            expect(cart.peek(0x417fff)).toBe(0x0b);
            expect(cart.peek(0x420000)).toBe(0x0c);
            expect(cart.peek(0x437fff)).toBe(0x0d);

            expect(cart.peek(0x440000)).toBe(0x0a);
            expect(cart.peek(0x457fff)).toBe(0x0b);
            expect(cart.peek(0x460000)).toBe(0x0c);
            expect(cart.peek(0x477fff)).toBe(0x0d);

            expect(cart.peek(0x808000)).toBe(0x01);
            expect(cart.peek(0x818000)).toBe(0x02);
            expect(cart.peek(0xff8000)).toBe(0x03);

            expect(cart.peek(0xb00000)).toBe(0x0a);
            expect(cart.peek(0xb17fff)).toBe(0x0b);
            expect(cart.peek(0xb20000)).toBe(0x0c);
            expect(cart.peek(0xb37fff)).toBe(0x0d);

            expect(cart.peek(0xb40000)).toBe(0x0a);
            expect(cart.peek(0xb57fff)).toBe(0x0b);
            expect(cart.peek(0xb60000)).toBe(0x0c);
            expect(cart.peek(0xb77fff)).toBe(0x0d);
        });
    });
});
