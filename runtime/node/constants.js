// node's deprecated constants module: os errno and signal constants with fs's
import { constants as os } from './os.js';
import { constants as fs } from './internal/fs/utils.js';

export default { ...os.errno, ...os.signals, ...os.priority, ...fs };
