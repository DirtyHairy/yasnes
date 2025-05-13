export class Wram {
    read(address: number): number {
        return this.wram[address & 0x1ffff];
    }

    write(address: number, value: number): void {
        this.wram[address & 0x1ffff] = value;
    }

    peek(address: number): number {
        return this.read(address);
    }

    private wram = new Uint8Array(128 << 10);
}
