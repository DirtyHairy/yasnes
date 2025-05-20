export interface Clock {
    tickMaster(clocks: number): void;
    tickCpu(): void;
}
