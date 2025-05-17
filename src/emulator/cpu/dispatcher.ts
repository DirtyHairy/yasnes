import { outdent } from 'outdent';
import { BreakCallback, BreakReason } from '../break';
import { Bus } from '../bus';
import { Clock } from '../clock';
import { Mode, modeToString, SlowPathReason, State } from './state';
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
    let code = `'use strict;'\n`;

    code = generateInstructionFunctions(code);

    for (let i = 0; i < 5; i++) {
        code = generateSubDispatcher(i as Mode, code) + ' \n\n';
    }

    code = generateMainDispatcher(code);

    return code;
}

function generateInstructionFunctions(code: string): string {
    for (let i = 0; i < 0x500; i++) {
        const mode = (i >> 8) as Mode;
        const opcode = i & 0xff;
        const instruction = getInstruction(opcode);

        code =
            code +
            '\n' +
            `const ${instructionFunctionName(mode, opcode)} = \n${indentString(
                instruction.compile(mode, CompilationFlags.none),
                4
            )};\n`;
    }

    return code;
}

function generateMainDispatcher(code: string): string {
    const cases = new Array(5)
        .fill(0)
        .map(
            // prettier-ignore
            (_, i) => outdent`
        case ${hex16(i)}:
            instructionsTotal += ${subDispatcherName(i as Mode)}(instructionLimit - instructionsTotal, state, bus, clock, breakCb);
            break;
    `
        )
        .map((caseBlock) => indentString(caseBlock, 12))
        .join('\n\n');

    return (
        code +
        outdent`
    function dispatcher(instructionLimit, state, bus, clock, breakCb) {
        let instructionsTotal = 0;
        state.breakReason = ${BreakReason.none};

        while (instructionsTotal < instructionLimit) {
            state.slowPath &= ${~(SlowPathReason.break | SlowPathReason.modeChange)};

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

function generateSubDispatcher(mode: Mode, code: string): string {
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
        .map((caseBlock) => indentString(caseBlock, 12))
        .join('\n\n');

    return (
        code +
        outdent`
    function ${subDispatcherName(mode)}(instructionLimit, state, bus, clock, breakCb) {
        let instructions = 0;
        while (instructions < instructionLimit) {
            const opcode = bus.read(state.k | state.pc);
            state.pc = (state.pc + 1) & 0xffff;

            switch (opcode) {
        ${cases}
            }

            instructions++;
            if (state.slowPath) break;
        }

        return instructions;
    }
    `
    );
}

function subDispatcherName(mode: Mode): string {
    return `dispatch_${modeToString(mode)}`;
}

function instructionFunctionName(mode: Mode, opcode: number): string {
    return `instr_${modeToString(mode)}_${opcode.toString(16).padStart(2, '0')}`;
}
