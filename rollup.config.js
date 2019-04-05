import cjs from "rollup-plugin-cjs-es";
import resolve from "rollup-plugin-node-resolve";
import {terser} from "rollup-plugin-terser";

export default {
  input: "index.js",
  output: {
    format: "iife",
    file: "dist/idb-storage.min.js",
    name: "idbStorage"
  },
  plugins: [
    resolve(),
    cjs(),
    terser()
  ]
};
