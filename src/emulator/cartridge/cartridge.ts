import { BreakCallback } from '../break';

export interface Cartridge {
    description(): string;

    read(address: number, previousValue: number, breakCb: BreakCallback): number;
    write(address: number, value: number, breakCb: BreakCallback): void;

    peek(address: number): number;
    poke(address: number, value: number, breakCb: BreakCallback): void;
}
