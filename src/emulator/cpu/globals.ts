import { DispatcherCompiler } from './dispatcher';
import { registerInstructions } from './instruction';

registerInstructions();

export const dispatcher = new DispatcherCompiler().compileDispatcher();
