import 'jquery.terminal';
import 'jquery.terminal/css/jquery.terminal.min.css';

import $ from 'jquery';
import { outdent } from 'outdent';
import { Emulator } from './emulator/emulator';
import { openFile } from './file';
import { describeError } from './emulator/util';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let emulator: Emulator | undefined;

function initialize(term: JQueryTerminal, cartridgeData: Uint8Array): void {
    try {
        emulator = new Emulator(cartridgeData);

        term.echo(emulator.getCartridge().description());
        term.echo('emulator initialized');
    } catch (e: unknown) {
        term.echo(`ERROR: failed to initialize emulator: ${describeError(e)}`);
    }
}

function load(term: JQueryTerminal) {
    openFile((data, name) => {
        term.echo(`loaded file ${name}`);

        initialize(term, data);
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
});
