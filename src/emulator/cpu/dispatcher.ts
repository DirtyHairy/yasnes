import { outdent } from 'outdent';
import { BreakCallback, BreakReason } from '../break';
import { Bus } from '../bus';
import { Clock } from '../clock';
import { Mode, modeToString, SlowPathReason, State } from './state';
import { getInstruction } from './instruction';
import indentString from 'indent-string';
import { hex16, hex8 } from '../util';
import { CompilationFlags } from './compiler';

export type DispatcherFn = (
    instructionLimit: number,
    state: State,
    bus: Bus,
    clock: Clock,
    breakCb: BreakCallback,
) => number;

export class DispatcherCompiler {
    private instructionFunctionNames = new Map<number, string>();

    public compileDispatcher(): DispatcherFn {
        const generator = eval(outdent`
            () => {
                ${this.generateDispatcher()};

                return dispatcher;
            }
            `) as () => DispatcherFn;

        return generator();
    }

    public generateDispatcher(): string {
        let code = `'use strict';\n\n`;

        code = this.generateInstructionFunctions(code);

        for (let i = 0; i < 5; i++) {
            code = this.generateSubDispatcher(i as Mode, code) + ' \n\n';
        }

        code = this.generateMainDispatcher(code);

        return code;
    }

    private generateInstructionFunctions(code: string): string {
        for (let opcode = 0; opcode < 0x100; opcode++) {
            const instruction = getInstruction(opcode);
            const addFunction = (name: string, implementation: string): void => {
                code =
                    code +
                    outdent`
                    // ${instruction.description()}
                    const ${name} = ${implementation};
                    \n\n`;
            };

            const impls = new Array(5).fill(0).map((_, i) => instruction.compile(i as Mode, CompilationFlags.none));

            if (impls.find((x) => x !== impls[0]) === undefined) {
                const name = `instr_${opcode.toString(16).padStart(2, '0')}`;

                addFunction(name, impls[0]);

                impls.forEach((impl, i) => this.instructionFunctionNames.set(opcode | (i << 8), name));
            } else if (impls.slice(0, 4).find((x) => x !== impls[0]) === undefined) {
                const name_nt = `instr_nt_${opcode.toString(16).padStart(2, '0')}`;
                const name_em = `instr_em_${opcode.toString(16).padStart(2, '0')}`;

                addFunction(name_nt, impls[0]);
                addFunction(name_em, impls[4]);

                impls.forEach((impl, i) =>
                    this.instructionFunctionNames.set(opcode | (i << 8), i === 4 ? name_em : name_nt),
                );
            } else {
                impls.forEach((impl, i) => {
                    const name = `instr_${modeToString(i as Mode)}_${opcode.toString(16).padStart(2, '0')}`;

                    addFunction(name, impl);

                    this.instructionFunctionNames.set(opcode | (i << 8), name);
                });
            }
        }

        return code;
    }

    private generateMainDispatcher(code: string): string {
        const cases = new Array(5)
            .fill(0)
            .map(
                // prettier-ignore
                (_, i) => outdent`
            case ${hex16(i)}:
                instructionsTotal += ${this.subDispatcherName(i as Mode)}(instructionLimit - instructionsTotal, state, bus, clock, breakCb);
                break;
        `,
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

    private generateSubDispatcher(mode: Mode, code: string): string {
        const cases = new Array(0x100)
            .fill(0)
            .map((_, i) => i)
            .map(
                (i) =>
                    outdent`
                    case ${hex8(i)}:
                        ${this.instructionFunctionNames.get(i | (mode << 8))}(state, bus, clock, breakCb);
                        break;
            `,
            )
            .map((caseBlock) => indentString(caseBlock, 12))
            .join('\n\n');

        return (
            code +
            outdent`
        function ${this.subDispatcherName(mode)}(instructionLimit, state, bus, clock, breakCb) {
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

    private subDispatcherName(mode: Mode): string {
        return `dispatch_${modeToString(mode)}`;
    }
}
