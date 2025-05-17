import { outdent } from 'outdent';
import { hex8 } from '../util';

export const HEADER_SIZE = 32;

export const enum Speed {
    high,
    low,
}

export const enum Chipset {
    rom,
    rom_ram,
    rom_ram_battery,
}

export const enum TvType {
    pal,
    ntsc,
    unknown,
}

export const enum MapMode {
    loRom,
    hiRom,
    exHiRom,
}

export interface RomHeader {
    title: string;
    mapMode: MapMode;
    speed: Speed;
    chipset: Chipset;
    romSizeLog2: number;
    ramSizeLog2: number;
    country: number;
    developer: number;
    version: number;
    checksum: number;
}

export function decodeHeader(data: Uint8Array): RomHeader {
    if (data.length !== HEADER_SIZE) {
        throw new Error('invalid size');
    }

    let cursor = 0;
    let title = '';
    while (cursor < 21) {
        const char = data[cursor++];

        if (char < 0x20 || char > 0x7e) throw new Error('title contains unprintable characters');
        title += String.fromCharCode(char);
    }

    title = title.trim();

    const mode = data[cursor++];
    if (mode >>> 5 !== 0x01) throw new Error('invalid mode bit');

    const mapMode = decodeMapMode(mode & 0x0f);
    const speed = mode & 0x10 ? Speed.high : Speed.low;
    const chipset = decodeChipset(data[cursor++]);

    const romSizeLog2 = data[cursor++] + 10;
    if (romSizeLog2 > 32) throw new Error('bad ROM size');

    const ramSizeLog2 = data[cursor++] + 10;
    if (ramSizeLog2 > 32) throw new Error('bad RAM size');

    const country = data[cursor++];
    const developer = data[cursor++];
    const version = data[cursor++];

    let checksumComplement = data[cursor++];
    checksumComplement |= data[cursor++] << 8;

    let checksum = data[cursor++];
    checksum |= data[cursor++] << 8;

    if (checksum !== (checksumComplement ^ 0xffff)) {
        throw new Error('checksum does not math complement');
    }

    return { title, mapMode, speed, chipset, romSizeLog2, ramSizeLog2, country, developer, version, checksum };
}

function decodeMapMode(mode: number): MapMode {
    switch (mode) {
        case 0:
            return MapMode.loRom;

        case 1:
            return MapMode.hiRom;

        case 5:
            return MapMode.exHiRom;

        default:
            throw new Error(`invalid map mode ${hex8(mode)}`);
    }
}

function decodeChipset(type: number): Chipset {
    switch (type) {
        case 0x00:
            return Chipset.rom;

        case 0x01:
            return Chipset.rom_ram;

        case 0x02:
            return Chipset.rom_ram_battery;

        default:
            throw new Error(`invalid or unsupported hardware type ${hex8(type)}`);
    }
}

export function countryToString(country: number): string {
    switch (country) {
        case 0x00:
            return 'Japan';

        case 0x01:
            return 'USA / Canada';

        case 0x02:
            return 'Europe / Oceania / Asia';

        case 0x03:
            return 'Sweden / Scandinavia';

        case 0x04:
            return 'Finland';

        case 0x05:
            return 'Denmark';

        case 0x06:
            return 'France';

        case 0x07:
            return 'Holland';

        case 0x08:
            return 'Spain';

        case 0x09:
            return 'Germany / Austria / Switzerland';

        case 0x0a:
            return 'Italy';

        case 0x0b:
            return 'China / Hong Kong';

        case 0x0c:
            return 'Indonesia';

        case 0x0d:
            return 'South Korea';

        case 0x0f:
            return 'Canada';

        case 0x10:
            return 'Brazil';

        case 0x11:
            return 'Australia';

        default:
            return '[unknown]';
    }
}

export function getTvType(country: number): TvType {
    switch (country) {
        case 0x02:
        case 0x03:
        case 0x04:
        case 0x05:
        case 0x06:
        case 0x07:
        case 0x08:
        case 0x09:
        case 0x0a:
        case 0x0b:
        case 0x0c:
        case 0x10:
        case 0x11:
            return TvType.pal;

        case 0x00:
        case 0x01:
        case 0x0d:
        case 0x0f:
            return TvType.ntsc;

        default:
            return TvType.unknown;
    }
}

export function speedToString(speed: Speed): string {
    switch (speed) {
        case Speed.high:
            return 'high';

        case Speed.low:
            return 'low';

        default:
            return '[unknown]';
    }
}

export function chipsetToString(chipset: Chipset): string {
    switch (chipset) {
        case Chipset.rom:
            return 'ROM';

        case Chipset.rom_ram:
            return 'ROM + RAM';

        case Chipset.rom_ram_battery:
            return 'ROM + RAM + battery';

        default:
            return '[unknown]';
    }
}

export function tvTypeToString(tvType: TvType): string {
    switch (tvType) {
        case TvType.pal:
            return 'PAL';

        case TvType.ntsc:
            return 'NTSC';

        default:
            return '[unknown]';
    }
}

export function mapModeToString(mapMode: MapMode): string {
    switch (mapMode) {
        case MapMode.loRom:
            return 'LoROM';

        case MapMode.hiRom:
            return 'HiROM';

        case MapMode.exHiRom:
            return 'ExHiROM';

        default:
            return '[unknown]';
    }
}

export function describeHeader(h: RomHeader): string {
    // prettier-ignore
    return outdent`
        ${h.title}: ${mapModeToString(h.mapMode)}, ${chipsetToString(h.chipset)}, ${1 << (h.romSizeLog2 - 10)}kB ROM, ${1 << (h.ramSizeLog2 - 10)}kB RAM, ${speedToString(h.speed)} speed, ${countryToString(h.country)}: ${tvTypeToString(getTvType(h.country))}, dev ID ${h.developer}, version ${h.version}
    `;
}
