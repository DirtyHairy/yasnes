import { Clock } from './clock';

export class ClockSnes implements Clock {
    tickMaster(clocks: number): void {
        this.masterClockCycles += clocks;
    }

    tickCpu(clocks: number): void {
        this.tickMaster(clocks * 6);
    }

    resetMasterClockCycles(): void {
        this.masterClockCycles = 0;
    }

    getMasterClockCycles(): number {
        return this.masterClockCycles;
    }

    private masterClockCycles = 0;
}
