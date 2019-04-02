import cjs from "rollup-plugin-cjs-es";
import {terser} from "rollup-plugin-terser";

export default {
  input: "index.js",
  output: {
    format: "iife",
    file: "dist/idb-storage.min.js",
    name: "idbStorage"
  },
  plugins: [
    cjs(),
    terser()
  ]
};
