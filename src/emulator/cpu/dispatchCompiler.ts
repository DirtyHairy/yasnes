import { outdent } from 'outdent';
import { BreakCallback, BreakReason } from '../break';
import { Bus } from '../bus';
import { Clock } from '../clock';
import { Mode, modeToString, SlowPathReason, State } from './state';
import { getInstruction } from './instruction';
import indentString from 'indent-string';
import { hex16, hex8 } from '../util';
import { CompilationFlags } from './compiler';

export type DispatchFn = (
    instructionLimit: number,
    state: State,
    bus: Bus,
    clock: Clock,
    breakCb: BreakCallback,
) => number;

export class DispatchCompiler {
    private iFuncNames = new Map<number, string>();

    public compileDispatch(): DispatchFn {
        const generator = eval(outdent`
            () => {
                ${this.generateDispatch()};

                return dispatcher;
            }
            `) as () => DispatchFn;

        return generator();
    }

    public generateDispatch(): string {
        let code = `'use strict';\n\n`;

        code = this.generateInstructionFunctions(code);

        for (let i = 0; i < 5; i++) {
            code = this.generateSubDispatch(i as Mode, code) + ' \n\n';
        }

        code = this.generateMainDispatch(code);

        return code;
    }

    private generateInstructionFunctions(code: string): string {
        for (let opcode = 0; opcode < 0x100; opcode++) {
            const instruction = getInstruction(opcode);
            const addFunction = (name: string, implementation: string, mode?: string): void => {
                code =
                    code +
                    outdent`
                    // ${instruction.description()}${mode !== undefined ? ' [' + mode + ']' : ''}
                    const ${name} = ${implementation};
                    \n\n`;
            };

            const impls = new Array(5).fill(0).map((_, i) => instruction.compile(i as Mode, CompilationFlags.none));

            const doesNotDependOnX = impls[Mode.MX] === impls[Mode.Mx] && impls[Mode.mX] === impls[Mode.mx];
            const doesNotDependOnM = impls[Mode.MX] === impls[Mode.mX] && impls[Mode.Mx] === impls[Mode.mx];
            const emIsRedundant = impls[Mode.MX] === impls[Mode.em];
            const invariant = doesNotDependOnM && doesNotDependOnX && impls[Mode.em] === impls[Mode.mx];
            const tag = opcode.toString(16).padStart(2, '0');

            if (invariant) {
                const name = `instr_${tag}`;

                addFunction(name, impls[Mode.em]);

                for (let i = 0; i <= 0x04; i++) this.iFuncNames.set(opcode | (i << 8), name);
            } else if (doesNotDependOnM && doesNotDependOnX) {
                const name_nt = `instr_nt_${tag}`;
                const name_em = `instr_em_${tag}`;

                addFunction(name_nt, impls[Mode.mx], 'nt');
                addFunction(name_em, impls[Mode.em], 'em');

                for (let i = 0; i <= 0x03; i++) this.iFuncNames.set(opcode | (i << 8), name_nt);
                this.iFuncNames.set(opcode | 0x400, name_em);
            } else if (doesNotDependOnM) {
                const name_X = `instr_X_${tag}`;
                const name_x = `instr_x_${tag}`;
                const name_em = `instr_em_${tag}`;

                addFunction(name_X, impls[Mode.mX], emIsRedundant ? 'X,em' : 'M');
                addFunction(name_x, impls[Mode.mx], 'x');
                if (!emIsRedundant) addFunction(name_em, impls[Mode.em], 'em');

                [Mode.MX, Mode.mX].forEach((mode) => this.iFuncNames.set(opcode | (mode << 8), name_X));
                [Mode.Mx, Mode.mx].forEach((mode) => this.iFuncNames.set(opcode | (mode << 8), name_x));
                this.iFuncNames.set(opcode | 0x400, emIsRedundant ? name_X : name_em);
            } else if (doesNotDependOnX) {
                const name_M = `instr_M_${tag}`;
                const name_m = `instr_m_${tag}`;
                const name_em = `instr_em_${tag}`;

                addFunction(name_M, impls[Mode.Mx], emIsRedundant ? 'M,em' : 'M');
                addFunction(name_m, impls[Mode.mx], 'm');
                if (!emIsRedundant) addFunction(name_em, impls[Mode.em], 'em');

                [Mode.MX, Mode.Mx].forEach((mode) => this.iFuncNames.set(opcode | (mode << 8), name_M));
                [Mode.mX, Mode.mx].forEach((mode) => this.iFuncNames.set(opcode | (mode << 8), name_m));
                this.iFuncNames.set(opcode | 0x400, emIsRedundant ? name_M : name_em);
            } else {
                for (let i = 0; i <= (emIsRedundant ? 0x03 : 0x04); i++) {
                    const name = `instr_${modeToString(i as Mode)}_${tag}`;

                    addFunction(
                        name,
                        impls[i],
                        emIsRedundant && (i as Mode) === Mode.MX ? 'MX,em' : modeToString(i as Mode),
                    );

                    this.iFuncNames.set(opcode | (i << 8), name);
                }

                if (emIsRedundant) this.iFuncNames.set(opcode | 0x400, `instr_${modeToString(Mode.MX)}_${tag}`);
            }
        }

        return code;
    }

    private generateMainDispatch(code: string): string {
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

    private generateSubDispatch(mode: Mode, code: string): string {
        const cases = new Array(0x100)
            .fill(0)
            .map((_, i) => i)
            .map(
                (i) =>
                    outdent`
                    case ${hex8(i)}:
                        ${this.iFuncNames.get(i | (mode << 8))}(state, bus, clock, breakCb);
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
                const opcode = bus.read(state.k | state.pc, breakCb);
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
