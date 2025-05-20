import { Clock } from '../../src/emulator/clock';

export class ClockTest implements Clock {
    tickMaster(clocks: number): void {
        this.ticks += clocks;
    }

    tickCpu(): void {
        this.ticks++;
    }

    getTicks(): number {
        return this.ticks;
    }

    reset(): void {
        this.ticks = 0;
    }

    private ticks = 0;
}
