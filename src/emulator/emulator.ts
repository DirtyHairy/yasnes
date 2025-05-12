import { Cartridge } from './cartridge/cartridge';
import { CartridgeLoRom } from './cartridge/cartridgeLoRom';
import { describeError } from './util';

export class Emulator {
    constructor(cartridgeData: Uint8Array) {
        try {
            this.cartridge = new CartridgeLoRom(cartridgeData);
        } catch (e: unknown) {
            throw new Error(`invalid cartridge: ${describeError(e)}`);
        }
    }

    getCartridge(): Cartridge {
        return this.cartridge;
    }

    private cartridge: Cartridge;
}
