export class Wram {
    private wram = new Uint8Array(128 << 10);

    read = (address: number): number => this.wram[address & 0x1ffff];

    write = (address: number, value: number): void => {
        this.wram[address & 0x1ffff] = value;
    };

    peek = (address: number): number => this.read(address);
}
