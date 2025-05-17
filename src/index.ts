import 'jquery.terminal';
import 'jquery.terminal/css/jquery.terminal.min.css';

import $ from 'jquery';
import { outdent } from 'outdent';
import { Emulator } from './emulator/emulator';
import { openFile } from './file';
import { describeError } from './emulator/util';
import { Rom } from './storage/model';
import { Storage } from './storage/storage';
import { Debugger } from './emulator/debugger';
import { BreakReason } from './emulator/break';

const storage = new Storage();

let emulator: Emulator | undefined;
let dbgr: Debugger | undefined;

function normalize(x: string | number | RegExp | undefined): string | undefined {
    return x === undefined ? undefined : x.toString();
}

function parseNumber(x: string | undefined): number | undefined {
    if (x === undefined) return undefined;

    if (/^0x[0-9a-fA-F]+$/.test(x)) return parseInt(x.substring(2), 16);
    if (/^\d+$/.test(x)) return parseInt(x, 10);

    return undefined;
}

async function initialize(term: JQueryTerminal, rom?: Rom): Promise<void> {
    const newRom = rom !== undefined;

    if (!newRom) {
        rom = await storage.getRom();
    } else {
        await storage.removeRom();
    }

    if (!rom) return;

    try {
        term.echo(`loaded file ${rom.name}`);
        emulator = new Emulator(rom.data);
        dbgr = new Debugger(emulator);

        if (newRom) await storage.putRom(rom);

        term.echo(emulator.getCartridge().description() + '\n');
        term.echo('emulator initialized');
    } catch (e: unknown) {
        term.echo(`ERROR: failed to initialize emulator: ${describeError(e)}`);
    }
}

function load(term: JQueryTerminal): void {
    openFile((data, name) => {
        void initialize(term, { name, data });
    });
}

function help(term: JQueryTerminal): void {
    term.echo(outdent`
        Usage:
        
        disassemble [limit = 16]                Disassemble approx. [limit] bytes at PC
        disassemble-at <addr> [limit = 16]      Disassemble approx. [limit] bytes at <addr>
        dump <start> [count = 16]               Dump [count] bytes of memory
        help                                    Show this help message
        load                                    Load a new cartridge and reinitialize the emulator
        reset                                   Reset the emulator
        state                                   Dump state
        step [count = 1]                        Step [count] instructions
    `);
}

const interpreter: JQueryTerminal.ObjectInterpreter = {
    disassemble(counStr): void {
        if (dbgr === undefined) {
            this.echo('not initialized');
            return;
        }

        const count = parseNumber(normalize(counStr)) ?? 16;

        this.echo(dbgr.disassemble(count));
    },
    'disassemble-at'(addressStr, countStr): void {
        if (dbgr === undefined) {
            this.echo('not initialized');
            return;
        }

        const address = parseNumber(normalize(addressStr));
        if (address === undefined) return help(this);

        const count = parseNumber(normalize(countStr)) ?? 16;

        this.echo(dbgr.disassembleAt(address, count));
    },
    dump(startStr, countStr): void {
        const start = parseNumber(normalize(startStr));
        const count = parseNumber(normalize(countStr ?? '16'));

        if (start === undefined || count === undefined) return help(this);

        this.echo(dbgr?.dump(start, Math.min(count, 256)));
    },
    help(): void {
        help(this);
    },
    load() {
        load(this);
    },
    reset(): void {
        if (emulator === undefined) {
            this.echo('not initialized');
            return;
        }

        emulator.reset();
    },
    state(): void {
        if (emulator === undefined) {
            this.echo('not initialized');
            return;
        }

        this.echo('CPU:');
        this.echo(emulator.getCpu().describeState());
    },
    step(countStr): void {
        if (emulator === undefined) {
            this.echo('not initialized');
            return;
        }

        const count = parseNumber(normalize(countStr)) ?? 1;

        const cpu = emulator.getCpu();
        const clock = emulator.getClock();

        clock.resetMasterClockCycles();
        const instructions = emulator.run(count);

        this.echo(`executed ${instructions} instructions in ${clock.getMasterClockCycles()} master clock cycles`);

        if (cpu.state.breakReason !== BreakReason.none) {
            this.echo(`break: ${cpu.getBreakMessage()}`);
        }
    },
};

$('#terminal').terminal(interpreter, {
    greetings: 'Welcome to YASNES!\n',
    completion: Object.keys(interpreter),
    exit: false,
    checkArity: false,
    onInit() {
        void initialize(this);
    },
});
