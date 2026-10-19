# Legacy fixtures

`r13-native.dwg` contains a line from (1,2,3) to (4,5,6), a circle of radius 3
at (7,8,0), and the text `R13 sample`. It was generated from a programmatically
created acad-ts drawing and independently re-encoded as ACAD13 DWG using ODA
File Converter 27.9.0.0 on 2026-10-19. It contains no third-party drawing content.

The fixture tests the reader against the converter's R13 encoding, rather than
only testing an acad-ts writer/reader round trip. The source geometry is also
described in `tests/IO/DWG/DwgR13.test.ts`.

For repeatable writer interoperability checks, build the library and run:

```sh
node tools/check-legacy-formats-oda.mjs <path-to-ODAFileConverter>
```

The converter is not bundled or required for normal tests. The check uses fresh
directories, rejects converter error reports and missing output, and verifies
geometry, text, block references and polyline bulges after conversion.
