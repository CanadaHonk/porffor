// file url objects to posix paths, without the url parser
import { platform } from './host.js';
import { errInvalidUrlScheme, errInvalidFileUrlHost, errInvalidFileUrlPath } from './errors.js';

export const isURL = self => Boolean(self?.href && self.protocol && self.auth === undefined && self.path === undefined);

export const fileURLObjectToPath = url => {
  if (url.protocol !== 'file:') throw errInvalidUrlScheme('file');
  if (url.hostname !== '') throw errInvalidFileUrlHost(platform);
  const pathname = url.pathname;
  if (/%2f/i.test(pathname)) throw errInvalidFileUrlPath('must not include encoded / characters', url);
  return pathname.includes('%') ? decodeURIComponent(pathname) : pathname;
};
