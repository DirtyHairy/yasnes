import { Clock } from './clock';

export class ClockSnes implements Clock {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tickMaster(clocks: number): void {}

    tickCpu(clocks: number): void {
        this.tickMaster(clocks * 6);
    }
}
