# megscriptvm

**megscriptvm** is a zero-dependency JavaScript library (ES modules, browsers and Node 18+) for the
megscript programming language and MegscriptVM servers:

- **API client** (`MegscriptVM`): create, start, stop and watch megscript servers from code, including a
  **real-time player count** (`oyunculariIzle`).
- **Syntax tools**: tokenizer (`tokenla`), safe HTML highlighter (`renklendir`), language detection (`dilBul`) and
  Turkish ↔ English translation (`cevir`) of megscript code. The keyword table is generated from the megscript
  compiler's own source, and the translator is tested to match the compiler's `megc --biçimle --dil` output on every
  example file.

```js
import { MegscriptVM, renklendir, cevir } from "https://megscriptvm.js.org/megscriptvm-js/index.js";
```

Documentation and live demo: https://megscriptvm.js.org/ (source: `megscriptvm-js/`).
