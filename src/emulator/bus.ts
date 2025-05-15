import { BreakCallback } from './break';

export interface Bus {
    read(address: number, breakCb: BreakCallback): number;
    write(address: number, value: number, breakCb: BreakCallback): void;
    peek(address: number): number;
}
