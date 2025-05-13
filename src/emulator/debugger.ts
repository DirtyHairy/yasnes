import { Emulator } from './emulator';
import { hex24, hex8 } from './util';

export class Debugger {
    constructor(private emulator: Emulator) {}

    dump(start: number, count: number): string {
        const bus = this.emulator.getBus();
        const lines = [];

        for (let i = 0; i < count; i++) {
            const addr = (start + i) & 0xffffff;
            lines.push(`${hex24(addr)}: ${hex8(bus.peek(addr))}`);
        }

        return lines.join('\n');
    }
}
