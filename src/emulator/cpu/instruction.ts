import { Bus } from '../bus';
import { Flag, Mode, SlowPathReason } from './state';
import { BreakReason } from '../break';
import { outdent } from 'outdent';
import { CompilationFlags, Compiler, INCREMENT_PC, READ_PC } from './compiler';
import { DisassembleResult, disassembleWithAddressingMode } from './disassembler';
import { AddressingMode } from './addressingMode';
import { hex8 } from '../util';

const instructions = new Array<Instruction>(0x100);

export interface Instruction {
    get mnemonic(): string;
    get addressingMode(): AddressingMode;

    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult;
    compile(mode: Mode, flags: number): string;
    isImplemented(): boolean;
    description(): string;
}

export function getInstruction(opcode: number): Instruction {
    return instructions[opcode];
}

export function registerInstruction(opcode: number, instruction: Instruction): void {
    instructions[opcode] = instruction;
}

abstract class InstructionBase implements Instruction {
    abstract readonly mnemonic: string;
    abstract readonly addressingMode: AddressingMode;

    constructor(protected opcode: number) {}

    compile(mode: Mode, flags: number): string {
        const compiler = new Compiler(flags);

        this.build(mode, compiler, flags);

        return compiler.compile();
    }

    isImplemented(): boolean {
        return this.build !== InstructionBase.prototype.build;
    }

    description(): string {
        return this.mnemonic + ' ' + this.addressingMode;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected build(mode: Mode, compiler: Compiler, flags: CompilationFlags): void {
        compiler.add(outdent`
            breakCb(${BreakReason.instructionFault}, '${this.mnemonic} not implemented');
        `);
    }

    abstract disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult;
}

// Base class for instructions with implied addressing mode
abstract class InstructionImplied extends InstructionBase {
    readonly addressingMode = AddressingMode.implied;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult {
        return {
            disassembly: this.mnemonic,
            additionalBytes: 0,
            mode,
        };
    }
}

// Base class for instructions with various addressing modes
abstract class InstructionWithAddressingMode extends InstructionBase {
    immWidthHint: ((mode: Mode) => boolean) | undefined;

    constructor(
        opcode: number,
        public readonly addressingMode: AddressingMode,
    ) {
        super(opcode);
    }

    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult {
        return disassembleWithAddressingMode(
            this.mnemonic,
            (address + 1) & 0xffff,
            this.addressingMode,
            mode,
            bus,
            this.immWidthHint,
        );
    }
}

function is16_M(mode: Mode): boolean {
    switch (mode) {
        case Mode.mX:
        case Mode.mx:
            return true;

        default:
            return false;
    }
}

function is16_X(mode: Mode): boolean {
    switch (mode) {
        case Mode.Mx:
        case Mode.mx:
            return true;

        default:
            return false;
    }
}

// ADC - Add with Carry
class InstructionADC extends InstructionWithAddressingMode {
    immWidthHint = is16_M;

    readonly mnemonic = 'ADC';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.load(mode, this.addressingMode, true).add(outdent`
                    if (state.p & ${Flag.d}) {
                        let res1 =  (state.a & 0x000f) + (op & 0x000f) + (state.p & ${Flag.c});
                        if (res1 > 0x0009) res1 += 0x0006;

                        let res2 =  (state.a & 0x00f0) + (op & 0x00f0) + (res1 > 0x0009 ? 0x0010 : 0);
                        if (res2 > 0x0090) res2 += 0x0060;

                        let res3 =  (state.a & 0x0f00) + (op & 0x0f00) + (res2 > 0x0090 ? 0x0100 : 0);
                        if (res3 > 0x0900) res3 += 0x0600;

                        let res4 =  (state.a & 0xf000) + (op & 0xf000) + (res3 > 0x0900 ? 0x1000 : 0);

                        state.p &= ${~(Flag.c | Flag.z | Flag.v | Flag.n)};
                        state.p |= (~(state.a ^ op) & (op ^ res4) & 0x8000) >>> 9;

                        if (res4 > 0x9000) {
                            state.p |= ${Flag.c};
                            res4 += 0x6000;
                        }

                        state.a = (res1 & 0x000f) | (res2 & 0x00f0) | (res3 & 0x0f00) | (res4 & 0xf000);
                    } else {
                        const res = state.a + op + (state.p & ${Flag.c});

                        state.p &= ${~(Flag.c | Flag.z | Flag.v | Flag.n)};
                        state.p |= (res >>> 16) & ${Flag.c};
                        state.p |= (~(state.a ^ op) & (op ^ res) & 0x8000) >>> 9;

                        state.a = res & 0xffff;
                    }

                    if (state.a === 0) state.p |= ${Flag.z};
                    state.p |= ((state.a >>> 8) & ${Flag.n});
                `);
        } else {
            compiler.load(mode, this.addressingMode, false).add(outdent`
                    const op2 = state.a & 0xff;
                    let res;

                    if (state.p & ${Flag.d}) {
                        let res1 =  (op2 & 0x0f) + (op & 0x0f) + (state.p & ${Flag.c});
                        if (res1 > 0x09) res1 += 0x06;

                        let res2 = (op2 & 0xf0) + (op & 0xf0) + (res1 > 0x0f ? 0x10 : 0);
                        
                        state.p &= ${~(Flag.c | Flag.z | Flag.v | Flag.n)};
                        state.p |= (~(op2 ^ op) & (op ^ res2) & 0x80) >>> 1;

                        if (res2 > 0x90) {
                            state.p |= ${Flag.c};
                            res2 += 0x60;
                        }

                        res = (res1 & 0x0f) | (res2 & 0xf0);
                    } else {
                        res = op2 + op + (state.p & ${Flag.c});

                        state.p &= ${~(Flag.c | Flag.z | Flag.v | Flag.n)};

                        state.p |= (res >>> 8) & ${Flag.c};
                        res &= 0xff;

                        state.p |= (~(op2 ^ op) & (op ^ res) & 0x80) >>> 1;
                    }

                    if (res === 0) state.p |= ${Flag.z};
                    state.p |= (res & ${Flag.n});

                    state.a = (state.a & 0xff00) | res;
                `);
        }
    }
}

// AND - Logical AND
class InstructionAND extends InstructionWithAddressingMode {
    immWidthHint = is16_M;

    readonly mnemonic = 'AND';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.load(mode, this.addressingMode, true).add('state.a &= op;').setFlagsNZ('state.a', true);
        } else {
            compiler
                .load(mode, this.addressingMode, false)
                .add('state.a &= (op | 0xff00);')
                .setFlagsNZ('(state.a & 0xff)', false);
        }
    }
}

// ASL - Arithmetic Shift Left
class InstructionASL extends InstructionWithAddressingMode {
    readonly mnemonic = 'ASL';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.rmw(
                mode,
                this.addressingMode,
                true,
                outdent`
                    let res = (op << 1) & 0xffff;
                    state.p = (state.p & ${~Flag.c}) | op >>> 15;
                `,
            );
        } else {
            compiler.rmw(
                mode,
                this.addressingMode,
                false,
                outdent`
                    let res = (op << 1) & 0xff;
                    state.p = (state.p & ${~Flag.c}) | op >>> 7;
                `,
            );
        }

        compiler.setFlagsNZ('res', is16_M(mode));
    }
}

// BCC - Branch if Carry Clear
class InstructionBCC extends InstructionWithAddressingMode {
    readonly mnemonic = 'BCC';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.branch(mode, `(state.p & ${Flag.c}) === 0`);
    }
}

// BCS - Branch if Carry Set
class InstructionBCS extends InstructionWithAddressingMode {
    readonly mnemonic = 'BCS';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.branch(mode, `state.p & ${Flag.c}`);
    }
}

// BEQ - Branch if Equal
class InstructionBEQ extends InstructionWithAddressingMode {
    readonly mnemonic = 'BEQ';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.branch(mode, `state.p & ${Flag.z}`);
    }
}

// BIT - Bit Test
class InstructionBIT extends InstructionWithAddressingMode {
    readonly mnemonic = 'BIT';

    protected build(mode: Mode, compiler: Compiler): void {
        const mask = this.addressingMode === AddressingMode.imm ? ~Flag.z : ~(Flag.z | Flag.v | Flag.n);

        if (is16_M(mode)) {
            compiler.load(mode, this.addressingMode, true).add(
                outdent`
                    state.p &= ${mask};
                    if ((op & state.a) === 0) state.p |= ${Flag.z};
                `,
            );

            if (this.addressingMode !== AddressingMode.imm) {
                compiler.add(outdent`
                    state.p |= (op & 0x8000) >>> 8;
                    state.p |= (op & 0x4000) >>> 8;
                `);
            }
        } else {
            compiler.load(mode, this.addressingMode, false).add(
                outdent`
                    state.p &= ${mask};
                    if ((op & state.a & 0xff) === 0) state.p |= ${Flag.z};
                `,
            );

            if (this.addressingMode !== AddressingMode.imm) {
                compiler.add(outdent`
                    state.p |= op & 0x80;
                    state.p |= op & 0x40;
                `);
            }
        }
    }
}

// BMI - Branch if Minus
class InstructionBMI extends InstructionWithAddressingMode {
    readonly mnemonic = 'BMI';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.branch(mode, `state.p & ${Flag.n}`);
    }
}

// BNE - Branch if Not Equal
class InstructionBNE extends InstructionWithAddressingMode {
    readonly mnemonic = 'BNE';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.branch(mode, `(state.p & ${Flag.z}) === 0`);
    }
}

// BPL - Branch if Plus
class InstructionBPL extends InstructionWithAddressingMode {
    readonly mnemonic = 'BPL';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.branch(mode, `(state.p & ${Flag.n}) === 0`);
    }
}

// BRA - Branch Always
class InstructionBRA extends InstructionWithAddressingMode {
    readonly mnemonic = 'BRA';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.branch(mode);
    }
}

// BRK - Break
class InstructionBRK extends InstructionWithAddressingMode {
    readonly mnemonic = 'BRK';

    immWidthHint = (): boolean => false;

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.vector(mode, 0xffe6, 0xfffe, true);
    }
}

// BRL - Branch Long
class InstructionBRL extends InstructionWithAddressingMode {
    readonly mnemonic = 'BRL';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.loadPointer(mode, this.addressingMode, true).add('state.pc = ptr;').tick();
    }
}

// BVC - Branch if Overflow Clear
class InstructionBVC extends InstructionWithAddressingMode {
    readonly mnemonic = 'BVC';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.branch(mode, `(state.p & ${Flag.v}) === 0`);
    }
}

// BVS - Branch if Overflow Set
class InstructionBVS extends InstructionWithAddressingMode {
    readonly mnemonic = 'BVS';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.branch(mode, `state.p & ${Flag.v}`);
    }
}

// CLC - Clear Carry Flag
class InstructionCLC extends InstructionImplied {
    readonly mnemonic = 'CLC';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add(`state.p &= ${~Flag.c}`).tick();
    }
}

// CLD - Clear Decimal Mode
class InstructionCLD extends InstructionImplied {
    readonly mnemonic = 'CLD';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add(`state.p &= ${~Flag.d};`).tick();
    }
}

// CLI - Clear Interrupt Disable
class InstructionCLI extends InstructionImplied {
    readonly mnemonic = 'CLI';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add(`state.p &= ${~Flag.i}`).tick();
    }
}

// CLV - Clear Overflow Flag
class InstructionCLV extends InstructionImplied {
    readonly mnemonic = 'CLV';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add(`state.p &= ${~Flag.v};`).tick();
    }
}

// CMP - Compare
class InstructionCMP extends InstructionWithAddressingMode {
    immWidthHint = is16_M;

    readonly mnemonic = 'CMP';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.load(mode, this.addressingMode, true).add(outdent`
                    const res = state.a + (~op & 0xffff) + 1;

                    state.p &= ${~(Flag.c | Flag.n | Flag.z)}

                    state.p |= (res >>> 8) & ${Flag.n};
                    state.p |= (res >>> 16) & ${Flag.c};
                    if ((res & 0xffff) === 0) state.p |= ${Flag.z};
                `);
        } else {
            compiler.load(mode, this.addressingMode, false).add(outdent`
                    const res = (state.a & 0xff) + (~op & 0xff) + 1;

                    state.p &= ${~(Flag.c | Flag.n | Flag.z)}

                    state.p |= res & ${Flag.n};
                    state.p |= (res >>> 8) & ${Flag.c};
                    if ((res & 0xff) === 0) state.p |= ${Flag.z};
                `);
        }
    }
}

// COP - Co-Processor
class InstructionCOP extends InstructionWithAddressingMode {
    readonly mnemonic = 'COP';

    immWidthHint = (): boolean => false;

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.vector(mode, 0xffe4, 0xfff4);
    }
}

// CPX - Compare X Register
class InstructionCPX extends InstructionWithAddressingMode {
    immWidthHint = is16_X;

    readonly mnemonic = 'CPX';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_X(mode)) {
            compiler.load(mode, this.addressingMode, true).add(outdent`
                    const res = state.x + (~op & 0xffff) + 1;

                    state.p &= ${~(Flag.c | Flag.n | Flag.z)}

                    state.p |= (res >>> 8) & ${Flag.n};
                    state.p |= (res >>> 16) & ${Flag.c};
                    if ((res & 0xffff) === 0) state.p |= ${Flag.z};
                `);
        } else {
            compiler.load(mode, this.addressingMode, false).add(outdent`
                    const res = (state.x & 0xff) + (~op & 0xff) + 1;

                    state.p &= ${~(Flag.c | Flag.n | Flag.z)}

                    state.p |= res & ${Flag.n};
                    state.p |= (res >>> 8) & ${Flag.c};
                    if ((res & 0xff) === 0) state.p |= ${Flag.z};
                `);
        }
    }
}

// CPY - Compare Y Register
class InstructionCPY extends InstructionWithAddressingMode {
    immWidthHint = is16_X;

    readonly mnemonic = 'CPY';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_X(mode)) {
            compiler.load(mode, this.addressingMode, true).add(outdent`
                    const res = state.y + (~op & 0xffff) + 1;

                    state.p &= ${~(Flag.c | Flag.n | Flag.z)}

                    state.p |= (res >>> 8) & ${Flag.n};
                    state.p |= (res >>> 16) & ${Flag.c};
                    if ((res & 0xffff) === 0) state.p |= ${Flag.z};
                `);
        } else {
            compiler.load(mode, this.addressingMode, false).add(outdent`
                    const res = (state.y & 0xff) + (~op & 0xff) + 1;

                    state.p &= ${~(Flag.c | Flag.n | Flag.z)}

                    state.p |= res & ${Flag.n};
                    state.p |= (res >>> 8) & ${Flag.c};
                    if ((res & 0xff) === 0) state.p |= ${Flag.z};
                `);
        }
    }
}

// DEC - Decrement Memory
class InstructionDEC extends InstructionWithAddressingMode {
    readonly mnemonic = 'DEC';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.rmw(mode, this.addressingMode, true, 'let res = (op - 1) & 0xffff;');
        } else {
            compiler.rmw(mode, this.addressingMode, false, 'let res = (op - 1) & 0xff;');
        }

        compiler.setFlagsNZ('res', is16_M(mode));
    }
}

// DEX - Decrement X Register
class InstructionDEX extends InstructionImplied {
    readonly mnemonic = 'DEX';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(`state.x = (state.x - 1) & ${is16_X(mode) ? '0xffff' : '0xff'}`)
            .tick()
            .setFlagsNZ('state.x', is16_X(mode));
    }
}

// DEY - Decrement Y Register
class InstructionDEY extends InstructionImplied {
    readonly mnemonic = 'DEY';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(`state.y = (state.y - 1) & ${is16_X(mode) ? '0xffff' : '0xff'}`)
            .tick()
            .setFlagsNZ('state.y', is16_X(mode));
    }
}

// EOR - Exclusive OR
class InstructionEOR extends InstructionWithAddressingMode {
    immWidthHint = is16_M;

    readonly mnemonic = 'EOR';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.load(mode, this.addressingMode, true).add('state.a ^= op;').setFlagsNZ('state.a', true);
        } else {
            compiler
                .load(mode, this.addressingMode, false)
                .add('state.a = (state.a & 0xff00) | ((state.a & 0xff) ^ op);')
                .setFlagsNZ('(state.a & 0xff)', false);
        }
    }
}

// INC - Increment Memory
class InstructionINC extends InstructionWithAddressingMode {
    readonly mnemonic = 'INC';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.rmw(mode, this.addressingMode, true, 'let res = (op + 1) & 0xffff;');
        } else {
            compiler.rmw(mode, this.addressingMode, false, 'let res = (op + 1) & 0xff;');
        }

        compiler.setFlagsNZ('res', is16_M(mode));
    }
}

// INX - Increment X Register
class InstructionINX extends InstructionImplied {
    readonly mnemonic = 'INX';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(`state.x = (state.x + 1) & ${is16_X(mode) ? '0xffff' : '0xff'}`)
            .tick()
            .setFlagsNZ('state.x', is16_X(mode));
    }
}

// INY - Increment Y Register
class InstructionINY extends InstructionImplied {
    readonly mnemonic = 'INY';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(`state.y = (state.y + 1) & ${is16_X(mode) ? '0xffff' : '0xff'}`)
            .tick()
            .setFlagsNZ('state.y', is16_X(mode));
    }
}

// JMP - Jump
class InstructionJMP extends InstructionWithAddressingMode {
    readonly mnemonic = 'JMP';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.loadPointer(mode, this.addressingMode);

        switch (this.addressingMode) {
            case AddressingMode.abs_24:
            case AddressingMode.long:
                compiler.add(outdent`
                        state.pc = ptr & 0xffff;
                        state.k = ptr & 0xff0000;
                    `);

                break;

            default:
                compiler.add('state.pc = ptr & 0xffff;');
                break;
        }
    }
}

// JSL - Jump to Subroutine Long
class InstructionJSL extends InstructionWithAddressingMode {
    readonly mnemonic = 'JSL';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(
                outdent`
                    let ptr = ${READ_PC};
                    ${INCREMENT_PC};

                    ptr |= (${READ_PC}) << 8;
                    ${INCREMENT_PC};
                `,
            )
            .push8(Mode.mx, 'state.k >> 16')
            .tick()
            .add(outdent`state.k = (${READ_PC}) << 16;`)
            .push16(Mode.mx, 'state.pc')
            .add('state.pc = ptr;')
            .fixupSP(mode);
    }
}

// JSR - Jump to Subroutine
class InstructionJSR extends InstructionWithAddressingMode {
    readonly mnemonic = 'JSR';

    protected build(mode: Mode, compiler: Compiler): void {
        if (this.addressingMode === AddressingMode.abs_x_16) {
            compiler
                .add(
                    outdent`
                        let ptr0 = ${READ_PC};
                        ${INCREMENT_PC};
                    `,
                )
                .push16(Mode.mx, 'state.pc')
                .add(
                    outdent`
                        ptr0 |= (${READ_PC}) << 8;
                        ${INCREMENT_PC};
                    `,
                )
                .tick()
                .add(
                    outdent`
                        ptr0 = (ptr0 + state.x) & 0xffff;
                        let ptr = bus.read(ptr0 | state.k, breakCb);

                        ptr0 = (ptr0 + 1) & 0xffff;
                        ptr |= bus.read(ptr0 | state.k, breakCb) << 8;

                        state.pc = ptr;
                    `,
                )
                .fixupSP(mode);

            return;
        }

        compiler
            .loadPointer(mode, this.addressingMode)
            .tick()
            .add('state.pc = (state.pc - 1) & 0xffff')
            .push16(mode, 'state.pc')
            .add('state.pc = ptr & 0xffff;');
    }
}

// LDA - Load Accumulator
class InstructionLDA extends InstructionWithAddressingMode {
    immWidthHint = is16_M;

    readonly mnemonic = 'LDA';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .load(mode, this.addressingMode, is16_M(mode))
            .add(is16_M(mode) ? 'state.a = op;' : 'state.a = (state.a & 0xff00) | op;')
            .setFlagsNZ('op', is16_M(mode));
    }
}

// LDX - Load X Register
class InstructionLDX extends InstructionWithAddressingMode {
    immWidthHint = is16_X;

    readonly mnemonic = 'LDX';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .load(mode, this.addressingMode, is16_X(mode))
            .add(is16_X(mode) ? 'state.x = op;' : 'state.x = (state.x & 0xff00) | op;')
            .setFlagsNZ('op', is16_X(mode));
    }
}

// LDY - Load Y Register
class InstructionLDY extends InstructionWithAddressingMode {
    immWidthHint = is16_X;

    readonly mnemonic = 'LDY';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .load(mode, this.addressingMode, is16_X(mode))
            .add(is16_X(mode) ? 'state.y = op;' : 'state.y = (state.y & 0xff00) | op;')
            .setFlagsNZ('op', is16_X(mode));
    }
}

// LSR - Logical Shift Right
class InstructionLSR extends InstructionWithAddressingMode {
    readonly mnemonic = 'LSR';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.rmw(
                mode,
                this.addressingMode,
                true,
                outdent`
                    let res = (op >>> 1) & 0xffff;
                    state.p = (state.p & ${~Flag.c}) | (op & ${Flag.c});
                `,
            );
        } else {
            compiler.rmw(
                mode,
                this.addressingMode,
                false,
                outdent`
                    let res = (op >>> 1) & 0xff;
                    state.p = (state.p & ${~Flag.c}) | (op & ${Flag.c});
                `,
            );
        }

        compiler.setFlagsNZ('res', is16_M(mode));
    }
}

// MVN - Block Move Negative

abstract class InstructionMove extends InstructionWithAddressingMode {
    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(
                outdent`
                    const sourceBank = (${READ_PC}) << 16;
                    ${INCREMENT_PC};

                    state.dbr = (${READ_PC}) << 16;
                    ${INCREMENT_PC};
                    
                    const data = bus.read(sourceBank | state.x, breakCb);
                    bus.write(state.dbr | state.y, data, breakCb);

                    state.x = (state.x ${this.stepOperator()}) & ${is16_X(mode) ? '0xffff' : '0xff'};
                    state.y = (state.y ${this.stepOperator()}) & ${is16_X(mode) ? '0xffff' : '0xff'};
                    state.a = (state.a - 1) & 0xffff;

                    if (state.a !== 0xffff) state.pc = (state.pc - 3) & 0xffff;
                `,
            )
            .tick(2);
    }

    protected abstract stepOperator(): string;
}

class InstructionMVN extends InstructionMove {
    readonly mnemonic = 'MVN';

    protected stepOperator(): string {
        return '+ 1';
    }
}

// MVP - Block Move Positive
class InstructionMVP extends InstructionMove {
    readonly mnemonic = 'MVP';

    protected stepOperator(): string {
        return '- 1';
    }
}

// NOP - No Operation
class InstructionNOP extends InstructionImplied {
    readonly mnemonic = 'NOP';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.tick();
    }
}

// ORA - Logical OR
class InstructionORA extends InstructionWithAddressingMode {
    immWidthHint = is16_M;

    readonly mnemonic = 'ORA';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.load(mode, this.addressingMode, true).add('state.a |= op;').setFlagsNZ('state.a', true);
        } else {
            compiler
                .load(mode, this.addressingMode, false)
                .add('state.a |= (op & 0x00ff);')
                .setFlagsNZ('(state.a & 0xff)', false);
        }
    }
}

// PEA - Push Effective Absolute Address
abstract class InstructionPushPtr extends InstructionWithAddressingMode {
    protected extraCycles = 0;

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .loadPointer(mode === Mode.em ? Mode.MX : mode, this.addressingMode)
            .tick(this.extraCycles)
            .push16(Mode.mx, 'ptr')
            .fixupSP(mode);
    }
}

class InstructionPEA extends InstructionPushPtr {
    readonly mnemonic = 'PEA';
}

// PEI - Push Effective Indirect Address
class InstructionPEI extends InstructionPushPtr {
    readonly mnemonic = 'PEI';
}

// PER - Push Effective PC Relative Indirect Address
class InstructionPER extends InstructionPushPtr {
    readonly mnemonic = 'PER';
    protected extraCycles = 1;
}

// PHA - Push Accumulator
class InstructionPHA extends InstructionImplied {
    readonly mnemonic = 'PHA';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.tick().push16(mode, 'state.a');
        } else {
            compiler.tick().push8(mode, 'state.a & 0xff');
        }
    }
}

// PHB - Push Data Bank Register
class InstructionPHB extends InstructionImplied {
    readonly mnemonic = 'PHB';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.tick().push8(Mode.mx, 'state.dbr >>> 16').fixupSP(mode);
    }
}

// PHD - Push Direct Page Register
class InstructionPHD extends InstructionImplied {
    readonly mnemonic = 'PHD';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.tick().push16(Mode.mx, 'state.d').fixupSP(mode);
    }
}

// PHK - Push Program Bank Register
class InstructionPHK extends InstructionImplied {
    readonly mnemonic = 'PHK';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.tick().push8(Mode.mx, 'state.k >>> 16').fixupSP(mode);
    }
}

// PHP - Push Processor Status Register
class InstructionPHP extends InstructionImplied {
    readonly mnemonic = 'PHP';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.tick().push8(mode, 'state.p');
    }
}

// PHX - Push X Register
class InstructionPHX extends InstructionImplied {
    readonly mnemonic = 'PHX';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_X(mode)) {
            compiler.tick().push16(mode, 'state.x');
        } else {
            compiler.tick().push8(mode, 'state.x');
        }
    }
}

// PHY - Push Y Register
class InstructionPHY extends InstructionImplied {
    readonly mnemonic = 'PHY';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_X(mode)) {
            compiler.tick().push16(mode, 'state.y');
        } else {
            compiler.tick().push8(mode, 'state.y');
        }
    }
}

// PLA - Pull Accumulator
class InstructionPLA extends InstructionImplied {
    readonly mnemonic = 'PLA';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.tick(2).pull16(mode).add('state.a = op;').setFlagsNZ('op', true);
        } else {
            compiler.tick(2).pull8(mode).add('state.a = (state.a & 0xff00) | op;').setFlagsNZ('op', false);
        }
    }
}

// PLB - Pull Data Bank Register
class InstructionPLB extends InstructionImplied {
    readonly mnemonic = 'PLB';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.tick(2).pull8(Mode.mx).add('state.dbr = op << 16;').setFlagsNZ('op', false).fixupSP(mode);
    }
}

// PLD - Pull Direct Page Register
class InstructionPLD extends InstructionImplied {
    readonly mnemonic = 'PLD';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.tick(2).pull16(Mode.mx).add('state.d = op;').setFlagsNZ('op', true).fixupSP(mode);
    }
}

// PLP - Pull Processor Status Register
class InstructionPLP extends InstructionImplied {
    readonly mnemonic = 'PLP';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.tick(2).pull8(mode).add('state.p = op;').handleFlagChange(mode);
    }
}

// PLX - Pull X Register
class InstructionPLX extends InstructionImplied {
    readonly mnemonic = 'PLX';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_X(mode)) {
            compiler.tick(2).pull16(mode).add('state.x = op;').setFlagsNZ('op', true);
        } else {
            compiler.tick(2).pull8(mode).add('state.x = op;').setFlagsNZ('op', false);
        }
    }
}

// PLY - Pull Y Register
class InstructionPLY extends InstructionImplied {
    readonly mnemonic = 'PLY';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_X(mode)) {
            compiler.tick(2).pull16(mode).add('state.y = op;').setFlagsNZ('op', true);
        } else {
            compiler.tick(2).pull8(mode).add('state.y = op;').setFlagsNZ('op', false);
        }
    }
}

// REP - Reset Processor Status Bits
class InstructionREP extends InstructionWithAddressingMode {
    readonly mnemonic = 'REP';

    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult {
        const value = bus.peek((address + 1) & 0xffff);
        if (mode !== Mode.em) mode = mode & (~(value >>> 4) & 0x03);

        return {
            disassembly: `REP ${hex8(value, '$')}`,
            additionalBytes: 1,
            mode,
        };
    }

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.load8(mode, this.addressingMode).add(`state.p &= ~op;`);

        if (mode === Mode.em) {
            compiler.add(`state.p |= ${Flag.m | Flag.x};`);
        } else {
            compiler.add(outdent`
                    const newMode = (state.p >>> 4) & 0x03;
                    if (newMode != state.mode) {
                        state.mode = newMode;
                        state.slowPath |= ${SlowPathReason.modeChange};
                    }
                `);
        }

        compiler.tick();
    }
}

// ROL - Rotate Left
class InstructionROL extends InstructionWithAddressingMode {
    readonly mnemonic = 'ROL';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.rmw(
                mode,
                this.addressingMode,
                true,
                outdent`
                    let res = (op << 1) & 0xffff;
                    res |= state.p & ${Flag.c};
                    state.p = (state.p & ${~Flag.c}) | op >>> 15;
                `,
            );
        } else {
            compiler.rmw(
                mode,
                this.addressingMode,
                false,
                outdent`
                    let res = (op << 1) & 0xff;
                    res |= state.p & ${Flag.c};
                    state.p = (state.p & ${~Flag.c}) | op >>> 7;
                `,
            );
        }

        compiler.setFlagsNZ('res', is16_M(mode));
    }
}

// ROR - Rotate Right
class InstructionROR extends InstructionWithAddressingMode {
    readonly mnemonic = 'ROR';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.rmw(
                mode,
                this.addressingMode,
                true,
                outdent`
                    let res = (op >>> 1) & 0xffff;
                    res |= (state.p & ${Flag.c}) << 15;
                    state.p = (state.p & ${~Flag.c}) | (op & ${Flag.c});
                `,
            );
        } else {
            compiler.rmw(
                mode,
                this.addressingMode,
                false,
                outdent`
                    let res = (op >>> 1) & 0xff;
                    res |= (state.p & ${Flag.c}) << 7;
                    state.p = (state.p & ${~Flag.c}) | (op & ${Flag.c});
                `,
            );
        }

        compiler.setFlagsNZ('res', is16_M(mode));
    }
}

// RTI - Return from Interrupt
class InstructionRTI extends InstructionImplied {
    readonly mnemonic = 'RTI';

    protected build(mode: Mode, compiler: Compiler): void {
        if (mode === Mode.em) {
            compiler.tick(2).pull8(mode).add('state.p = op;').pull16(mode).add('state.pc = op;').handleFlagChange(mode);
        } else {
            compiler
                .tick(2)
                .pull8(mode)
                .add('state.p = op;')
                .pull16(mode)
                .add('state.pc = op;')
                .pull8(mode)
                .add('state.k = op << 16;')
                .handleFlagChange(mode);
        }
    }
}

// RTL - Return from Subroutine Long
class InstructionRTL extends InstructionImplied {
    readonly mnemonic = 'RTL';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .tick(2)
            .pull16(Mode.mx)
            .add('state.pc = (op + 1) & 0xffff;')
            .pull8(Mode.mx)
            .add('state.k = op << 16;')
            .fixupSP(mode);
    }
}

// RTS - Return from Subroutine
class InstructionRTS extends InstructionImplied {
    readonly mnemonic = 'RTS';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.tick(2).pull16(mode).add('state.pc = (op + 1) & 0xffff;').tick();
    }
}

// SBC - Subtract with Carry
class InstructionSBC extends InstructionWithAddressingMode {
    immWidthHint = is16_M;

    readonly mnemonic = 'SBC';

    protected build(mode: Mode, compiler: Compiler): void {
        if (is16_M(mode)) {
            compiler.load(mode, this.addressingMode, true).add(outdent`
                    op = ~op & 0xffff;

                    if (state.p & ${Flag.d}) {
                        let res1 =  (state.a & 0x000f) + (op & 0x000f) + (state.p & ${Flag.c});
                        if (res1 <= 0x000f) res1 -= 0x0006;

                        let res2 =  (state.a & 0x00f0) + (op & 0x00f0) + (res1 > 0x000f ? 0x0010 : 0);
                        if (res2 <= 0x00f0) res2 -= 0x0060;

                        let res3 =  (state.a & 0x0f00) + (op & 0x0f00) + (res2 > 0x00f0 ? 0x0100 : 0);
                        if (res3 <= 0x0f00) res3 -= 0x0600;

                        let res4 =  (state.a & 0xf000) + (op & 0xf000) + (res3 > 0x0f00 ? 0x1000 : 0);

                        state.p &= ${~(Flag.c | Flag.z | Flag.v | Flag.n)};
                        state.p |= (~(state.a ^ op) & (op ^ res4) & 0x8000) >>> 9;

                        if (res4 <= 0xf000) res4 -= 0x6000;
                        else state.p |= ${Flag.c};

                        state.a = (res1 & 0x000f) | (res2 & 0x00f0) | (res3 & 0x0f00) | (res4 & 0xf000);
                    } else {
                        const res = state.a + op + (state.p & ${Flag.c});

                        state.p &= ${~(Flag.c | Flag.z | Flag.v | Flag.n)};
                        state.p |= (res >>> 16) & ${Flag.c};
                        state.p |= (~(state.a ^ op) & (op ^ res) & 0x8000) >>> 9;

                        state.a = res & 0xffff;
                    }

                    if (state.a === 0) state.p |= ${Flag.z};
                    state.p |= ((state.a >>> 8) & ${Flag.n});
                `);
        } else {
            compiler.load(mode, this.addressingMode, false).add(outdent`
                    op = ~op & 0xff;
                    const op2 = state.a & 0xff;
                    let res;

                    if (state.p & ${Flag.d}) {
                        let res1 =  (op2 & 0x0f) + (op & 0x0f) + (state.p & ${Flag.c});
                        if (res1 <= 0x0f) res1 -= 0x06;

                        let res2 = (op2 & 0xf0) + (op & 0xf0) + (res1 > 0x0f ? 0x10 : 0);
                        
                        state.p &= ${~(Flag.c | Flag.z | Flag.v | Flag.n)};
                        state.p |= (~(op2 ^ op) & (op ^ res2) & 0x80) >>> 1;

                        if (res2 <= 0xf0) res2 -= 0x60;
                        else state.p |= ${Flag.c};

                        res = (res1 & 0x0f) | (res2 & 0xf0);
                    } else {
                        res = op2 + op + (state.p & ${Flag.c});

                        state.p &= ${~(Flag.c | Flag.z | Flag.v | Flag.n)};

                        state.p |= (res >>> 8) & ${Flag.c};
                        res &= 0xff;

                        state.p |= (~(op2 ^ op) & (op ^ res) & 0x80) >>> 1;
                    }

                    if (res === 0) state.p |= ${Flag.z};
                    state.p |= (res & ${Flag.n});

                    state.a = (state.a & 0xff00) | res;
                `);
        }
    }
}

// SEC - Set Carry Flag
class InstructionSEC extends InstructionImplied {
    readonly mnemonic = 'SEC';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add(`state.p |= ${Flag.c}`).tick();
    }
}

// SED - Set Decimal Flag
class InstructionSED extends InstructionImplied {
    readonly mnemonic = 'SED';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add(`state.p |= ${Flag.d}`).tick();
    }
}

// SEI - Set Interrupt Disable Flag
class InstructionSEI extends InstructionImplied {
    readonly mnemonic = 'SEI';

    protected build(mode: Mode, compiler: Compiler): Compiler {
        return compiler.add(`state.p |= ${Flag.i}`).tick();
    }
}

// SEP - Set Processor Status Bits
class InstructionSEP extends InstructionWithAddressingMode {
    readonly mnemonic = 'SEP';

    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult {
        const value = bus.peek((address + 1) & 0xffff);
        if (mode !== Mode.em) mode = mode | ((value >>> 4) & 0x03);

        return {
            disassembly: `SEP ${hex8(value, '$')}`,
            additionalBytes: 1,
            mode,
        };
    }

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.load8(mode, this.addressingMode).add(`state.p |= op;`);

        if (mode !== Mode.em) compiler.handleFlagChange(mode);

        compiler.tick();
    }
}

// STA - Store Accumulator
class InstructionSTA extends InstructionWithAddressingMode {
    readonly mnemonic = 'STA';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.store('state.a', mode, this.addressingMode, is16_M(mode));
    }
}

// STP - Stop the Clock
class InstructionSTP extends InstructionImplied {
    readonly mnemonic = 'STP';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add(`breakCb(${BreakReason.stp}, 'STP encountered');`);
    }
}

// STX - Store X Register
class InstructionSTX extends InstructionWithAddressingMode {
    readonly mnemonic = 'STX';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.store('state.x', mode, this.addressingMode, is16_X(mode));
    }
}

// STY - Store Y Register
class InstructionSTY extends InstructionWithAddressingMode {
    readonly mnemonic = 'STY';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.store('state.y', mode, this.addressingMode, is16_X(mode));
    }
}

// STZ - Store Zero
class InstructionSTZ extends InstructionWithAddressingMode {
    readonly mnemonic = 'STZ';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.store('0', mode, this.addressingMode, is16_M(mode));
    }
}

// TAX - Transfer Accumulator to X
class InstructionTAX extends InstructionImplied {
    readonly mnemonic = 'TAX';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(is16_X(mode) ? 'state.x = state.a;' : 'state.x = (state.x & 0xff00) | (state.a & 0xff);')
            .setFlagsNZ(is16_X(mode) ? 'state.x' : '(state.x & 0xff)', is16_X(mode))
            .tick();
    }
}

// TAY - Transfer Accumulator to Y
class InstructionTAY extends InstructionImplied {
    readonly mnemonic = 'TAY';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(is16_X(mode) ? 'state.y = state.a;' : 'state.y = (state.y & 0xff00) | (state.a & 0xff);')
            .setFlagsNZ(is16_X(mode) ? 'state.y' : '(state.y & 0xff)', is16_X(mode))
            .tick();
    }
}

// TCD - Transfer 16-bit Accumulator to Direct Page Register
class InstructionTCD extends InstructionImplied {
    readonly mnemonic = 'TCD';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add('state.d = state.a;').setFlagsNZ('state.d', true).tick();
    }
}

// TCS - Transfer 16-bit Accumulator to Stack Pointer
class InstructionTCS extends InstructionImplied {
    readonly mnemonic = 'TCS';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add(mode === Mode.em ? 'state.s = (state.a & 0xff) | 0x0100;' : 'state.s = state.a;').tick();
    }
}

// TDC - Transfer Direct Page Register to 16-bit Accumulator
class InstructionTDC extends InstructionImplied {
    readonly mnemonic = 'TDC';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add('state.a = state.d;').setFlagsNZ('state.a', true).tick();
    }
}

// TRB - Test and Reset Bits
class InstructionTRB extends InstructionWithAddressingMode {
    readonly mnemonic = 'TRB';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.rmw(
            mode === Mode.em ? Mode.mx : mode,
            this.addressingMode,
            is16_M(mode),
            outdent`
                let res = op & ~state.a;
                if ((op & state.a) === 0) state.p |= ${Flag.z}; else state.p &= ${~Flag.z};
            `,
        );
    }
}

// TSB - Test and Set Bits
class InstructionTSB extends InstructionWithAddressingMode {
    readonly mnemonic = 'TSB';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.rmw(
            mode === Mode.em ? Mode.mx : mode,
            this.addressingMode,
            is16_M(mode),
            outdent`
                let res = op | ${is16_M(mode) ? 'state.a' : '(state.a & 0xff)'};
                if ((op & state.a) === 0) state.p |= ${Flag.z}; else state.p &= ${~Flag.z};
            `,
        );
    }
}

// TSC - Transfer Stack Pointer to 16-bit Accumulator
class InstructionTSC extends InstructionImplied {
    readonly mnemonic = 'TSC';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add('state.a = state.s;').setFlagsNZ('state.s', true).tick();
    }
}

// TSX - Transfer Stack Pointer to X
class InstructionTSX extends InstructionImplied {
    readonly mnemonic = 'TSX';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(is16_X(mode) ? 'state.x = state.s;' : 'state.x = (state.x & 0xff00) | (state.s & 0xff);')
            .setFlagsNZ(is16_X(mode) ? 'state.x' : '(state.x & 0xff)', is16_X(mode))
            .tick();
    }
}

// TXA - Transfer X to Accumulator
class InstructionTXA extends InstructionImplied {
    readonly mnemonic = 'TXA';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(is16_M(mode) ? 'state.a = state.x;' : 'state.a = (state.a & 0xff00) | (state.x & 0xff);')
            .setFlagsNZ(is16_M(mode) ? 'state.a' : '(state.a & 0xff)', is16_M(mode))
            .tick();
    }
}

// TXS - Transfer X to Stack Pointer
class InstructionTXS extends InstructionImplied {
    readonly mnemonic = 'TXS';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.add(mode === Mode.em ? 'state.s = (state.x & 0xff) | 0x0100;' : 'state.s = state.x;').tick();
    }
}

// TXY - Transfer X to Y
class InstructionTXY extends InstructionImplied {
    readonly mnemonic = 'TXY';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(is16_X(mode) ? 'state.y = state.x;' : 'state.y = (state.y & 0xff00) | (state.x & 0xff);')
            .setFlagsNZ(is16_X(mode) ? 'state.y' : '(state.y & 0xff)', is16_X(mode))
            .tick();
    }
}

// TYA - Transfer Y to Accumulator
class InstructionTYA extends InstructionImplied {
    readonly mnemonic = 'TYA';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(is16_M(mode) ? 'state.a = state.y;' : 'state.a = (state.a & 0xff00) | (state.y & 0xff);')
            .setFlagsNZ(is16_M(mode) ? 'state.a' : '(state.a & 0xff)', is16_M(mode))
            .tick();
    }
}

// TYX - Transfer Y to X
class InstructionTYX extends InstructionImplied {
    readonly mnemonic = 'TYX';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .add(is16_X(mode) ? 'state.x = state.y;' : 'state.x = (state.x & 0xff00) | (state.y & 0xff);')
            .setFlagsNZ(is16_X(mode) ? 'state.x' : '(state.x & 0xff)', is16_X(mode))
            .tick();
    }
}

// WAI - Wait for Interrupt
class InstructionWAI extends InstructionImplied {
    readonly mnemonic = 'WAI';
}

// WDM - Reserved for Future Expansion
class InstructionWDM extends InstructionWithAddressingMode {
    readonly mnemonic = 'WDM';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler.load8(mode, this.addressingMode);
    }
}

// XBA - Exchange B and A Accumulators
class InstructionXBA extends InstructionImplied {
    readonly mnemonic = 'XBA';

    protected build(mode: Mode, compiler: Compiler): void {
        compiler
            .tick(2)
            .add(
                outdent`
                let lo = state.a & 0xff;
                state.a = (state.a >>> 8) | (lo << 8);
            `,
            )
            .setFlagsNZ('(state.a & 0xff)', false);
    }
}

// XCE - Exchange Carry and Emulation Flags
class InstructionXCE extends InstructionImplied {
    readonly mnemonic = 'XCE';

    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult {
        const previousOpcode = bus.peek((address - 1) & 0xffff);

        switch (previousOpcode) {
            case 0x18:
                mode = Mode.MX;
                break;

            case 0x38:
                mode = Mode.em;
                break;
        }

        return {
            disassembly: this.mnemonic,
            additionalBytes: 0,
            mode,
        };
    }

    protected build(mode: Mode, compiler: Compiler): void {
        if (mode === Mode.em) {
            compiler.add(outdent`
                    if ((state.p & ${Flag.c}) === 0) {
                        state.mode = (state.p >>> 4) & 0x03;

                        state.p |= ${Flag.c};

                        state.slowPath |= ${SlowPathReason.modeChange};
                    }
                `);
        } else {
            compiler.add(outdent`
                    if (state.p & ${Flag.c}) {
                        state.mode = ${Mode.em};

                        state.p &= ${~Flag.c};
                        state.p |= ${Flag.m | Flag.x};
                        state.s = (state.s & 0xff) | 0x0100;
                        state.x &= 0xff;
                        state.y &= 0xff;

                        state.slowPath |= ${SlowPathReason.modeChange};
                    }
                `);
        }

        compiler.tick();
    }
}

export function registerInstructions(): void {
    // ADC - Add with Carry
    registerInstruction(0x61, new InstructionADC(0x61, AddressingMode.direct_x_16));
    registerInstruction(0x63, new InstructionADC(0x63, AddressingMode.stack));
    registerInstruction(0x65, new InstructionADC(0x65, AddressingMode.direct));
    registerInstruction(0x67, new InstructionADC(0x67, AddressingMode.direct_24));
    registerInstruction(0x69, new InstructionADC(0x69, AddressingMode.imm));
    registerInstruction(0x6d, new InstructionADC(0x6d, AddressingMode.abs));
    registerInstruction(0x6f, new InstructionADC(0x6f, AddressingMode.long));
    registerInstruction(0x71, new InstructionADC(0x71, AddressingMode.direct_y_16));
    registerInstruction(0x72, new InstructionADC(0x72, AddressingMode.direct_16));
    registerInstruction(0x73, new InstructionADC(0x73, AddressingMode.stack_y_16));
    registerInstruction(0x75, new InstructionADC(0x75, AddressingMode.direct_x));
    registerInstruction(0x77, new InstructionADC(0x77, AddressingMode.direct_y_24));
    registerInstruction(0x79, new InstructionADC(0x79, AddressingMode.abs_y));
    registerInstruction(0x7d, new InstructionADC(0x7d, AddressingMode.abs_x));
    registerInstruction(0x7f, new InstructionADC(0x7f, AddressingMode.long_x));

    // AND - Logical AND
    registerInstruction(0x21, new InstructionAND(0x21, AddressingMode.direct_x_16));
    registerInstruction(0x23, new InstructionAND(0x23, AddressingMode.stack));
    registerInstruction(0x25, new InstructionAND(0x25, AddressingMode.direct));
    registerInstruction(0x27, new InstructionAND(0x27, AddressingMode.direct_24));
    registerInstruction(0x29, new InstructionAND(0x29, AddressingMode.imm));
    registerInstruction(0x2d, new InstructionAND(0x2d, AddressingMode.abs));
    registerInstruction(0x2f, new InstructionAND(0x2f, AddressingMode.long));
    registerInstruction(0x31, new InstructionAND(0x31, AddressingMode.direct_y_16));
    registerInstruction(0x32, new InstructionAND(0x32, AddressingMode.direct_16));
    registerInstruction(0x33, new InstructionAND(0x33, AddressingMode.stack_y_16));
    registerInstruction(0x35, new InstructionAND(0x35, AddressingMode.direct_x));
    registerInstruction(0x37, new InstructionAND(0x37, AddressingMode.direct_y_24));
    registerInstruction(0x39, new InstructionAND(0x39, AddressingMode.abs_y));
    registerInstruction(0x3d, new InstructionAND(0x3d, AddressingMode.abs_x));
    registerInstruction(0x3f, new InstructionAND(0x3f, AddressingMode.long_x));

    // ASL - Arithmetic Shift Left
    registerInstruction(0x06, new InstructionASL(0x06, AddressingMode.direct));
    registerInstruction(0x0a, new InstructionASL(0x0a, AddressingMode.implied));
    registerInstruction(0x0e, new InstructionASL(0x0e, AddressingMode.abs));
    registerInstruction(0x16, new InstructionASL(0x16, AddressingMode.direct_x));
    registerInstruction(0x1e, new InstructionASL(0x1e, AddressingMode.abs_x));

    // BCC - Branch if Carry Clear
    registerInstruction(0x90, new InstructionBCC(0x90, AddressingMode.rel8));

    // BCS - Branch if Carry Set
    registerInstruction(0xb0, new InstructionBCS(0xb0, AddressingMode.rel8));

    // BEQ - Branch if Equal
    registerInstruction(0xf0, new InstructionBEQ(0xf0, AddressingMode.rel8));

    // BIT - Bit Test
    registerInstruction(0x24, new InstructionBIT(0x24, AddressingMode.direct));
    registerInstruction(0x2c, new InstructionBIT(0x2c, AddressingMode.abs));
    registerInstruction(0x34, new InstructionBIT(0x34, AddressingMode.direct_x));
    registerInstruction(0x3c, new InstructionBIT(0x3c, AddressingMode.abs_x));
    registerInstruction(0x89, new InstructionBIT(0x89, AddressingMode.imm));

    // BMI - Branch if Minus
    registerInstruction(0x30, new InstructionBMI(0x30, AddressingMode.rel8));

    // BNE - Branch if Not Equal
    registerInstruction(0xd0, new InstructionBNE(0xd0, AddressingMode.rel8));

    // BPL - Branch if Plus
    registerInstruction(0x10, new InstructionBPL(0x10, AddressingMode.rel8));

    // BRA - Branch Always
    registerInstruction(0x80, new InstructionBRA(0x80, AddressingMode.rel8));

    // BRK - Break
    registerInstruction(0x00, new InstructionBRK(0x00, AddressingMode.imm));

    // BRL - Branch Long
    registerInstruction(0x82, new InstructionBRL(0x82, AddressingMode.rel16));

    // BVC - Branch if Overflow Clear
    registerInstruction(0x50, new InstructionBVC(0x50, AddressingMode.rel8));

    // BVS - Branch if Overflow Set
    registerInstruction(0x70, new InstructionBVS(0x70, AddressingMode.rel8));

    // CLC - Clear Carry Flag
    registerInstruction(0x18, new InstructionCLC(0x18));

    // CLD - Clear Decimal Mode
    registerInstruction(0xd8, new InstructionCLD(0xd8));

    // CLI - Clear Interrupt Disable
    registerInstruction(0x58, new InstructionCLI(0x58));

    // CLV - Clear Overflow Flag
    registerInstruction(0xb8, new InstructionCLV(0xb8));

    // CMP - Compare
    registerInstruction(0xc1, new InstructionCMP(0xc1, AddressingMode.direct_x_16));
    registerInstruction(0xc3, new InstructionCMP(0xc3, AddressingMode.stack));
    registerInstruction(0xc5, new InstructionCMP(0xc5, AddressingMode.direct));
    registerInstruction(0xc7, new InstructionCMP(0xc7, AddressingMode.direct_24));
    registerInstruction(0xc9, new InstructionCMP(0xc9, AddressingMode.imm));
    registerInstruction(0xcd, new InstructionCMP(0xcd, AddressingMode.abs));
    registerInstruction(0xcf, new InstructionCMP(0xcf, AddressingMode.long));
    registerInstruction(0xd1, new InstructionCMP(0xd1, AddressingMode.direct_y_16));
    registerInstruction(0xd2, new InstructionCMP(0xd2, AddressingMode.direct_16));
    registerInstruction(0xd3, new InstructionCMP(0xd3, AddressingMode.stack_y_16));
    registerInstruction(0xd5, new InstructionCMP(0xd5, AddressingMode.direct_x));
    registerInstruction(0xd7, new InstructionCMP(0xd7, AddressingMode.direct_y_24));
    registerInstruction(0xd9, new InstructionCMP(0xd9, AddressingMode.abs_y));
    registerInstruction(0xdd, new InstructionCMP(0xdd, AddressingMode.abs_x));
    registerInstruction(0xdf, new InstructionCMP(0xdf, AddressingMode.long_x));

    // COP - Co-Processor
    registerInstruction(0x02, new InstructionCOP(0x02, AddressingMode.imm));

    // CPX - Compare X Register
    registerInstruction(0xe0, new InstructionCPX(0xe0, AddressingMode.imm));
    registerInstruction(0xe4, new InstructionCPX(0xe4, AddressingMode.direct));
    registerInstruction(0xec, new InstructionCPX(0xec, AddressingMode.abs));

    // CPY - Compare Y Register
    registerInstruction(0xc0, new InstructionCPY(0xc0, AddressingMode.imm));
    registerInstruction(0xc4, new InstructionCPY(0xc4, AddressingMode.direct));
    registerInstruction(0xcc, new InstructionCPY(0xcc, AddressingMode.abs));

    // DEC - Decrement Memory
    registerInstruction(0x3a, new InstructionDEC(0x3a, AddressingMode.implied));
    registerInstruction(0xc6, new InstructionDEC(0xc6, AddressingMode.direct));
    registerInstruction(0xce, new InstructionDEC(0xce, AddressingMode.abs));
    registerInstruction(0xd6, new InstructionDEC(0xd6, AddressingMode.direct_x));
    registerInstruction(0xde, new InstructionDEC(0xde, AddressingMode.abs_x));

    // DEX - Decrement X Register
    registerInstruction(0xca, new InstructionDEX(0xca));

    // DEY - Decrement Y Register
    registerInstruction(0x88, new InstructionDEY(0x88));

    // EOR - Exclusive OR
    registerInstruction(0x41, new InstructionEOR(0x41, AddressingMode.direct_x_16));
    registerInstruction(0x43, new InstructionEOR(0x43, AddressingMode.stack));
    registerInstruction(0x45, new InstructionEOR(0x45, AddressingMode.direct));
    registerInstruction(0x47, new InstructionEOR(0x47, AddressingMode.direct_24));
    registerInstruction(0x49, new InstructionEOR(0x49, AddressingMode.imm));
    registerInstruction(0x4d, new InstructionEOR(0x4d, AddressingMode.abs));
    registerInstruction(0x4f, new InstructionEOR(0x4f, AddressingMode.long));
    registerInstruction(0x51, new InstructionEOR(0x51, AddressingMode.direct_y_16));
    registerInstruction(0x52, new InstructionEOR(0x52, AddressingMode.direct_16));
    registerInstruction(0x53, new InstructionEOR(0x53, AddressingMode.stack_y_16));
    registerInstruction(0x55, new InstructionEOR(0x55, AddressingMode.direct_x));
    registerInstruction(0x57, new InstructionEOR(0x57, AddressingMode.direct_y_24));
    registerInstruction(0x59, new InstructionEOR(0x59, AddressingMode.abs_y));
    registerInstruction(0x5d, new InstructionEOR(0x5d, AddressingMode.abs_x));
    registerInstruction(0x5f, new InstructionEOR(0x5f, AddressingMode.long_x));

    // INC - Increment Memory
    registerInstruction(0x1a, new InstructionINC(0x1a, AddressingMode.implied));
    registerInstruction(0xe6, new InstructionINC(0xe6, AddressingMode.direct));
    registerInstruction(0xee, new InstructionINC(0xee, AddressingMode.abs));
    registerInstruction(0xf6, new InstructionINC(0xf6, AddressingMode.direct_x));
    registerInstruction(0xfe, new InstructionINC(0xfe, AddressingMode.abs_x));

    // INX - Increment X Register
    registerInstruction(0xe8, new InstructionINX(0xe8));

    // INY - Increment Y Register
    registerInstruction(0xc8, new InstructionINY(0xc8));

    // JMP - Jump
    registerInstruction(0x4c, new InstructionJMP(0x4c, AddressingMode.abs));
    registerInstruction(0x5c, new InstructionJMP(0x5c, AddressingMode.long));
    registerInstruction(0x6c, new InstructionJMP(0x6c, AddressingMode.abs_16));
    registerInstruction(0x7c, new InstructionJMP(0x7c, AddressingMode.abs_x_16));
    registerInstruction(0xdc, new InstructionJMP(0xdc, AddressingMode.abs_24));

    // JSR - Jump to Subroutine Long
    registerInstruction(0x22, new InstructionJSL(0x22, AddressingMode.long));

    // JSR - Jump to Subroutine
    registerInstruction(0x20, new InstructionJSR(0x20, AddressingMode.abs));
    registerInstruction(0xfc, new InstructionJSR(0xfc, AddressingMode.abs_x_16));

    // LDA - Load Accumulator
    registerInstruction(0xa1, new InstructionLDA(0xa1, AddressingMode.direct_x_16));
    registerInstruction(0xa3, new InstructionLDA(0xa3, AddressingMode.stack));
    registerInstruction(0xa5, new InstructionLDA(0xa5, AddressingMode.direct));
    registerInstruction(0xa7, new InstructionLDA(0xa7, AddressingMode.direct_24));
    registerInstruction(0xa9, new InstructionLDA(0xa9, AddressingMode.imm));
    registerInstruction(0xad, new InstructionLDA(0xad, AddressingMode.abs));
    registerInstruction(0xaf, new InstructionLDA(0xaf, AddressingMode.long));
    registerInstruction(0xb1, new InstructionLDA(0xb1, AddressingMode.direct_y_16));
    registerInstruction(0xb2, new InstructionLDA(0xb2, AddressingMode.direct_16));
    registerInstruction(0xb3, new InstructionLDA(0xb3, AddressingMode.stack_y_16));
    registerInstruction(0xb5, new InstructionLDA(0xb5, AddressingMode.direct_x));
    registerInstruction(0xb7, new InstructionLDA(0xb7, AddressingMode.direct_y_24));
    registerInstruction(0xb9, new InstructionLDA(0xb9, AddressingMode.abs_y));
    registerInstruction(0xbd, new InstructionLDA(0xbd, AddressingMode.abs_x));
    registerInstruction(0xbf, new InstructionLDA(0xbf, AddressingMode.long_x));

    // LDX - Load X Register
    registerInstruction(0xa2, new InstructionLDX(0xa2, AddressingMode.imm));
    registerInstruction(0xa6, new InstructionLDX(0xa6, AddressingMode.direct));
    registerInstruction(0xae, new InstructionLDX(0xae, AddressingMode.abs));
    registerInstruction(0xb6, new InstructionLDX(0xb6, AddressingMode.direct_y));
    registerInstruction(0xbe, new InstructionLDX(0xbe, AddressingMode.abs_y));

    // LDY - Load Y Register
    registerInstruction(0xa0, new InstructionLDY(0xa0, AddressingMode.imm));
    registerInstruction(0xa4, new InstructionLDY(0xa4, AddressingMode.direct));
    registerInstruction(0xac, new InstructionLDY(0xac, AddressingMode.abs));
    registerInstruction(0xb4, new InstructionLDY(0xb4, AddressingMode.direct_x));
    registerInstruction(0xbc, new InstructionLDY(0xbc, AddressingMode.abs_x));

    // LSR - Logical Shift Right
    registerInstruction(0x46, new InstructionLSR(0x46, AddressingMode.direct));
    registerInstruction(0x4a, new InstructionLSR(0x4a, AddressingMode.implied));
    registerInstruction(0x4e, new InstructionLSR(0x4e, AddressingMode.abs));
    registerInstruction(0x56, new InstructionLSR(0x56, AddressingMode.direct_x));
    registerInstruction(0x5e, new InstructionLSR(0x5e, AddressingMode.abs_x));

    // MVN - Block Move Negative
    registerInstruction(0x54, new InstructionMVN(0x54, AddressingMode.src_dest));

    // MVP - Block Move Positive
    registerInstruction(0x44, new InstructionMVP(0x44, AddressingMode.src_dest));

    // NOP - No Operation
    registerInstruction(0xea, new InstructionNOP(0xea));

    // ORA - Logical OR
    registerInstruction(0x01, new InstructionORA(0x01, AddressingMode.direct_x_16));
    registerInstruction(0x03, new InstructionORA(0x03, AddressingMode.stack));
    registerInstruction(0x05, new InstructionORA(0x05, AddressingMode.direct));
    registerInstruction(0x07, new InstructionORA(0x07, AddressingMode.direct_24));
    registerInstruction(0x09, new InstructionORA(0x09, AddressingMode.imm));
    registerInstruction(0x0d, new InstructionORA(0x0d, AddressingMode.abs));
    registerInstruction(0x0f, new InstructionORA(0x0f, AddressingMode.long));
    registerInstruction(0x11, new InstructionORA(0x11, AddressingMode.direct_y_16));
    registerInstruction(0x12, new InstructionORA(0x12, AddressingMode.direct_16));
    registerInstruction(0x13, new InstructionORA(0x13, AddressingMode.stack_y_16));
    registerInstruction(0x15, new InstructionORA(0x15, AddressingMode.direct_x));
    registerInstruction(0x17, new InstructionORA(0x17, AddressingMode.direct_y_24));
    registerInstruction(0x19, new InstructionORA(0x19, AddressingMode.abs_y));
    registerInstruction(0x1d, new InstructionORA(0x1d, AddressingMode.abs_x));
    registerInstruction(0x1f, new InstructionORA(0x1f, AddressingMode.long_x));

    // PEA - Push Effective Absolute Address
    registerInstruction(0xf4, new InstructionPEA(0xf4, AddressingMode.abs));

    // PEI - Push Effective Indirect Address
    registerInstruction(0xd4, new InstructionPEI(0xd4, AddressingMode.direct_16));

    // PER - Push Effective PC Relative Indirect Address
    registerInstruction(0x62, new InstructionPER(0x62, AddressingMode.rel16));

    // PHA - Push Accumulator
    registerInstruction(0x48, new InstructionPHA(0x48));

    // PHB - Push Data Bank Register
    registerInstruction(0x8b, new InstructionPHB(0x8b));

    // PHD - Push Direct Page Register
    registerInstruction(0x0b, new InstructionPHD(0x0b));

    // PHK - Push Program Bank Register
    registerInstruction(0x4b, new InstructionPHK(0x4b));

    // PHP - Push Processor Status Register
    registerInstruction(0x08, new InstructionPHP(0x08));

    // PHX - Push X Register
    registerInstruction(0xda, new InstructionPHX(0xda));

    // PHY - Push Y Register
    registerInstruction(0x5a, new InstructionPHY(0x5a));

    // PLA - Pull Accumulator
    registerInstruction(0x68, new InstructionPLA(0x68));

    // PLB - Pull Data Bank Register
    registerInstruction(0xab, new InstructionPLB(0xab));

    // PLD - Pull Direct Page Register
    registerInstruction(0x2b, new InstructionPLD(0x2b));

    // PLP - Pull Processor Status Register
    registerInstruction(0x28, new InstructionPLP(0x28));

    // PLX - Pull X Register
    registerInstruction(0xfa, new InstructionPLX(0xfa));

    // PLY - Pull Y Register
    registerInstruction(0x7a, new InstructionPLY(0x7a));

    // REP - Reset Processor Status Bits
    registerInstruction(0xc2, new InstructionREP(0xc2, AddressingMode.imm));

    // ROL - Rotate Left
    registerInstruction(0x26, new InstructionROL(0x26, AddressingMode.direct));
    registerInstruction(0x2a, new InstructionROL(0x2a, AddressingMode.implied));
    registerInstruction(0x2e, new InstructionROL(0x2e, AddressingMode.abs));
    registerInstruction(0x36, new InstructionROL(0x36, AddressingMode.direct_x));
    registerInstruction(0x3e, new InstructionROL(0x3e, AddressingMode.abs_x));

    // ROR - Rotate Right
    registerInstruction(0x66, new InstructionROR(0x66, AddressingMode.direct));
    registerInstruction(0x6a, new InstructionROR(0x6a, AddressingMode.implied));
    registerInstruction(0x6e, new InstructionROR(0x6e, AddressingMode.abs));
    registerInstruction(0x76, new InstructionROR(0x76, AddressingMode.direct_x));
    registerInstruction(0x7e, new InstructionROR(0x7e, AddressingMode.abs_x));

    // RTI - Return from Interrupt
    registerInstruction(0x40, new InstructionRTI(0x40));

    // RTL - Return from Subroutine Long
    registerInstruction(0x6b, new InstructionRTL(0x6b));

    // RTS - Return from Subroutine
    registerInstruction(0x60, new InstructionRTS(0x60));

    // SBC - Subtract with Carry
    registerInstruction(0xe1, new InstructionSBC(0xe1, AddressingMode.direct_x_16));
    registerInstruction(0xe3, new InstructionSBC(0xe3, AddressingMode.stack));
    registerInstruction(0xe5, new InstructionSBC(0xe5, AddressingMode.direct));
    registerInstruction(0xe7, new InstructionSBC(0xe7, AddressingMode.direct_24));
    registerInstruction(0xe9, new InstructionSBC(0xe9, AddressingMode.imm));
    registerInstruction(0xed, new InstructionSBC(0xed, AddressingMode.abs));
    registerInstruction(0xef, new InstructionSBC(0xef, AddressingMode.long));
    registerInstruction(0xf1, new InstructionSBC(0xf1, AddressingMode.direct_y_16));
    registerInstruction(0xf2, new InstructionSBC(0xf2, AddressingMode.direct_16));
    registerInstruction(0xf3, new InstructionSBC(0xf3, AddressingMode.stack_y_16));
    registerInstruction(0xf5, new InstructionSBC(0xf5, AddressingMode.direct_x));
    registerInstruction(0xf7, new InstructionSBC(0xf7, AddressingMode.direct_y_24));
    registerInstruction(0xf9, new InstructionSBC(0xf9, AddressingMode.abs_y));
    registerInstruction(0xfd, new InstructionSBC(0xfd, AddressingMode.abs_x));
    registerInstruction(0xff, new InstructionSBC(0xff, AddressingMode.long_x));

    // SEC - Set Carry Flag
    registerInstruction(0x38, new InstructionSEC(0x38));

    // SED - Set Decimal Flag
    registerInstruction(0xf8, new InstructionSED(0xf8));

    // SEI - Set Interrupt Disable Flag
    registerInstruction(0x78, new InstructionSEI(0x78));

    // SEP - Set Processor Status Bits
    registerInstruction(0xe2, new InstructionSEP(0xe2, AddressingMode.imm));

    // STA - Store Accumulator
    registerInstruction(0x81, new InstructionSTA(0x81, AddressingMode.direct_x_16));
    registerInstruction(0x83, new InstructionSTA(0x83, AddressingMode.stack));
    registerInstruction(0x85, new InstructionSTA(0x85, AddressingMode.direct));
    registerInstruction(0x87, new InstructionSTA(0x87, AddressingMode.direct_24));
    registerInstruction(0x8d, new InstructionSTA(0x8d, AddressingMode.abs));
    registerInstruction(0x8f, new InstructionSTA(0x8f, AddressingMode.long));
    registerInstruction(0x91, new InstructionSTA(0x91, AddressingMode.direct_y_16));
    registerInstruction(0x92, new InstructionSTA(0x92, AddressingMode.direct_16));
    registerInstruction(0x93, new InstructionSTA(0x93, AddressingMode.stack_y_16));
    registerInstruction(0x95, new InstructionSTA(0x95, AddressingMode.direct_x));
    registerInstruction(0x97, new InstructionSTA(0x97, AddressingMode.direct_y_24));
    registerInstruction(0x99, new InstructionSTA(0x99, AddressingMode.abs_y));
    registerInstruction(0x9d, new InstructionSTA(0x9d, AddressingMode.abs_x));
    registerInstruction(0x9f, new InstructionSTA(0x9f, AddressingMode.long_x));

    // STP - Stop the Clock
    registerInstruction(0xdb, new InstructionSTP(0xdb));

    // STX - Store X Register
    registerInstruction(0x86, new InstructionSTX(0x86, AddressingMode.direct));
    registerInstruction(0x8e, new InstructionSTX(0x8e, AddressingMode.abs));
    registerInstruction(0x96, new InstructionSTX(0x96, AddressingMode.direct_y));

    // STY - Store Y Register
    registerInstruction(0x84, new InstructionSTY(0x84, AddressingMode.direct));
    registerInstruction(0x8c, new InstructionSTY(0x8c, AddressingMode.abs));
    registerInstruction(0x94, new InstructionSTY(0x94, AddressingMode.direct_x));

    // STZ - Store Zero
    registerInstruction(0x64, new InstructionSTZ(0x64, AddressingMode.direct));
    registerInstruction(0x74, new InstructionSTZ(0x74, AddressingMode.direct_x));
    registerInstruction(0x9c, new InstructionSTZ(0x9c, AddressingMode.abs));
    registerInstruction(0x9e, new InstructionSTZ(0x9e, AddressingMode.abs_x));

    // TAX - Transfer Accumulator to X
    registerInstruction(0xaa, new InstructionTAX(0xaa));

    // TAY - Transfer Accumulator to Y
    registerInstruction(0xa8, new InstructionTAY(0xa8));

    // TCD - Transfer 16-bit Accumulator to Direct Page Register
    registerInstruction(0x5b, new InstructionTCD(0x5b));

    // TCS - Transfer 16-bit Accumulator to Stack Pointer
    registerInstruction(0x1b, new InstructionTCS(0x1b));

    // TDC - Transfer Direct Page Register to 16-bit Accumulator
    registerInstruction(0x7b, new InstructionTDC(0x7b));

    // TRB - Test and Reset Bits
    registerInstruction(0x14, new InstructionTRB(0x14, AddressingMode.direct));
    registerInstruction(0x1c, new InstructionTRB(0x1c, AddressingMode.abs));

    // TSB - Test and Set Bits
    registerInstruction(0x04, new InstructionTSB(0x04, AddressingMode.direct));
    registerInstruction(0x0c, new InstructionTSB(0x0c, AddressingMode.abs));

    // TSC - Transfer Stack Pointer to 16-bit Accumulator
    registerInstruction(0x3b, new InstructionTSC(0x3b));

    // TSX - Transfer Stack Pointer to X
    registerInstruction(0xba, new InstructionTSX(0xba));

    // TXA - Transfer X to Accumulator
    registerInstruction(0x8a, new InstructionTXA(0x8a));

    // TXS - Transfer X to Stack Pointer
    registerInstruction(0x9a, new InstructionTXS(0x9a));

    // TXY - Transfer X to Y
    registerInstruction(0x9b, new InstructionTXY(0x9b));

    // TYA - Transfer Y to Accumulator
    registerInstruction(0x98, new InstructionTYA(0x98));

    // TYX - Transfer Y to X
    registerInstruction(0xbb, new InstructionTYX(0xbb));

    // WAI - Wait for Interrupt
    registerInstruction(0xcb, new InstructionWAI(0xcb));

    // WDM - Reserved for Future Expansion
    registerInstruction(0x42, new InstructionWDM(0x42, AddressingMode.imm));

    // XBA - Exchange B and A Accumulators
    registerInstruction(0xeb, new InstructionXBA(0xeb));

    // XCE - Exchange Carry and Emulation Flags
    registerInstruction(0xfb, new InstructionXCE(0xfb));
}
