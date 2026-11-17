# megscriptvm

**megscriptvm** is a zero-dependency JavaScript library (ES modules, browsers and Node 18+) for
[megscript](https://megscriptvm.js.org/js.html) and the MegscriptVM server panel:

- **API client** (`MegscriptVM`): create, start, stop and watch megscript servers from code, including a
  **real-time player count** (`oyunculariIzle`).
- **Syntax tools**: tokenizer (`tokenla`), safe HTML highlighter (`renklendir`), language detection (`dilBul`) and
  Turkish ↔ English translation (`cevir`) of megscript code. The keyword table is generated from the megscript
  compiler's own source, and the translator is tested to match the compiler's `megc --biçimle --dil` output on every
  example file.

```js
import { MegscriptVM, renklendir, cevir } from "https://megscriptvm.js.org/megscriptvm-js/index.js";
```

- Documentation and live demo: https://megscriptvm.js.org/js.html
- MegscriptVM panel: https://megscriptvm.js.org/

This repository publishes the static site (panel UI + library). Account and server features of the panel need the
MegscriptVM API, which runs on our own server.
