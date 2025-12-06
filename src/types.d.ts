declare module 'cors' {
  import { RequestHandler } from 'express';
  const fn: () => RequestHandler;
  export default fn;
}
