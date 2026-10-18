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

The follow-up fixes cover full R2010+ table content, sized CadValue payloads, eight-byte XRecord handles, dimension association point references, R2018 MTEXT text frames, block representation ownership, inline SAT/SAB geometry and null owners/viewport colors. Legacy table-style round-trip metadata is migrated into the modern style instead of emitting an obsolete XRecord. Object serialization also avoids repeated queue shifts and duplicate handle writes.

Validation on Windows with ODA File Converter 27.9 and audit enabled:

| Inputs | Accepted without an error file |
| --- | --- |
| Original public DWG samples | 7 / 7 |
| Same-version rewrites, default and dynamic block configurations | 12 / 12 |
| Expanded target-version matrix, both configurations | 52 / 60 |

Run the expanded conversion check with:

```sh
node tools/check-dwg-oda.mjs "/path/to/ODAFileConverter" --matrix
```

The eight remaining matrix failures are `sample_AC1014` and `sample_AC1015` upgraded to AC1027 or AC1032, in both configurations. ODA reports an `AcDb3dSolid` modeling failure at handle D65. The matrix command intentionally exits unsuccessfully while these failures remain. AC1021 output is excluded as described above.

ODA acceptance is not proof of complete content preservation. Regression tests compare inline ACIS payloads for AC1018/AC1024 and original modern table content. R2013+ AcDs modeler storage still has reader limitations; objects rejected by the reader or skipped by the writer can be missing even from accepted output. The reporter's broader drawing collection, AEC/private objects, large-file performance and DXF entity omissions have not been validated here. Issue #11 remains open.

Set `ODA_FILE_CONVERTER` to the executable path when running tests to enable the optional same-version ODA regression check (build first).
