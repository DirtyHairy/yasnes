import { Bus } from './bus';
import { Cartridge } from './cartridge/cartridge';
import { CartridgeLoRom } from './cartridge/cartridgeLoRom';
import { describeError } from './util';
import { Wram } from './wram';

export class Emulator {
    constructor(cartridgeData: Uint8Array) {
        try {
            this.cartridge = new CartridgeLoRom(cartridgeData);
        } catch (e: unknown) {
            throw new Error(`invalid cartridge: ${describeError(e)}`);
        }

        this.wram = new Wram();
        this.bus = new Bus(this.wram, this.cartridge);
    }

    getCartridge(): Cartridge {
        return this.cartridge;
    }

    getBus(): Bus {
        return this.bus;
    }

    private cartridge: Cartridge;
    private wram: Wram;
    private bus: Bus;
}
