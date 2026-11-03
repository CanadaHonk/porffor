// https servers on uWebSockets: its openssl build, linked only by programs making them
import { _configureContext } from '../tls.js';
import * as uws from './uws.js';

Porffor.link`uws-ssl`;
Porffor.link`static openssl`;

Porffor.c`void *porf_uws_ssl_ctx(int app);`;

// an https app with the server's tls options
export const createApp = (server, options) => {
  const app = uws.createApp(false, server, true);
  let ctx = 0;
  Porffor.c`ctx = (f64)(u64)porf_uws_ssl_ctx((int)porf_jv_val(app));`;
  _configureContext(ctx, options, true);
  return app;
};
