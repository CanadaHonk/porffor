// legacy codes by name, '' for the disused ones
const codeNames = [
  'IndexSizeError', '', 'HierarchyRequestError', 'WrongDocumentError', 'InvalidCharacterError', '', 'NoModificationAllowedError', 'NotFoundError',
  'NotSupportedError', 'InUseAttributeError', 'InvalidStateError', 'SyntaxError', 'InvalidModificationError', 'NamespaceError', 'InvalidAccessError', '',
  'TypeMismatchError', 'SecurityError', 'NetworkError', 'AbortError', 'URLMismatchError', 'QuotaExceededError', 'TimeoutError', 'InvalidNodeTypeError', 'DataCloneError'
];

export class DOMException extends Error {
  constructor(message = '', options = 'Error') {
    const withOptions = options !== null && typeof options === 'object';
    super(message, withOptions && 'cause' in options ? { cause: options.cause } : undefined);
    const name = `${withOptions ? options.name : options}`;
    Object.defineProperty(this, 'name', { value: name, writable: true, configurable: true });
    const frames = (this.stack ?? '').split('\n').slice(1).join('\n');
    Object.defineProperty(this, 'stack', { value: `${name}: ${this.message}${frames ? '\n' + frames : ''}`, writable: true, configurable: true });
  }

  get code() {
    return this.name === '' ? 0 : codeNames.indexOf(this.name) + 1;
  }
}

export const isDOMException = value => value instanceof DOMException;
