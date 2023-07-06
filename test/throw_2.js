// "CustomError: message"
throw new CustomError('message');

// note: this is actually wrong since CustomError is never defined, but we handle it anyway due to hack