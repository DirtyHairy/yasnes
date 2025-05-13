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

        term.echo(emulator.getCartridge().description());
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
        
        help                            Show this help message
        load                            Load a new cartridge and reinitialize the emulator
        dump <start> [count = 16]       Dump memory
    `);
}

const interpreter: JQueryTerminal.ObjectInterpreter = {
    help(): void {
        help(this);
    },
    load() {
        load(this);
    },
    dump(startStr, countStr): void {
        const start = parseNumber(normalize(startStr));
        const count = parseNumber(normalize(countStr ?? '16'));

        if (start === undefined || count === undefined) {
            return help(this);
        }

        this.echo(dbgr?.dump(start, Math.min(count, 256)));
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
