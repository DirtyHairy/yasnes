import { DispatchCompiler } from './dispatchCompiler';
import { registerInstructions } from './instruction';

registerInstructions();

export const dispatch = new DispatchCompiler().compileDispatch();
