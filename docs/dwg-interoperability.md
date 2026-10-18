# DWG interoperability validation

Issue [#11](https://github.com/node-projects/acad-ts/issues/11) reports ODA recovery failures that internal round trips did not detect.

The regression coverage now checks legacy EED string bytes against the ODA specification (chapter 28), TABLESTYLE row and cell layouts, and full consumption of VisualStyle data from the original R2010–R2018 samples. The writer also emits typed references for table styles, evaluation expressions and image reactors, and queues evaluation expressions for writing.

AC1021 (R2007) DWG output is unsupported. The previous implementation wrote an R2004 container with an R2007 signature; the reader's compatibility fallback hid that error during internal round trips. Writing now throws `CadNotSupportedException`. Reading R2007 DWG and reading/writing R2007 DXF remain supported. Choose AC1018 or AC1024 and later for DWG output.

To verify with an installed ODA File Converter:

```sh
npm run build
node tools/check-dwg-oda.mjs "/path/to/ODAFileConverter"
```

The check uses the public top-level samples, keeps unknown reader objects, and writes both default and dynamic-block configurations. Each run creates a fresh folder under `output/oda-check-*`, converts originals as a baseline, and enables ODA audit. Success requires an actual DXF and no error file for every input; the converter exit code alone is insufficient. Results are saved in `results.json`. Unknown objects that the writer cannot serialize are still subject to its existing skip policy.

To prepare files for testing on another machine:

```sh
node tools/check-dwg-oda.mjs --generate-only
```

These changes have not yet been certified against ODA. Internal tests and byte-layout checks do not establish that issue #11 is fully resolved. ODA validation across the reporter's drawing set, additional unsupported payloads, and the separately reported DXF entity omissions remain follow-up work.
