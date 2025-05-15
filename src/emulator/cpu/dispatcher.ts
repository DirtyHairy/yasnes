import { outdent } from 'outdent';
import { BreakCallback, BreakReason } from '../break';
import { Bus } from '../bus';
import { Clock } from '../clock';
import { Mode, State } from './state';
import { CompilationFlags, getInstruction } from './instruction';
import indentString from 'indent-string';
import { hex16, hex8 } from '../util';

export type DispatcherFn = (
    instructionLimit: number,
    state: State,
    bus: Bus,
    clock: Clock,
    breakCb: BreakCallback
) => number;

export function compileDispatcher(): DispatcherFn {
    const generator = eval(outdent`
        () => {
            ${generateDispatcher()};

            return dispatcher;
        }
        `) as () => DispatcherFn;

    return generator();
}

export function generateDispatcher(): string {
    let code = '';

    code = declareInstructionFunctions(code);

    for (let i = 0; i < 5; i++) {
        const mode = (i << 8) as Mode;

        code = declareSubDispatcher(mode, code) + ' \n\n';
    }

    code = declareDispatcher(code);

    return code;
}

function declareInstructionFunctions(code: string): string {
    for (let i = 0; i < 0x500; i++) {
        const mode = (i & 0x700) as Mode;
        const opcode = i & 0xff;
        const instruction = getInstruction(opcode, mode);

        code =
            code +
            '\n' +
            `const ${instructionFunctionName(mode, opcode)} = \n${indentString(
                instruction.compile(CompilationFlags.none),
                4
            )};\n`;
    }

    return code;
}

function declareDispatcher(code: string): string {
    const cases = new Array(5)
        .fill(0)
        .map((_, i) => (i << 8) as Mode)
        .map(
            (mode) => outdent`
        case ${hex16(mode)}:
            instructionsTotal += ${subDispatcherName(mode)}(remainingInstruction, state, bus, clock, breakCb);
            break;
    `
        )
        .map((i) => indentString(i, 12))
        .join('\n\n');

    return (
        code +
        outdent`
    function dispatcher(instructionLimit, state, bus, clock, breakCb) {
        let instructionsTotal = 0;
        state.breakReason = ${BreakReason.none};

        while (instructionsTotal < instructionLimit) {
            state.slowPath = 0;

            switch(state.mode) {
    ${cases}
            }

            if (state.breakReason) break;
        }

        return instructionsTotal;
    }
    `
    );
}

function declareSubDispatcher(mode: Mode, code: string): string {
    const cases = new Array(0x100)
        .fill(0)
        .map((_, i) => i)
        .map(
            (i) =>
                outdent`
                case ${hex8(i)}:
                    ${instructionFunctionName(mode, i)}(state, bus, clock, breakCb);
                    break;
        `
        )
        .map((x) => indentString(x, 12))
        .join('\n\n');

    return (
        code +
        outdent`
    function ${subDispatcherName(mode)}(instructionLimit, state, bus, clock, breakCb) {
        let instructions = 0;

        for (; instructions < instructionLimit; instructions++) {
            const opcode = bus.read(state.k | state.pc);
            pc = (pc + 1) & 0xffff;

            switch (opcode) {
    ${cases}
            }

            if (state.slowPath) break;
        }

        return instructions;
    }
    `
    );
}

function subDispatcherName(mode: Mode): string {
    return `dispatch_${(mode as number) >>> 8}`;
}

function instructionFunctionName(mode: Mode, opcode: number): string {
    return `instr_${(mode as number) >>> 8}_${opcode.toString(16).padStart(2, '0')}`;
}
