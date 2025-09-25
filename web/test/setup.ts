// web/test/setup.ts
// Only needed if some file still compiles with the classic runtime.
import React from 'react';
(globalThis as any).React = React;
