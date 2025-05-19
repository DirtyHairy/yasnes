import { BreakCallback } from './break';
import { Bus } from './bus';
import { Cartridge } from './cartridge/cartridge';
import { ClockSnes } from './clockSnes';
import { Wram } from './wram';

export type ReadFn = (address: number, lastValue: number, breakCb: BreakCallback) => number;
export type WriteFn = (address: number, value: number, breakCb: BreakCallback) => void;
export type PeekFn = (address: number) => number;

interface SystemAreaLocation {
    readFn: ReadFn;
    writeFn: WriteFn;
    peekFn: PeekFn;
    speed: number;
}

export class BusSnes implements Bus {
    constructor(private wram: Wram, private cartridge: Cartridge, private clock: ClockSnes) {
        const readFn: ReadFn = (_, lastValue) => lastValue;
        const writeFn: WriteFn = () => undefined;
        const peekFn: PeekFn = () => 0;

        for (let i = 0; i < 0x2000; i++)
            this.systemArea[i] = { readFn: this.wram.read, writeFn: this.wram.write, peekFn: this.wram.peek, speed: 8 };

        for (let i = 0x2000; i < 0x4000; i++) this.systemArea[i] = { readFn, writeFn, peekFn, speed: 6 };
        for (let i = 0x4000; i < 0x4200; i++) this.systemArea[i] = { readFn, writeFn, peekFn, speed: 12 };
        for (let i = 0x4200; i < 0x6000; i++) this.systemArea[i] = { readFn, writeFn, peekFn, speed: 6 };
        for (let i = 0x6000; i < 0x8000; i++) this.systemArea[i] = { readFn, writeFn, peekFn, speed: 8 };
    }

    read(address: number, breakCb: BreakCallback): number {
        this.lastValue = this.readTransaction(address, this.lastValue, breakCb);

        return this.lastValue;
    }

    write(address: number, value: number, breakCb: BreakCallback): void {
        this.lastValue = value;

        if ((address & 0x048000) === 0) {
            const loc = this.systemArea[address & 0x7fff];

            loc.writeFn(address, value, breakCb);
            this.tickSystemArea(loc.speed);

            return;
        }

        if ((address & 0x7e0000) === 0x7e0000) {
            this.wram.write(address, value);
            return;
        }

        this.cartridge.write(address, value);
    }

    peek(address: number): number {
        if ((address & 0x048000) === 0) {
            return this.systemArea[address & 0x7fff].peekFn(address);
        }

        if ((address & 0x7e0000) === 0x7e0000) return this.wram.peek(address);

        return this.cartridge.peek(address);
    }

    private readTransaction(address: number, lastValue: number, breakCb: BreakCallback): number {
        if ((address & 0x048000) === 0) {
            const loc = this.systemArea[address & 0x7fff];

            const value = loc.readFn(address, lastValue, breakCb);
            this.tickSystemArea(loc.speed);

            return value;
        }

        if ((address & 0x7e0000) === 0x7e0000) return this.wram.read(address);

        if (address & 0x800000 && this.fastRom) {
            this.clock.tick_div6();
        } else {
            this.clock.tick_div8();
        }

        return this.cartridge.read(address);
    }

    private tickSystemArea(speed: number): void {
        switch (speed) {
            case 12:
                this.clock.tick_div12();
                break;

            case 8:
                this.clock.tick_div8();
                break;

            default:
                this.clock.tick_div6();
                break;
        }
    }

    private lastValue = 0;
    private fastRom = false;

    private systemArea = new Array<SystemAreaLocation>(0x8000);
}
