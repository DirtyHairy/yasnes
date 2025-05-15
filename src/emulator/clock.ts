export interface Clock {
    tickMaster(clocks: number): void;
    tickCpu(clocks: number): void;
}
