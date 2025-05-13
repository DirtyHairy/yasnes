export interface Cartridge {
    description(): string;

    read(address: number): number;
    write(address: number, value: number): void;

    peek(address: number): number;
}
