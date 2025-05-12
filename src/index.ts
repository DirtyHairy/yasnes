import 'jquery.terminal';
import 'jquery.terminal/css/jquery.terminal.min.css';

import $ from 'jquery';
import { outdent } from 'outdent';
import { Emulator } from './emulator/emulator';
import { openFile } from './file';
import { describeError } from './emulator/util';
import { Rom } from './storage/model';
import { Storage } from './storage/storage';

const storage = new Storage();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let emulator: Emulator | undefined;

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

        if (newRom) await storage.putRom(rom);

        term.echo(emulator.getCartridge().description());
        term.echo('emulator initialized');
    } catch (e: unknown) {
        term.echo(`ERROR: failed to initialize emulator: ${describeError(e)}`);
    }
}

function load(term: JQueryTerminal) {
    openFile((data, name) => {
        void initialize(term, { name, data });
    });
}

const interpreter: JQueryTerminal.ObjectInterpreter = {
    help() {
        this.echo(outdent`
            Usage:
            
            help                        Show this help message
            load                        Load a new cartridge and reinitialize the emulator
        `);
    },
    load() {
        load(this);
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
