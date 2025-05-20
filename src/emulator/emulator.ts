import { Bus } from './bus';
import { BusSnes } from './busSnes';
import { Cartridge } from './cartridge/cartridge';
import { CartridgeLoRom } from './cartridge/cartridgeLoRom';
import { ClockSnes } from './clockSnes';
import { Cpu } from './cpu/cpu';
import { describeError } from './util';
import { Wram } from './wram';

export class Emulator {
    private cartridge: Cartridge;
    private wram: Wram;
    private bus: BusSnes;
    private clock: ClockSnes;
    private cpu: Cpu;

    constructor(cartridgeData: Uint8Array) {
        try {
            this.cartridge = new CartridgeLoRom(cartridgeData);
        } catch (e: unknown) {
            throw new Error(`invalid cartridge: ${describeError(e)}`);
        }

        this.wram = new Wram();
        this.clock = new ClockSnes();
        this.bus = new BusSnes(this.wram, this.cartridge, this.clock);
        this.cpu = new Cpu(this.bus, this.clock);

        this.reset();
    }

    reset(): void {
        this.cpu.reset();
    }

    run(instructionLimit: number): number {
        return this.cpu.run(instructionLimit);
    }

    getCartridge(): Cartridge {
        return this.cartridge;
    }

    getBus(): Bus {
        return this.bus;
    }

    getCpu(): Cpu {
        return this.cpu;
    }

    getClock(): ClockSnes {
        return this.clock;
    }
}
