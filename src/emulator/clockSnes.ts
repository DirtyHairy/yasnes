import { Clock } from './clock';

export class ClockSnes implements Clock {
    private masterClockCycles = 0;

    // 21.5 MHz
    tickMaster(clocks: number): void {
        this.masterClockCycles += clocks;
    }

    // 1.78 MHz (joypad)
    tick_div12(): void {
        this.tickMaster(12);
    }

    // 2.66 MHz (slow ROM, WRAM, expansion)
    tick_div8(): void {
        this.tickMaster(8);
    }

    // 3.58 MHz (fast ROM, I/O)
    tick_div6(): void {
        this.tickMaster(6);
    }

    tickCpu(): void {
        this.tickMaster(6);
    }

    tickCpu_N(ticks: number): void {
        this.tickMaster(6 * ticks);
    }

    resetMasterClockCycles(): void {
        this.masterClockCycles = 0;
    }

    getMasterClockCycles(): number {
        return this.masterClockCycles;
    }
}
