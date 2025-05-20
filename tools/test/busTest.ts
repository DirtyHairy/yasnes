import { Bus } from '../../src/emulator/bus';
import { Clock } from '../../src/emulator/clock';
import { hex24, hex8 } from '../../src/emulator/util';

export class BusTest implements Bus {
    constructor(private clock: Clock) {}

    read(address: number): number {
        this.clock.tickMaster(1);
        return this.memory[address];
    }

    write(address: number, value: number): void {
        this.clock.tickMaster(1);
        this.memory[address] = value;
        this.writeLog.add(address);
    }

    peek(address: number): number {
        return this.memory[address];
    }

    reset(): void {
        for (const addr of this.writeLog) this.memory[addr] = 0;
        this.writeLog.clear();
    }

    populate(values: Array<[number, number]>): void {
        for (const [address, value] of values) this.memory[address] = value;
    }

    verify(values: Array<[number, number]>): void {
        const addressSet = new Set(values.map(([x]) => x));

        for (const addr of this.writeLog) {
            if (!addressSet.has(addr)) throw new Error(`address ${hex24(addr)} should not have been written`);
        }

        for (const [addr, value] of values) {
            if (this.memory[addr] !== value)
                throw new Error(`address ${hex24(addr)}: expected ${hex8(value)}, got ${hex8(this.memory[addr])}`);
        }
    }

    private memory = new Uint8Array(0x1000000);
    private writeLog = new Set<number>();
}
