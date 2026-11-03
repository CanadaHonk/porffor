import { Interface as BaseInterface } from '../readline.js';

export class Interface extends BaseInterface {
  question(query) {
    return new Promise((resolve, reject) => {
      this._questionReject = reject;
      this._question(query, resolve);
    });
  }
}

export const createInterface = (input, output, completer, terminal) => new Interface(input, output, completer, terminal);

export default { Interface, createInterface };
