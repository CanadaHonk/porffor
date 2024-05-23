import StaticAllocator from './static.js';
import GrowAllocator from './grow.js';

export default name => {
  switch (name) {
    case 'static': return new StaticAllocator();
    case 'grow': return new GrowAllocator();
    default: throw new Error(`unknown allocator: ${name}`);
  }
};