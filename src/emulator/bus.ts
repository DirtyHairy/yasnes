import { BreakCallback, BreakReason } from './break';
import { Cartridge } from './cartridge/cartridge';
import { Wram } from './wram';

export class Bus {
    constructor(private wram: Wram, private cartridge: Cartridge) {}

    read(address: number, breakCb: BreakCallback): number {
        this.lastValue = this.readTransaction(address, this.lastValue, breakCb);

        return this.lastValue;
    }

    write(address: number, value: number, breakCb: BreakCallback): void {
        if ((address & 0x048000) === 0) {
            breakCb(BreakReason.badWrite, 'system area not implemented');
            return;
        }

        if ((address & 0x7e0000) === 0x7e0000) {
            this.wram.write(address, value);
            return;
        }

        this.cartridge.write(address, value);
    }

    peek(address: number): number {
        if ((address & 0x048000) === 0) return 0;

        if ((address & 0x7e0000) === 0x7e0000) return this.wram.peek(address);

        return this.cartridge.peek(address);
    }

    private readTransaction(address: number, lastValue: number, breakCb: BreakCallback): number {
        if ((address & 0x048000) === 0) {
            breakCb(BreakReason.badRead, 'system area not implemented');
            return 0;
        }

        if ((address & 0x7e0000) === 0x7e0000) return this.wram.read(address);

        return this.cartridge.read(address);
    }

    private lastValue = 0;
}
