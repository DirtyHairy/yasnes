import { getInstruction } from './cpu/instruction';
import { modeToString } from './cpu/state';
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

    disassembleAt(start: number, byteCountLimit: number): string {
        const bus = this.emulator.getBus();
        let mode = this.emulator.getCpu().state.mode;
        let addr = start;
        let byteCount = 0;
        const lines = [];

        while (byteCount < byteCountLimit) {
            const opcode = bus.peek(addr);
            byteCount++;

            const instruction = getInstruction(opcode);
            const { disassembly, additionalBytes, mode: newMode } = instruction.disassemble(mode, addr, bus);

            lines.push(`${hex24(addr)} [${modeToString(mode)}]    ${disassembly}`);

            mode = newMode;
            byteCount += additionalBytes;
            addr = (addr & 0xff0000) | ((addr + 1 + additionalBytes) & 0xffff);
        }

        return lines.join('\n');
    }

    disassemble(byteCountLimit: number): string {
        const state = this.emulator.getCpu().state;

        return this.disassembleAt(state.k | state.pc, byteCountLimit);
    }
}
