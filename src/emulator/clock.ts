export interface Clock {
    tickMaster(clocks: number): void;
    tickCpu(): void;
    tickCpu_N(ticks: number): void;
}
