import 'jquery.terminal';
import 'jquery.terminal/css/jquery.terminal.min.css';

import $ from 'jquery';
import { outdent } from 'outdent';

const interpreter: JQueryTerminal.ObjectInterpreter = {
    help() {
        this.echo(outdent`
            Usage:
            
            help                        Show this help message
        `);
    },
};

$('#terminal').terminal(interpreter, {
    greetings: 'Welcome to YANSES!\n',
    completion: Object.keys(interpreter),
    exit: false,
    checkArity: false,
});
