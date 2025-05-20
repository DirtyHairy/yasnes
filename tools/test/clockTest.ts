import { Clock } from '../../src/emulator/clock';

export class ClockTest implements Clock {
    private ticks = 0;

    tickMaster(clocks: number): void {
        this.ticks += clocks;
    }

    tickCpu(): void {
        this.ticks++;
    }

    tickCpu_N(ticks: number): void {
        this.ticks += ticks;
    }

    getTicks(): number {
        return this.ticks;
    }

    reset(): void {
        this.ticks = 0;
    }
}
