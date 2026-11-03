// no debugger is ever attached to a compiled program
export const url = () => undefined;

export const open = () => {
  throw new Error('inspector.open is not supported');
};

export class Session {
  constructor() {
    throw new Error('inspector.Session is not supported');
  }
}

export default { url, open, Session };
